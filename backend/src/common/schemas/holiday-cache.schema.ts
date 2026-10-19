import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HolidayCacheDocument = HolidayCache & Document;

@Schema({ _id: false })
export class CachedHoliday {
  @Prop({ required: true })
  date: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, default: true })
  isNational: boolean;
}

@Schema({ collection: 'holiday_cache' })
export class HolidayCache {
  @Prop({ required: true, unique: true, index: true })
  year: number;

  @Prop({ required: true, default: 'PH' })
  country: string;

  @Prop({ type: [CachedHoliday], default: [] })
  holidays: CachedHoliday[];

  @Prop({ required: true, default: Date.now })
  fetchedAt: Date;
}

export const HolidayCacheSchema = SchemaFactory.createForClass(HolidayCache);
