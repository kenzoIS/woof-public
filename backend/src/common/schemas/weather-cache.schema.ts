import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WeatherCacheDocument = WeatherCache & Document;

@Schema({ collection: 'weather_cache' })
export class WeatherCache {
  @Prop({ required: true, index: true })
  date: string;

  @Prop({ required: true })
  lat: number;

  @Prop({ required: true })
  lng: number;

  @Prop({ required: true })
  tempCelsius: number;

  @Prop({ required: true })
  rainfallMm: number;

  @Prop({ required: true, default: 60 })
  relativeHumidity: number;

  @Prop({ required: true, default: false })
  isSynthetic: boolean;

  @Prop({ required: true, default: Date.now })
  fetchedAt: Date;
}

export const WeatherCacheSchema = SchemaFactory.createForClass(WeatherCache);
WeatherCacheSchema.index({ date: 1, lat: 1, lng: 1 }, { unique: true });
