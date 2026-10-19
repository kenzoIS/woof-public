import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WeatherLogDocument = WeatherLog & Document;

@Schema({ timestamps: true })
export class WeatherLog {
  @Prop({ required: true })
  location: string; // e.g., 'Lucena City'

  @Prop({ required: true })
  timestamp: Date; // The time this weather data applies to

  @Prop({ required: true })
  temperature: number; // Celsius

  @Prop({ required: true })
  precipitation: number; // mm

  @Prop({ required: true })
  humidity: number; // %

  @Prop({ required: true })
  isForecast: boolean; // true if from the 5-day forecast, false if current
}

export const WeatherLogSchema = SchemaFactory.createForClass(WeatherLog);
WeatherLogSchema.index({ timestamp: 1, location: 1 });
