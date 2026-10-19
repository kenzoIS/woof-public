import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: String, required: true })
  csvUploadId: string;

  @Prop({ required: true })
  date: Date;

  @Prop({ required: true })
  transactionId: string;

  @Prop({ required: true })
  productName: string;

  @Prop()
  sku: string;

  @Prop({ required: true })
  category: string; // Coffee, Grooming, Pet Supplies, etc.

  @Prop({ required: true })
  sector: string; // "Cafe" | "Retail" | "Services"

  @Prop({ required: true, default: 1 })
  quantity: number;

  @Prop({ default: 0 })
  unitPrice: number;

  @Prop({ default: 0 })
  totalAmount: number;

  @Prop({ default: 0 })
  discount: number;

  @Prop({ default: 0 })
  netSales: number;

  @Prop({ default: 0 })
  costOfGoods: number;

  @Prop({ default: 0 })
  grossProfit: number;

  @Prop({ default: 0 })
  margin: number;

  @Prop({ default: 0 })
  refunds: number;

  @Prop({ default: 0 })
  itemsRefunded: number;

  @Prop({ required: true })
  channel: string; // "POS" | "Shopee" | "TikTok Shop" | "PetHub"

  @Prop()
  paymentType: string;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Add indexes for performance
TransactionSchema.index({ csvUploadId: 1 });
TransactionSchema.index({ sector: 1, date: -1 });
TransactionSchema.index({ channel: 1, date: -1 });
TransactionSchema.index({ sector: 1, category: 1, date: -1 });
TransactionSchema.index({ hash: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ date: 1, totalAmount: 1 }); // totalAmount instead of totalSpent since totalAmount is in schema
TransactionSchema.index({ transactionId: 1 });

// Ensure all aggregations can spill to disk to prevent RAM limit errors
TransactionSchema.pre('aggregate', function () {
  this.allowDiskUse(true);
});
