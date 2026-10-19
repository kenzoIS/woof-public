import { BadRequestException,
  BadGatewayException,
  Injectable,
  Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { Model } from 'mongoose';
import { AnalyticsService } from '../analytics/analytics.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { RealtimeService } from '../realtime/realtime.service';
import { AuditService } from '../audit/audit.service';
import {
  CampaignActivation,
  CampaignActivationDocument,
} from './schemas/campaign-activation.schema';

type CampaignStatus =
  | 'draft'
  | 'approved'
  | 'queued'
  | 'published'
  | 'completed';

interface GeneratedCampaignAssets {
  headline: string;
  shortCaption: string;
  longCaption: string;
  callToAction: string;
  pushNotification: string;
  petHubBannerText: string;
  termsAndConditions: string[];
  pubmatPrompt: string;
  campaignImageUrl?: string;
}

interface PetHubCampaignPayload {
  title: string;
  subtitle: string;
  description: string;
  campaignImageUrl: string;
  ctaText: string;
  promoMechanic: string;
  targetSegment: string;
  source: string;
  sortOrder: number;
  isActive: boolean;
  id?: string;
  campaignId?: string;
  campaign_id?: string;
  remoteId?: string;
  remote_id?: string;
  pethubId?: string;
  pethub_id?: string;
  publishedAt?: string;
}

interface ActivationRecommendation {
  id: string;
  source: string;
  title: string;
  featuredItems: string[];
  promoMechanic: string;
  targetSegment: string;
  expectedLift: string;
  confidence: string;
  reason: string;
  analyticsContext: Record<string, unknown>;
}

@Injectable()
export class ActivationService {
  private readonly logger = new Logger(ActivationService.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly supabaseService: SupabaseService,
    private readonly realtimeService: RealtimeService,
    private readonly auditService: AuditService,
    @Optional()
    @InjectModel(CampaignActivation.name)
    private readonly campaignModel: Model<CampaignActivationDocument>,
  ) {}

  async getActivationRecommendations() {
    const dateWindow = await this.resolveLatestActivationWindow();
    const [crossSell, home] = await Promise.all([
      this.withTimeout(
        this.analyticsService.getCrossSellBundles({
          minSupport: '0.05',
          minConfidence: '0.4',
          minLift: '1.1',
          maxBundleCandidates: '8',
          ...(dateWindow || {}),
        }),
        5_000,
        {
          bundleCandidates: [],
          warning:
            'Cross-sell recommendations timed out; showing forecast/KPI recommendations only.',
        },
      ),
      this.withTimeout(this.analyticsService.getHomeOverview('week'), 5_000, {
        suggestions: [],
      }),
    ]);

    const bundleRecommendations = this.mapBundleRecommendations(
      crossSell.bundleCandidates || [],
    );
    const homeRecommendations = this.mapHomeRecommendations(
      home.suggestions || [],
    );

    return {
      recommendations: [...bundleRecommendations, ...homeRecommendations].slice(
        0,
        10,
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  private async resolveLatestActivationWindow(): Promise<{
    dateStart: string;
    dateEnd: string;
  } | null> {
    try {
      const range = await this.analyticsService.getDataRange();
      const end = String(range?.historyEndDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) {
        return null;
      }

      const startDate = new Date(`${end}T00:00:00.000Z`);
      startDate.setUTCDate(startDate.getUTCDate() - 6);
      const start = startDate.toISOString().slice(0, 10);
      const min = String(range?.historyStartDate || '').slice(0, 10);

      return {
        dateStart: min && start < min ? min : start,
        dateEnd: end,
      };
    } catch {
      return null;
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    fallback: T,
  ): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timeout = setTimeout(() => resolve(fallback), timeoutMs);
        }),
      ]);
    } catch {
      return fallback;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async getCampaigns() {
    const campaigns = await this.campaignModel
      .find()
      .sort({ createdAt: -1 })
      .limit(30)
      .lean()
      .exec();
    return { campaigns };
  }

  async getFeedbackCampaigns() {
    const campaigns = await this.campaignModel
      .find({ status: { $in: ['approved', 'queued', 'published', 'completed'] } })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean()
      .exec();

    return campaigns.map((campaign: any) => ({
      id: `activation-${campaign.campaignId}`,
      sourceType: 'activation_campaign',
      sourceId: campaign.campaignId,
      type: this.inferFeedbackType(campaign),
      title: campaign.title || campaign.generatedAssets?.headline || 'PetHub Campaign',
      deployedDate: campaign.createdAt
        ? new Date(campaign.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'N/A',
      targetTime: 'PetHub campaign window',
      discount: campaign.promoMechanic || campaign.pethubPayload?.promoMechanic || 'PetHub offer',
      predictedLift:
        campaign.analyticsContext?.expectedLift ||
        campaign.analyticsContext?.lift ||
        'N/A',
      actualLift: campaign.analyticsContext?.actualLift || null,
      confidence:
        campaign.analyticsContext?.confidence ||
        campaign.analyticsContext?.confidenceScore ||
        'N/A',
      sector: this.inferCampaignSector(this.rebuildRecommendationFromCampaign(campaign)),
      status: campaign.status === 'completed' ? 'completed' : 'active',
      feedback: campaign.analyticsContext?.feedback || null,
      feedbackNotes: campaign.analyticsContext?.feedbackNotes || null,
      pethubLinked: campaign.status === 'published',
      pethubStatus: campaign.status,
    }));
  }

  async endCampaignForFeedback(campaignId: string, feedback?: string) {
    const campaign = await this.campaignModel
      .findOne({ campaignId })
      .lean()
      .exec();
    if (!campaign) {
      return { status: 'not_found' };
    }

    const takedown = await this.deactivatePetHubCampaign(campaign);
    const analyticsContext = {
      ...(campaign.analyticsContext || {}),
      feedback: feedback || campaign.analyticsContext?.feedback || null,
      endedAt: new Date().toISOString(),
      pethubTakedown: takedown,
    };
    const pethubPayload = {
      ...(campaign.pethubPayload || {}),
      isActive: false,
    };

    const updated = await this.campaignModel
      .findOneAndUpdate(
        { campaignId },
        {
          status: 'completed',
          analyticsContext,
          pethubPayload,
        },
        { new: true },
      )
      .lean()
      .exec();

    await this.upsertActivePrescriptionForCampaign(updated);
    await this.markPrescriptionDraftStatus(
      `activation_campaign:${updated?.campaignId}`,
      'deployed',
    );

    void this.auditService.record({
      actor: 'Owner',
      actorType: 'user',
      action: 'Ended feedback campaign',
      module: 'campaign_activation',
      category: 'workflow',
      target: campaign.title || campaignId,
      stateBefore: campaign.status,
      stateAfter: 'Completed',
      metadata: { campaignId, takedown },
    });

    return { status: 'completed', campaign: updated, takedown };
  }

  async generateCampaign(body: Record<string, unknown>) {
    const recommendation = this.normalizeRecommendation(body);
    const campaignId = `CMP-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)
      .toUpperCase()}`;
    const generatedAssets = await this.generateAssetsWithClaude(recommendation);
    const campaignImageUrl = await this.generateAndStoreCampaignImage(
      campaignId,
      recommendation,
      generatedAssets,
    );
    generatedAssets.campaignImageUrl = campaignImageUrl || undefined;
    const pethubPayload = this.buildPetHubPayload(
      campaignId,
      recommendation,
      generatedAssets,
    );

    const campaign = await this.campaignModel.create({
      campaignId,
      source: recommendation.source,
      sourceRecommendationId: recommendation.id,
      title: recommendation.title,
      promoMechanic: recommendation.promoMechanic,
      featuredItems: recommendation.featuredItems,
      targetSegment: recommendation.targetSegment,
      status: 'draft',
      analyticsContext: recommendation.analyticsContext,
      generatedAssets,
      pethubPayload,
    });

    await this.upsertPrescriptionDraftForCampaign(campaign);

    return { campaign };
  }

  async publishCampaignToPetHub(
    campaignId: string,
    actor = 'Owner',
    actorType: 'user' | 'system' = 'user',
  ) {
    const endpoint = this.getPetHubCampaignsEndpoint();
    if (!endpoint) {
      throw new BadRequestException(
        'PETHUB_CAMPAIGNS_ENDPOINT or PETHUB_API_BASE_URL must be configured',
      );
    }

    let campaign = await this.campaignModel
      .findOne({ campaignId })
      .lean()
      .exec();
    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }
    if (campaign.status !== 'queued') {
      throw new BadRequestException(
        'Campaign must be approved and queued before publishing',
      );
    }
    const campaignTitle = String(campaign.title || 'Campaign');

    this.realtimeService.emit({
      type: 'campaign_publish_started',
      title: 'PetHub publish started',
      message: `${campaignTitle} is being sent to PetHub.`,
      campaignId,
    });

    try {
      const publishableCampaign = await this.ensureCampaignHasImage(campaign);
      const payload = this.buildPublishPayload(publishableCampaign);
      const token = process.env.PETHUB_API_TOKEN;
      const response = await this.postPetHubCampaign(endpoint, payload, token);
      const remoteReference = this.extractPetHubCampaignReference(
        response.data,
        campaignId,
      );
      const publishedPayload = {
        ...(publishableCampaign.pethubPayload || {}),
        ...payload,
        ...remoteReference.payload,
        isActive: true,
        publishedAt: new Date().toISOString(),
      };
      const publishedAnalyticsContext = {
        ...(publishableCampaign.analyticsContext || {}),
        pethubPublishedAt: publishedPayload.publishedAt,
        pethubRemoteId: remoteReference.id,
        pethubPublishResponse: this.compactRemoteResponse(response.data),
      };

      const updated = await this.campaignModel
        .findOneAndUpdate(
          { campaignId },
          {
            status: 'published',
            pethubPayload: publishedPayload,
            analyticsContext: publishedAnalyticsContext,
          },
          { new: true },
        )
        .lean()
        .exec();

      await this.upsertActivePrescriptionForCampaign(updated);

      void this.auditService.record({
        actor,
        actorType,
        action: 'Pushed campaign to PetHub',
        module: 'campaign_activation',
        category: actorType === 'user' ? 'workflow' : 'ai_system',
        target: campaignTitle,
        stateBefore: 'Queued',
        stateAfter: 'Published',
        metadata: { campaignId, pethubRemoteId: remoteReference.id },
      });

      this.realtimeService.emit({
        type: 'campaign_published',
        title: 'Campaign published',
        message: `${campaignTitle} is now live in PetHub.`,
        campaignId,
      });

      return {
        campaign: updated,
        pethubResponse: response.data,
      };
    } catch (error) {
      void this.auditService.record({
        actor,
        actorType,
        action: 'Failed to push campaign to PetHub',
        module: 'campaign_activation',
        category: actorType === 'user' ? 'workflow' : 'ai_system',
        target: campaignTitle,
        stateBefore: 'Queued',
        stateAfter: 'Publish failed',
        metadata: {
          campaignId,
          error: error instanceof Error ? error.message : String(error),
        },
        status: 'failed',
      });
      this.realtimeService.emit({
        type: 'campaign_publish_failed',
        title: 'PetHub publish failed',
        message: error instanceof Error ? error.message : String(error),
        campaignId,
      });
      throw error;
    }
  }

  private async ensureCampaignHasImage(campaign: any) {
    const existingUrl = this.resolveCampaignImageUrl(campaign);
    if (existingUrl) {
      return campaign;
    }

    const generatedAssets = {
      ...(campaign.generatedAssets || {}),
    } as GeneratedCampaignAssets;
    const recommendation = this.rebuildRecommendationFromCampaign(campaign);
    const campaignImageUrl = await this.generateAndStoreCampaignImage(
      campaign.campaignId,
      recommendation,
      generatedAssets,
    );

    if (!campaignImageUrl) {
      throw new BadGatewayException(
        'Campaign image was not generated. Check SUPABASE_CAMPAIGN_BUCKET and that the Supabase bucket is public before publishing to PetHub.',
      );
    }

    const updatedAssets = {
      ...(campaign.generatedAssets || {}),
      pubmatPrompt: generatedAssets.pubmatPrompt,
      campaignImageUrl,
    };
    const updatedPayload = {
      ...(campaign.pethubPayload || {}),
      campaignImageUrl,
    };

    const updated = await this.campaignModel
      .findOneAndUpdate(
        { campaignId: campaign.campaignId },
        {
          generatedAssets: updatedAssets,
          pethubPayload: updatedPayload,
        },
        { new: true },
      )
      .lean()
      .exec();

    return (
      updated || {
        ...campaign,
        generatedAssets: updatedAssets,
        pethubPayload: updatedPayload,
      }
    );
  }

  private resolveCampaignImageUrl(campaign: any): string {
    return this.safeString(
      campaign?.generatedAssets?.campaignImageUrl,
      campaign?.pethubPayload?.campaignImageUrl ||
        campaign?.pethubPayload?.campaign_image_url ||
        '',
    );
  }

  private rebuildRecommendationFromCampaign(
    campaign: any,
  ): ActivationRecommendation {
    return {
      id: String(campaign.sourceRecommendationId || campaign.campaignId),
      source: String(campaign.source || 'campaign_activation'),
      title: String(campaign.title || 'WOOF Recommended Campaign'),
      featuredItems: Array.isArray(campaign.featuredItems)
        ? campaign.featuredItems.map(String)
        : [String(campaign.title || 'Happy Tails offer')],
      promoMechanic: String(
        campaign.promoMechanic ||
          campaign.pethubPayload?.promoMechanic ||
          'Featured PetHub placement',
      ),
      targetSegment: String(
        campaign.targetSegment ||
          campaign.pethubPayload?.targetSegment ||
          'Pet owners',
      ),
      expectedLift: 'N/A',
      confidence: 'N/A',
      reason: String(
        campaign.analyticsContext?.reason || 'Generated from WOOF analytics.',
      ),
      analyticsContext:
        typeof campaign.analyticsContext === 'object' &&
        campaign.analyticsContext
          ? campaign.analyticsContext
          : {},
    };
  }

  async updateCampaignStatus(
    campaignId: string,
    status: CampaignStatus,
    actor = 'Owner',
  ) {
    if (!['draft', 'approved', 'queued', 'published', 'completed'].includes(status)) {
      throw new BadRequestException('Invalid campaign status');
    }
    const current = await this.campaignModel
      .findOne({ campaignId })
      .lean()
      .exec();
    if (!current) {
      throw new BadRequestException('Campaign not found');
    }
    this.assertValidStatusTransition(current.status, status);

    const campaign = await this.campaignModel
      .findOneAndUpdate({ campaignId }, { status }, { new: true })
      .lean()
      .exec();
    if (!campaign) {
      throw new BadRequestException('Campaign not found');
    }
    void this.auditService.record({
      actor,
      actorType: 'user',
      action: `Changed campaign status to ${status}`,
      module: 'campaign_activation',
      category: 'workflow',
      target: campaign.title || campaignId,
      stateBefore: current.status,
      stateAfter: status,
      metadata: { campaignId },
    });
    await this.upsertActivePrescriptionForCampaign(campaign);
    await this.markPrescriptionDraftStatus(
      `activation_campaign:${campaign.campaignId}`,
      status === 'completed' ? 'deployed' : 'reviewed',
    );
    return { campaign };
  }

  private async upsertActivePrescriptionForCampaign(campaign: any) {
    if (!campaign || campaign.status === 'draft') return;

    const status =
      campaign.status === 'completed'
        ? 'completed'
        : ['approved', 'queued', 'published'].includes(campaign.status)
          ? 'active'
          : 'failed';

    const payload = {
      category: 'pethub_campaign',
      prescription_key: `activation_campaign:${campaign.campaignId}`,
      source_type: 'activation_campaign',
      source_id: campaign.campaignId,
      title:
        campaign.title ||
        campaign.generatedAssets?.headline ||
        'PetHub Campaign',
      description:
        campaign.generatedAssets?.shortCaption ||
        campaign.generatedAssets?.longCaption ||
        null,
      sector: this.inferCampaignSector(
        this.rebuildRecommendationFromCampaign(campaign),
      ),
      target_time: 'PetHub campaign window',
      mechanic:
        campaign.promoMechanic ||
        campaign.pethubPayload?.promoMechanic ||
        'PetHub offer',
      confidence:
        campaign.analyticsContext?.confidence ||
        campaign.analyticsContext?.confidenceScore ||
        'N/A',
      status,
      accepted_by: 'Owner',
      accepted_at: campaign.updatedAt || new Date().toISOString(),
      deployed_at: campaign.updatedAt || new Date().toISOString(),
      ended_at: campaign.status === 'completed' ? new Date().toISOString() : null,
      metadata: {
        sourceType: 'activation_campaign',
        campaignId: campaign.campaignId,
        pethubLinked: campaign.status === 'published',
        pethubStatus: campaign.status,
        pethubPayload: campaign.pethubPayload || {},
      },
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.supabaseService.client
      .from('active_prescriptions')
      .upsert(payload, { onConflict: 'prescription_key' });

    if (error && !this.isMissingSupabaseTableError(error)) {
      this.logger.warn(
        `Failed to upsert active prescription for campaign ${campaign.campaignId}: ${error.message}`,
      );
    }
  }

  private async upsertPrescriptionDraftForCampaign(campaign: any) {
    if (!campaign || campaign.status !== 'draft') return;

    const payload = {
      category: 'pethub_campaign',
      prescription_key: `activation_campaign:${campaign.campaignId}`,
      source_type: 'activation_campaign',
      source_id: campaign.campaignId,
      title:
        campaign.title ||
        campaign.generatedAssets?.headline ||
        'PetHub Campaign Draft',
      description:
        campaign.generatedAssets?.shortCaption ||
        campaign.generatedAssets?.longCaption ||
        null,
      sector: this.inferCampaignSector(
        this.rebuildRecommendationFromCampaign(campaign),
      ),
      target_time: 'PetHub campaign window',
      mechanic:
        campaign.promoMechanic ||
        campaign.pethubPayload?.promoMechanic ||
        'PetHub offer',
      confidence:
        campaign.analyticsContext?.confidence ||
        campaign.analyticsContext?.confidenceScore ||
        'N/A',
      status: 'draft',
      generated_by: 'Owner',
      metadata: {
        sourceType: 'activation_campaign',
        campaignId: campaign.campaignId,
        sourceRecommendationId: campaign.sourceRecommendationId,
        pethubPayload: campaign.pethubPayload || {},
      },
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.supabaseService.client
      .from('prescription_drafts')
      .upsert(payload, { onConflict: 'prescription_key' });

    if (error && !this.isMissingSupabaseTableError(error)) {
      this.logger.warn(
        `Failed to upsert prescription draft for campaign ${campaign.campaignId}: ${error.message}`,
      );
    }
  }

  private async markPrescriptionDraftStatus(
    prescriptionKey: string,
    status: 'reviewed' | 'deployed' | 'rejected',
  ) {
    const { error } = await this.supabaseService.client
      .from('prescription_drafts')
      .update({
        status,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('prescription_key', prescriptionKey);

    if (error && !this.isMissingSupabaseTableError(error)) {
      this.logger.warn(
        `Failed to update prescription draft ${prescriptionKey}: ${error.message}`,
      );
    }
  }

  private isMissingSupabaseTableError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
      error?.code === 'PGRST205' ||
      message.includes('could not find the table') ||
      message.includes('schema cache')
    );
  }

  private assertValidStatusTransition(
    currentStatus: CampaignStatus,
    nextStatus: CampaignStatus,
  ) {
    if (currentStatus === nextStatus) {
      return;
    }

    const allowedTransitions: Record<CampaignStatus, CampaignStatus[]> = {
      draft: ['approved'],
      approved: ['queued'],
      queued: ['published'],
      published: ['completed'],
      completed: [],
    };

    if (!allowedTransitions[currentStatus]?.includes(nextStatus)) {
      throw new BadRequestException(
        `Invalid campaign transition from ${currentStatus} to ${nextStatus}`,
      );
    }
  }

  private mapBundleRecommendations(items: any[]): ActivationRecommendation[] {
    return items.map((item, index) => {
      const anchor = item.anchorItem || item.itemA || 'Featured item';
      const bundle = item.bundleItem || item.itemB || 'Recommended pair';
      const score = Math.round(Number(item.opportunityScore || 0));
      return {
        id: `bundle-${index + 1}-${this.slug(anchor)}-${this.slug(bundle)}`,
        source: 'market_basket_analysis',
        title: `${anchor} + ${bundle}`,
        featuredItems: [anchor, bundle],
        promoMechanic: this.suggestMechanic(item),
        targetSegment: item.crossSector
          ? 'Cross-sector PetHub shoppers'
          : 'PetHub shoppers with matching purchase intent',
        expectedLift: `${Math.max(8, Math.round(Number(item.lift || 1) * 12))}% engagement lift`,
        confidence: `${Math.round(Number(item.confidence || 0) * 100)}%`,
        reason:
          item.reason ||
          `${anchor} can be used to expose customers to the slower-moving ${bundle}.`,
        analyticsContext: {
          support: item.pairSupport,
          confidence: item.confidence,
          lift: item.lift,
          opportunityScore: score,
          source: 'FP-Growth / market basket analysis',
        },
      };
    });
  }

  private mapHomeRecommendations(items: any[]): ActivationRecommendation[] {
    return items.map((item: any) => ({
      id: `home-${item.id || this.slug(item.title)}`,
      source: 'forecast_and_kpi_recommendation',
      title: item.title || 'WOOF Recommended Campaign',
      featuredItems: [String(item.title || '').replace(/^Promote\s+/i, '')],
      promoMechanic: item.discount || 'Featured PetHub placement',
      targetSegment: 'PetHub customers in the next high-intent sales window',
      expectedLift: item.expectedLift || 'Projected lift unavailable',
      confidence: item.confidence || 'N/A',
      reason:
        item.reason ||
        item.detailedExplanation ||
        'WOOF recommended this action.',
      analyticsContext: {
        trigger: item.trigger,
        detailedExplanation: item.detailedExplanation,
        source: 'Home overview recommendation',
      },
    }));
  }

  private async generateAssetsWithClaude(
    recommendation: ActivationRecommendation,
  ): Promise<GeneratedCampaignAssets> {
    const fallback = this.generateFallbackAssets(recommendation);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return fallback;
    }

    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest',
          max_tokens: 1200,
          temperature: 0.7,
          system:
            'You generate concise, brand-safe Happy Tails / PetHub campaign materials. Return only valid JSON with no markdown. Do not invent prices, customer names, competitor names, medical claims, guaranteed outcomes, or unverifiable claims.',
          messages: [
            {
              role: 'user',
              content: this.buildClaudePrompt(recommendation),
            },
          ],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          timeout: 20000,
        },
      );

      const text = this.extractAnthropicText(response.data);
      const parsed = this.parseJsonObject(text);
      return this.normalizeGeneratedAssets(parsed, fallback);
    } catch (error) {
      return fallback;
    }
  }

  private generateFallbackAssets(
    recommendation: ActivationRecommendation,
  ): GeneratedCampaignAssets {
    const items = recommendation.featuredItems.filter(Boolean);
    const primary = items[0] || 'Happy Tails favorite';
    const pair = items.length > 1 ? items.join(' + ') : primary;
    const savings = this.extractDiscount(recommendation.promoMechanic);
    const cta =
      recommendation.source === 'market_basket_analysis'
        ? 'Claim Bundle'
        : 'View Offer';

    return {
      headline: this.customerHeadline(recommendation, primary),
      shortCaption: `${primary} is featured on PetHub for a limited time. ${savings}`,
      longCaption: `Discover a Happy Tails pick made for pet parents. Check this PetHub offer and enjoy an easier way to shop or book for your pet.`,
      callToAction: cta,
      pushNotification: `New Happy Tails offer: ${pair}. ${cta} today on PetHub.`,
      petHubBannerText: this.customerHighlight(recommendation, pair),
      termsAndConditions: [
        'Offer validity and redemption limits are configurable before publishing.',
        'Promo availability may depend on inventory, appointment slots, or service capacity.',
        'Final approval is required before pushing this campaign to PetHub.',
      ],
      pubmatPrompt: this.buildCampaignImagePrompt(
        recommendation,
        `Create a polished promotional campaign image for "${pair}". Emphasize ${recommendation.promoMechanic}. Use a clear ${cta} call-to-action area.`,
      ),
    };
  }

  private buildClaudePrompt(recommendation: ActivationRecommendation) {
    return [
      'Generate campaign materials for a WOOF Offers campaign in PetHub from this WOOF promo recommendation.',
      'Use friendly customer-facing Happy Tails wording for pet owners.',
      'Do not mention analytics, forecasts, inventory, staffing, operational action, KPIs, market basket analysis, or WOOF internals.',
      'Do not invent prices, customer names, competitor names, medical claims, guaranteed outcomes, or unverifiable claims.',
      'Use short copy that fits a homepage campaign card. Prefer simple retail/pet-care language.',
      'The pubmatPrompt must include the required Happy Tails PetHub brand context and visual style below.',
      this.requiredCampaignImageContext(),
      'Return exactly this JSON shape:',
      JSON.stringify({
        headline: 'string, max 42 chars, 3-6 words',
        shortCaption: 'string, max 100 chars',
        longCaption: 'string, max 150 chars',
        callToAction: 'string, 2-4 words',
        pushNotification: 'string, max 90 chars',
        petHubBannerText: 'string, max 34 chars, button-like label',
        termsAndConditions: ['string, max 80 chars', 'string, max 80 chars'],
        pubmatPrompt: 'string prompt for an image/pubmat generator',
      }),
      'WOOF recommendation:',
      JSON.stringify(recommendation),
    ].join('\n');
  }

  private buildPetHubPayload(
    campaignId: string,
    recommendation: ActivationRecommendation,
    generatedAssets: GeneratedCampaignAssets,
  ): PetHubCampaignPayload {
    return {
      title: this.limitText(generatedAssets.headline, 42),
      subtitle: this.limitText(generatedAssets.shortCaption, 100),
      description: this.limitText(generatedAssets.longCaption, 150),
      campaignImageUrl: generatedAssets.campaignImageUrl || '',
      ctaText: this.limitText(generatedAssets.callToAction, 24),
      promoMechanic: this.limitText(recommendation.promoMechanic, 120),
      targetSegment: this.limitText(recommendation.targetSegment, 80),
      source: 'WOOF',
      sortOrder: 0,
      isActive: false,
    };
  }

  private buildPublishPayload(campaign: any): PetHubCampaignPayload {
    const assets = campaign.generatedAssets || {};
    const payload = campaign.pethubPayload || {};
    return {
      title: this.limitText(
        this.safeString(assets.headline, payload.title || campaign.title),
        42,
      ),
      subtitle: this.limitText(
        this.safeString(
          assets.shortCaption,
          payload.subtitle || payload.note || '',
        ),
        100,
      ),
      description: this.limitText(
        this.safeString(assets.longCaption, payload.description || ''),
        150,
      ),
      campaignImageUrl: this.safeString(
        assets.campaignImageUrl,
        payload.campaignImageUrl || payload.campaign_image_url || '',
      ),
      ctaText: this.limitText(
        this.safeString(
          assets.callToAction,
          payload.ctaText || payload.cta_text || 'View Offer',
        ),
        24,
      ),
      promoMechanic: this.limitText(
        this.safeString(
          campaign.promoMechanic,
          payload.promoMechanic ||
            payload.promo_mechanic ||
            'Featured PetHub placement',
        ),
        120,
      ),
      targetSegment: this.limitText(
        this.safeString(
          campaign.targetSegment,
          payload.targetSegment || payload.target_segment || 'Pet owners',
        ),
        80,
      ),
      source: 'WOOF',
      sortOrder: Number(payload.sortOrder ?? payload.sort_order ?? 0),
      isActive: true,
    };
  }

  private async deactivatePetHubCampaign(campaign: any) {
    if (campaign.status !== 'published') {
      return { status: 'skipped', reason: 'Campaign is not published to PetHub.' };
    }

    const endpoint = this.getPetHubTakedownEndpoint(campaign);
    if (!endpoint) {
      return {
        status: 'skipped',
        reason:
          'PETHUB_CAMPAIGNS_ENDPOINT, PETHUB_CAMPAIGN_TAKEDOWN_ENDPOINT, or PETHUB_API_BASE_URL is not configured.',
      };
    }

    const method = this.getPetHubTakedownMethod();
    const body = {
      isActive: false,
      status: 'inactive',
      source: 'WOOF',
      endedAt: new Date().toISOString(),
      woofCampaignId: campaign.campaignId,
    };
    const headers = {
      'Content-Type': 'application/json',
      ...(process.env.PETHUB_API_TOKEN
        ? { Authorization: `Bearer ${process.env.PETHUB_API_TOKEN}` }
        : {}),
    };

    try {
      if (method === 'DELETE') {
        await axios.delete(endpoint, {
          headers,
          data: body,
          timeout: 15000,
        });
      } else if (method === 'POST') {
        await axios.post(endpoint, body, {
          headers,
          timeout: 15000,
        });
      } else {
        await axios.patch(endpoint, body, {
          headers,
          timeout: 15000,
        });
      }

      return {
        status: 'deactivated',
        method,
        endpoint,
        remoteId: this.resolvePetHubRemoteId(campaign),
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? this.extractRemoteErrorMessage(error.response?.data) || error.message
        : error instanceof Error
          ? error.message
          : 'Unknown PetHub takedown error';
      this.logger.warn(`PetHub campaign takedown failed for ${campaign.campaignId}: ${message}`);
      return {
        status: 'failed',
        method,
        endpoint,
        remoteId: this.resolvePetHubRemoteId(campaign),
        message,
      };
    }
  }

  private extractPetHubCampaignReference(
    responseData: unknown,
    fallbackId: string,
  ): { id: string; payload: Partial<PetHubCampaignPayload> } {
    const candidates = this.collectPetHubResponseObjects(responseData);
    const id =
      candidates
        .map((item) =>
          this.firstString(
            item.id,
            item.campaignId,
            item.campaign_id,
            item.remoteId,
            item.remote_id,
            item.pethubId,
            item.pethub_id,
          ),
        )
        .find(Boolean) || fallbackId;

    return {
      id,
      payload: {
        id,
        campaignId: id,
        campaign_id: id,
        remoteId: id,
        remote_id: id,
        pethubId: id,
        pethub_id: id,
      },
    };
  }

  private collectPetHubResponseObjects(value: unknown): Record<string, unknown>[] {
    if (!value || typeof value !== 'object') return [];
    const body = value as Record<string, unknown>;
    const nested = [body.campaign, body.data, body.result]
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
    return [body, ...nested];
  }

  private compactRemoteResponse(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object') return null;
    const body = value as Record<string, unknown>;
    const campaign = this.collectPetHubResponseObjects(body)[0] || {};
    return {
      id: this.firstString(
        campaign.id,
        campaign.campaignId,
        campaign.campaign_id,
        campaign.remoteId,
        campaign.remote_id,
        campaign.pethubId,
        campaign.pethub_id,
      ),
      status: this.firstString(campaign.status, body.status),
      message: this.firstString(campaign.message, body.message),
    };
  }

  private firstString(...values: unknown[]): string | undefined {
    return values.find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )?.trim();
  }

  private resolvePetHubRemoteId(campaign: any): string {
    return this.safeString(
      campaign.pethubPayload?.remoteId ||
        campaign.pethubPayload?.remote_id ||
        campaign.pethubPayload?.pethubId ||
        campaign.pethubPayload?.pethub_id ||
        campaign.pethubPayload?.campaignId ||
        campaign.pethubPayload?.campaign_id ||
        campaign.pethubPayload?.id ||
        campaign.analyticsContext?.pethubRemoteId,
      campaign.campaignId,
    );
  }

  private getPetHubTakedownMethod(): 'PATCH' | 'POST' | 'DELETE' {
    const configured = String(
      process.env.PETHUB_CAMPAIGN_TAKEDOWN_METHOD || 'PATCH',
    )
      .trim()
      .toUpperCase();
    if (configured === 'DELETE' || configured === 'POST') return configured;
    return 'PATCH';
  }

  private getPetHubTakedownEndpoint(campaign: any): string | null {
    const remoteId = encodeURIComponent(this.resolvePetHubRemoteId(campaign));
    const explicit = process.env.PETHUB_CAMPAIGN_TAKEDOWN_ENDPOINT?.trim();
    if (explicit) {
      return explicit
        .replace(/\{campaignId\}/g, remoteId)
        .replace(/\{id\}/g, remoteId);
    }

    const campaignsEndpoint = this.getPetHubCampaignsEndpoint();
    if (!campaignsEndpoint) return null;
    return `${campaignsEndpoint.replace(/\/$/, '')}/${remoteId}`;
  }

  private async generateAndStoreCampaignImage(
    campaignId: string,
    recommendation: ActivationRecommendation,
    generatedAssets: GeneratedCampaignAssets,
  ): Promise<string | null> {
    const bucket = process.env.SUPABASE_CAMPAIGN_BUCKET?.trim();
    if (!bucket) {
      return null;
    }

    try {
      const prompt = this.buildCampaignImagePrompt(
        recommendation,
        generatedAssets.pubmatPrompt,
      );
      generatedAssets.pubmatPrompt = prompt;
      const svg = this.buildCampaignPubmatSvg(recommendation, generatedAssets);
      const path = `campaigns/${campaignId}.svg`;
      const buffer = Buffer.from(svg, 'utf8');
      const { error } = await this.supabaseService.client.storage
        .from(bucket)
        .upload(path, buffer, {
          contentType: 'image/svg+xml',
          upsert: true,
        });
      if (error) {
        this.logger.warn(`Campaign image upload failed: ${error.message}`);
        return null;
      }

      const { data } = this.supabaseService.client.storage
        .from(bucket)
        .getPublicUrl(path);
      return data.publicUrl || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Campaign template image generation failed: ${message}`);
      return null;
    }
  }

  private buildCampaignPubmatSvg(
    recommendation: ActivationRecommendation,
    generatedAssets: GeneratedCampaignAssets,
  ): string {
    const sector = this.inferCampaignSector(recommendation);
    const icon = sector === 'Services' ? 'SV' : sector === 'Cafe' ? 'CF' : 'RT';
    const titleLines = this.wrapSvgText(
      generatedAssets.headline || recommendation.title,
      22,
      2,
    );
    const subtitleLines = this.wrapSvgText(
      generatedAssets.shortCaption || recommendation.targetSegment,
      42,
      2,
    );
    const mechanicLines = this.wrapSvgText(recommendation.promoMechanic, 46, 2);
    const featured = recommendation.featuredItems.filter(Boolean).slice(0, 2);

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${this.escapeXml(generatedAssets.headline)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff7fb"/>
      <stop offset="48%" stop-color="#ffe2f2"/>
      <stop offset="100%" stop-color="#e8fbff"/>
    </linearGradient>
    <linearGradient id="hot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F53799"/>
      <stop offset="100%" stop-color="#3AE4FA"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#223047" flood-opacity="0.16"/>
    </filter>
  </defs>
  <rect width="1200" height="675" rx="48" fill="url(#bg)"/>
  <circle cx="1045" cy="102" r="180" fill="#3AE4FA" opacity="0.18"/>
  <circle cx="130" cy="604" r="220" fill="#F53799" opacity="0.12"/>
  <rect x="64" y="58" width="1072" height="559" rx="42" fill="#ffffff" opacity="0.78" filter="url(#shadow)"/>
  <rect x="96" y="91" width="102" height="102" rx="30" fill="url(#hot)"/>
  <text x="147" y="156" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#ffffff">${icon}</text>
  <text x="224" y="122" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="900" fill="#223047">Happy Tails PetHub</text>
  <text x="224" y="158" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#F53799">WOOF Offers</text>
  <rect x="96" y="226" width="178" height="48" rx="24" fill="#FFE1F1"/>
  <text x="185" y="258" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" fill="#C21872">${this.escapeXml(sector.toUpperCase())}</text>
  ${titleLines
    .map(
      (line, index) =>
        `<text x="96" y="${342 + index * 66}" font-family="Arial, Helvetica, sans-serif" font-size="58" font-weight="900" fill="#C21872">${this.escapeXml(line.toUpperCase())}</text>`,
    )
    .join('\n  ')}
  ${subtitleLines
    .map(
      (line, index) =>
        `<text x="100" y="${486 + index * 34}" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="700" fill="#596174">${this.escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  <rect x="96" y="548" width="330" height="58" rx="29" fill="url(#hot)"/>
  <text x="261" y="585" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="900" fill="#ffffff">${this.escapeXml((generatedAssets.callToAction || 'View Offer').toUpperCase())}</text>
  <g transform="translate(710 185)">
    <circle cx="160" cy="125" r="120" fill="#FFE1F1"/>
    <circle cx="108" cy="88" r="31" fill="#F53799"/>
    <circle cx="210" cy="88" r="31" fill="#F53799"/>
    <circle cx="80" cy="152" r="33" fill="#3AE4FA"/>
    <circle cx="240" cy="152" r="33" fill="#3AE4FA"/>
    <path d="M82 206 C110 136, 210 136, 238 206 C253 244, 223 277, 160 277 C97 277, 67 244, 82 206 Z" fill="#F53799"/>
    <circle cx="134" cy="218" r="13" fill="#ffffff" opacity="0.94"/>
    <circle cx="186" cy="218" r="13" fill="#ffffff" opacity="0.94"/>
  </g>
  <rect x="662" y="467" width="420" height="96" rx="28" fill="#223047"/>
  ${mechanicLines
    .map(
      (line, index) =>
        `<text x="690" y="${508 + index * 34}" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#ffffff">${this.escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  ${
    featured.length
      ? `<text x="690" y="596" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="800" fill="#3AE4FA">${this.escapeXml(featured.join(' + '))}</text>`
      : ''
  }
</svg>`;
  }

  private inferCampaignSector(
    recommendation: ActivationRecommendation,
  ): string {
    const text = [
      recommendation.title,
      recommendation.promoMechanic,
      recommendation.targetSegment,
      ...recommendation.featuredItems,
    ]
      .join(' ')
      .toLowerCase();
    if (
      text.includes('groom') ||
      text.includes('service') ||
      text.includes('boarding')
    ) {
      return 'Services';
    }
    if (
      text.includes('cafe') ||
      text.includes('drink') ||
      text.includes('treat') ||
      text.includes('food')
    ) {
      return 'Cafe';
    }
    return 'Retail';
  }

  private inferFeedbackType(campaign: any):
    | 'bundle'
    | 'discount'
    | 'happy-hour'
    | 'flash-sale'
    | 'forecast' {
    const text = [
      campaign.source,
      campaign.title,
      campaign.promoMechanic,
      campaign.pethubPayload?.promoMechanic,
    ]
      .join(' ')
      .toLowerCase();
    if (text.includes('bundle')) return 'bundle';
    if (text.includes('happy hour')) return 'happy-hour';
    if (text.includes('flash')) return 'flash-sale';
    if (text.includes('forecast')) return 'forecast';
    return 'discount';
  }

  private wrapSvgText(
    value: string,
    maxChars: number,
    maxLines: number,
  ): string[] {
    const words = this.safeString(value, 'Happy Tails Offer').split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
      if (lines.length === maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (
      lines.length === maxLines &&
      words.join(' ').length > lines.join(' ').length
    ) {
      lines[maxLines - 1] = this.limitText(lines[maxLines - 1], maxChars);
    }
    return lines;
  }

  private escapeXml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private requiredCampaignImageContext(): string {
    return [
      'Create a polished promotional campaign image for Happy Tails PetHub.',
      '',
      'Brand context:',
      'Happy Tails is a pet cafe, grooming, boarding, and pet retail business.',
      'WOOF is the analytics system that recommends smart offers based on sales and demand data.',
      'The image should feel cute, friendly, clean, trustworthy, and customer-facing.',
      '',
      'Visual style:',
      'Use pink, cyan, white, and soft pastel accents.',
      'Show happy pets, pet care, grooming, pet cafe, or pet retail elements depending on the offer.',
      'Modern social-media promo banner style.',
      'No clutter, no scary visuals, no fake logos, no excessive text.',
      'Leave clean space for campaign title/CTA.',
    ].join('\n');
  }

  private buildCampaignImagePrompt(
    recommendation: ActivationRecommendation,
    prompt: string,
  ): string {
    const items = recommendation.featuredItems.filter(Boolean).join(', ');
    return [
      this.requiredCampaignImageContext(),
      '',
      'Campaign context:',
      `Offer title: ${recommendation.title}`,
      `Featured item/service: ${items || recommendation.title}`,
      `Promo mechanic: ${recommendation.promoMechanic}`,
      `Target segment: ${recommendation.targetSegment}`,
      '',
      'Specific creative direction:',
      prompt,
    ].join('\n');
  }

  private extractAnthropicText(data: any): string {
    const textBlocks = Array.isArray(data?.content)
      ? data.content
          .filter((block: any) => block?.type === 'text' && block?.text)
          .map((block: any) => block.text)
      : [];
    return textBlocks.join('\n').trim();
  }

  private parseJsonObject(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return {};
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
  }

  private normalizeGeneratedAssets(
    value: Record<string, unknown>,
    fallback: GeneratedCampaignAssets,
  ): GeneratedCampaignAssets {
    return {
      headline: this.safeString(value.headline, fallback.headline),
      shortCaption: this.safeString(value.shortCaption, fallback.shortCaption),
      longCaption: this.safeString(value.longCaption, fallback.longCaption),
      callToAction: this.safeString(value.callToAction, fallback.callToAction),
      pushNotification: this.safeString(
        value.pushNotification,
        fallback.pushNotification,
      ),
      petHubBannerText: this.safeString(
        value.petHubBannerText,
        fallback.petHubBannerText,
      ),
      termsAndConditions: this.safeStringArray(
        value.termsAndConditions,
        fallback.termsAndConditions,
      ),
      pubmatPrompt: this.safeString(value.pubmatPrompt, fallback.pubmatPrompt),
    };
  }

  private safeString(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
  }

  private limitText(value: string, maxLength: number): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    const clipped = normalized.slice(0, Math.max(0, maxLength - 1)).trim();
    const lastSpace = clipped.lastIndexOf(' ');
    return `${(lastSpace > 20 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
  }

  private customerHeadline(
    recommendation: ActivationRecommendation,
    primary: string,
  ): string {
    if (recommendation.source === 'market_basket_analysis') {
      return `${primary} Bundle Deal`;
    }
    const title = recommendation.title.toLowerCase();
    if (title.includes('service')) return 'Book Pet Services';
    if (title.includes('retail')) return 'Pet Shop Favorites';
    if (title.includes('cafe')) return 'Cafe Treats Today';
    return `${primary} Offer`;
  }

  private customerHighlight(
    recommendation: ActivationRecommendation,
    pair: string,
  ): string {
    if (recommendation.source === 'market_basket_analysis') {
      return this.limitText(`Shop ${pair}`, 34);
    }
    const mechanic = recommendation.promoMechanic.toLowerCase();
    if (mechanic.includes('%'))
      return this.limitText(recommendation.promoMechanic, 34);
    return 'Featured PetHub Offer';
  }

  private safeStringArray(value: unknown, fallback: string[]): string[] {
    if (!Array.isArray(value)) return fallback;
    const items = value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length ? items.slice(0, 5) : fallback;
  }

  private getPetHubCampaignsEndpoint(): string | null {
    const explicitEndpoint = process.env.PETHUB_CAMPAIGNS_ENDPOINT?.trim();
    if (explicitEndpoint) {
      return this.normalizePetHubCampaignsEndpoint(explicitEndpoint);
    }
    const baseUrl = process.env.PETHUB_API_BASE_URL?.trim();
    if (!baseUrl) {
      return null;
    }
    return this.normalizePetHubCampaignsEndpoint(baseUrl);
  }

  private normalizePetHubCampaignsEndpoint(value: string): string {
    const trimmed = value.replace(/\/+$/, '');
    if (/\/api\/campaigns$/i.test(trimmed)) {
      return trimmed;
    }
    return `${trimmed}/api/campaigns`;
  }

  private async postPetHubCampaign(
    endpoint: string,
    payload: PetHubCampaignPayload,
    token?: string,
  ) {
    try {
      return await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 15000,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const responseMessage = this.extractRemoteErrorMessage(
          error.response?.data,
        );
        const message = [
          'PetHub campaign publish failed',
          status ? `(${status})` : null,
          responseMessage || error.message,
          `Endpoint: ${endpoint}`,
        ]
          .filter(Boolean)
          .join(' ');
        throw new BadGatewayException(message);
      }
      throw new BadGatewayException('PetHub campaign publish failed');
    }
  }

  private extractRemoteErrorMessage(data: unknown): string | null {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (typeof data !== 'object') return null;
    const body = data as Record<string, unknown>;
    if (typeof body.message === 'string') return body.message;
    if (typeof body.error === 'string') return body.error;
    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }
    return JSON.stringify(body);
  }

  private normalizeRecommendation(body: Record<string, unknown>) {
    const sourceRecommendation = body.recommendation as
      | ActivationRecommendation
      | undefined;
    const recommendation = sourceRecommendation || (body as any);
    if (!recommendation?.title) {
      throw new BadRequestException(
        'Campaign generation requires a recommendation title',
      );
    }
    return {
      id: String(recommendation.id || `manual-${Date.now()}`),
      source: String(recommendation.source || 'manual_recommendation'),
      title: String(recommendation.title),
      featuredItems: Array.isArray(recommendation.featuredItems)
        ? recommendation.featuredItems.map(String)
        : [String(recommendation.title)],
      promoMechanic: String(
        recommendation.promoMechanic || 'Featured PetHub placement',
      ),
      targetSegment: String(recommendation.targetSegment || 'PetHub customers'),
      expectedLift: String(recommendation.expectedLift || 'N/A'),
      confidence: String(recommendation.confidence || 'N/A'),
      reason: String(recommendation.reason || 'Generated from WOOF analytics.'),
      analyticsContext:
        typeof recommendation.analyticsContext === 'object' &&
        recommendation.analyticsContext
          ? recommendation.analyticsContext
          : {},
    } satisfies ActivationRecommendation;
  }

  private suggestMechanic(item: any): string {
    const score = Number(item.opportunityScore || 0);
    const crossSector = Boolean(item.crossSector);
    if (score >= 75)
      return crossSector ? '15% cross-sector bundle' : '10% bundle discount';
    if (score >= 45) return 'PetHub featured bundle placement';
    return 'Awareness bundle with homepage placement';
  }

  private extractDiscount(value: string): string {
    const match = value.match(/\d+%/);
    return match ? `${match[0]} off for eligible customers.` : value;
  }

  private slug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
}
