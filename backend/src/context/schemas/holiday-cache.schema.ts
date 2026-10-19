import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HolidayCacheDocument = HolidayCache & Document;

@Schema({ timestamps: true })
export class HolidayCache {
  @Prop({ required: true })
  date: string; // YYYY-MM-DD (e.g. '2026-12-25')

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  location: string; // e.g., 'PH'

  @Prop({ required: true })
  type: string; // e.g., 'National', 'Regional'
}

export const HolidayCacheSchema = SchemaFactory.createForClass(HolidayCache);
HolidayCacheSchema.index({ date: 1, location: 1 }, { unique: true });
