const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const mongoose = require('mongoose');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const equals = trimmed.indexOf('=');
    if (equals === -1) continue;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function normalizeStatus(value, fallback = 'pending') {
  const status = String(value || fallback).toLowerCase();
  return ['draft', 'pending', 'reviewed', 'rejected', 'deployed'].includes(
    status,
  )
    ? status
    : fallback;
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return number <= 1 ? `${Math.round(number * 100)}%` : `${Math.round(number)}%`;
}

function sourceId(value) {
  return value === undefined || value === null ? null : String(value);
}

async function upsertDrafts(supabase, rows) {
  if (rows.length === 0) return { count: 0, error: null };
  const { error } = await supabase
    .from('prescription_drafts')
    .upsert(rows, { onConflict: 'prescription_key' });
  return { count: rows.length, error };
}

async function backfillCampaignDrafts(supabase) {
  const { data, error } = await supabase
    .from('campaign_drafts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (
      error.code === 'PGRST205' ||
      message.includes('could not find the table') ||
      message.includes('schema cache')
    ) {
      return { scanned: 0, inserted: 0, skipped: 'campaign_drafts missing' };
    }
    throw new Error(`Could not read campaign_drafts: ${error.message}`);
  }

  const now = new Date().toISOString();
  const rows = (data || []).map((draft) => {
    const metrics =
      draft.metrics && typeof draft.metrics === 'object' ? draft.metrics : {};
    const itemA = draft.item_a || metrics.bundleItems?.[0] || 'Bundle item A';
    const itemB = draft.item_b || metrics.bundleItems?.[1] || 'Bundle item B';
    const discount =
      draft.selected_discount_percent ??
      draft.proposed_discount_percent ??
      draft.suggested_discount_percent;

    return {
      category: 'bundle',
      prescription_key: `campaign_draft:${draft.id}`,
      source_type: 'campaign_draft',
      source_id: sourceId(draft.id),
      title: draft.bundle_name || `${itemA} + ${itemB}`,
      description: `${itemA} + ${itemB}`,
      sector:
        metrics.itemASector || metrics.itemBSector
          ? [metrics.itemASector, metrics.itemBSector]
              .filter(Boolean)
              .join(' + ')
          : 'Cafe + Services',
      target_time: null,
      mechanic:
        discount !== undefined && discount !== null
          ? `${discount}% bundle discount`
          : null,
      confidence: percent(metrics.confidence),
      status: normalizeStatus(draft.status, 'pending'),
      generated_by: 'Owner',
      metadata: {
        sourceType: metrics.sourceType || 'bundle_recommendation',
        campaignDraftId: draft.id,
        campaignDraft: draft,
      },
      generated_at: draft.created_at || now,
      created_at: draft.created_at || now,
      updated_at: now,
    };
  });

  const result = await upsertDrafts(supabase, rows);
  if (result.error) {
    throw new Error(
      `Could not upsert campaign_drafts into prescription_drafts: ${result.error.message}`,
    );
  }
  return { scanned: data?.length || 0, inserted: result.count };
}

async function readActivationDrafts() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { rows: [], skipped: 'MONGODB_URI missing' };

  const dbName = process.env.MONGODB_DB || 'woof_staging';
  await mongoose.connect(uri, {
    dbName,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  const collectionNames = collections.map((item) => item.name);
  const campaignCollection =
    collectionNames.find((name) => name === 'campaignactivations') ||
    collectionNames.find((name) => name === 'campaign_activations') ||
    collectionNames.find((name) => /campaign.*activation/i.test(name));

  if (!campaignCollection) {
    await mongoose.disconnect();
    return { rows: [], skipped: 'CampaignActivation collection missing' };
  }

  const campaigns = await db
    .collection(campaignCollection)
    .find({ status: 'draft' })
    .sort({ createdAt: -1 })
    .toArray();

  await mongoose.disconnect();
  return { rows: campaigns, collection: campaignCollection };
}

async function backfillActivationDrafts(supabase) {
  const result = await readActivationDrafts();
  if (result.skipped) {
    return { scanned: 0, inserted: 0, skipped: result.skipped };
  }

  const now = new Date().toISOString();
  const rows = result.rows.map((campaign) => {
    const analyticsContext =
      campaign.analyticsContext && typeof campaign.analyticsContext === 'object'
        ? campaign.analyticsContext
        : {};
    return {
      category: 'pethub_campaign',
      prescription_key: `activation_campaign:${campaign.campaignId}`,
      source_type: 'activation_campaign',
      source_id: sourceId(campaign.campaignId),
      title:
        campaign.title ||
        campaign.generatedAssets?.headline ||
        'PetHub Campaign Draft',
      description:
        campaign.generatedAssets?.shortCaption ||
        campaign.generatedAssets?.longCaption ||
        null,
      sector: 'PetHub',
      target_time: 'PetHub campaign window',
      mechanic:
        campaign.promoMechanic ||
        campaign.pethubPayload?.promoMechanic ||
        'PetHub offer',
      confidence:
        analyticsContext.confidence ||
        analyticsContext.confidenceScore ||
        'N/A',
      status: 'draft',
      generated_by: 'Owner',
      metadata: {
        sourceType: 'activation_campaign',
        campaignId: campaign.campaignId,
        sourceRecommendationId: campaign.sourceRecommendationId,
        pethubPayload: campaign.pethubPayload || {},
      },
      generated_at: campaign.createdAt || now,
      created_at: campaign.createdAt || now,
      updated_at: now,
    };
  });

  const upsert = await upsertDrafts(supabase, rows);
  if (upsert.error) {
    throw new Error(
      `Could not upsert activation drafts into prescription_drafts: ${upsert.error.message}`,
    );
  }

  return {
    scanned: result.rows.length,
    inserted: upsert.count,
    collection: result.collection,
  };
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  loadEnv(path.resolve(backendDir, '.env'));
  loadEnv(path.resolve(backendDir, '..', '.env'));

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const campaignDrafts = await backfillCampaignDrafts(supabase);
  const activationDrafts = await backfillActivationDrafts(supabase);

  console.log(
    JSON.stringify(
      {
        prescriptionDraftBackfill: {
          campaignDrafts,
          activationDrafts,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
