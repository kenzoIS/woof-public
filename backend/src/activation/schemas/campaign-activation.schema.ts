import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CampaignActivationDocument = CampaignActivation & Document;

@Schema({ timestamps: true })
export class CampaignActivation {
  @Prop({ required: true })
  campaignId: string;

  @Prop({ required: true })
  source: string;

  @Prop({ required: true })
  sourceRecommendationId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  promoMechanic: string;

  @Prop({ type: [String], default: [] })
  featuredItems: string[];

  @Prop({ default: 'PetHub customers' })
  targetSegment: string;

  @Prop({
    default: 'draft',
    enum: ['draft', 'approved', 'queued', 'published', 'completed'],
  })
  status: 'draft' | 'approved' | 'queued' | 'published' | 'completed';

  @Prop({ type: Object, required: true })
  analyticsContext: Record<string, unknown>;

  @Prop({ type: Object, required: true })
  generatedAssets: {
    headline: string;
    shortCaption: string;
    longCaption: string;
    callToAction: string;
    pushNotification: string;
    petHubBannerText: string;
    termsAndConditions: string[];
    pubmatPrompt: string;
    campaignImageUrl?: string;
  };

  @Prop({ type: Object, default: {} })
  pethubPayload: {
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
  };
}

export const CampaignActivationSchema =
  SchemaFactory.createForClass(CampaignActivation);

CampaignActivationSchema.index({ campaignId: 1 }, { unique: true });
CampaignActivationSchema.index({ status: 1, createdAt: -1 });
