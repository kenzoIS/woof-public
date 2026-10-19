const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

function isMissingTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'PGRST205' ||
    message.includes('could not find the table') ||
    message.includes('schema cache')
  );
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'N/A';
  return number <= 1 ? `${Math.round(number * 100)}%` : `${Math.round(number)}%`;
}

async function readAll(supabase, table) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new Error(`Could not read ${table}: ${error.message}`);
  }
  return data || [];
}

async function backfillDynamicPromos(supabase) {
  const rows = await readAll(supabase, 'dynamic_promos');
  const activeRows = rows.filter((row) =>
    ['approved', 'active'].includes(String(row.status || '').toLowerCase()),
  );
  const payloads = activeRows.map((promo) => {
    const metrics =
      promo.metrics && typeof promo.metrics === 'object' ? promo.metrics : {};
    const items = Array.isArray(metrics.items) ? metrics.items : [];
    const maxDiscount = Math.max(
      0,
      ...items.map((item) => Number(item.discountPercent || 0)),
    );
    return {
      category: 'happy_hour',
      prescription_key: `dynamic_promo:${promo.id}`,
      source_type: 'dynamic_promo',
      source_id: String(promo.id),
      title: 'Cafe Happy Hour Promo',
      description:
        items.length > 0
          ? items.map((item) => item.itemKey).filter(Boolean).join(', ')
          : null,
      sector: 'Cafe',
      target_time: promo.target_date || 'Happy Hour window',
      mechanic:
        maxDiscount > 0
          ? `Up to ${maxDiscount}% off select cafe items`
          : 'Happy Hour discount',
      confidence: percent(promo.probability_score),
      status: 'active',
      accepted_by: 'Owner',
      accepted_at: promo.created_at || new Date().toISOString(),
      deployed_at: promo.created_at || new Date().toISOString(),
      metadata: {
        sourceType: 'dynamic_promo',
        dynamicPromoId: promo.id,
        metrics,
        targetDate: promo.target_date,
        probabilityScore: promo.probability_score,
      },
      created_at: promo.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  if (payloads.length === 0) return { scanned: rows.length, inserted: 0 };
  const { error } = await supabase
    .from('active_prescriptions')
    .upsert(payloads, { onConflict: 'prescription_key' });
  if (error) {
    throw new Error(
      `Could not upsert dynamic promos into active_prescriptions: ${error.message}`,
    );
  }
  return { scanned: rows.length, inserted: payloads.length };
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');
  loadEnv(path.resolve(backendDir, '.env'));
  loadEnv(path.resolve(backendDir, '..', '.env'));

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const dynamicPromos = await backfillDynamicPromos(supabase);
  console.log(JSON.stringify({ activePrescriptionBackfill: { dynamicPromos } }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
