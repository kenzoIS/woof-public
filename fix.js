const fs = require('fs');
const file = 'backend/src/analytics/analytics.service.ts';
let code = fs.readFileSync(file, 'utf8');

// Replace getPromoModelTrainingRows
code = code.replace(/private async getPromoModelTrainingRows\(\)[\s\S]*?return data\.map\(\(row: any\) => \(\{[\s\S]*?\}\)\);\n  \}/g, `private async getPromoModelTrainingRows(): Promise<any[]> {
    const columns = [
      'transaction_timestamp',
      'product_id',
      'service_id',
      'channel_id',
      'segment_id',
      'quantity_sold',
      'gross_sales',
      'discount_amount',
      'discount_depth',
      'net_sales',
      'gross_profit',
    ].join(',');

    const { data: discountedRes } = await this.supabaseService.client
      .from('fact_cross_channel_transactions')
      .select(columns)
      .gt('gross_sales', 0)
      .or('discount_amount.gt.0,discount_depth.gt.0')
      .order('transaction_timestamp', { ascending: false })
      .limit(500);

    const { data: normalRes } = await this.supabaseService.client
      .from('fact_cross_channel_transactions')
      .select(columns)
      .gt('gross_sales', 0)
      .eq('discount_amount', 0)
      .eq('discount_depth', 0)
      .order('transaction_timestamp', { ascending: false })
      .limit(500);

    let data: any[] = [];
    if (discountedRes && Array.isArray(discountedRes)) data = data.concat(discountedRes);
    if (normalRes && Array.isArray(normalRes)) data = data.concat(normalRes);

    if (data.length === 0) return [];

    return data.map((row: any) => ({
      transactionTimestamp: row.transaction_timestamp,
      itemKey: row.product_id || row.service_id || 'unknown',
      channelKey: row.channel_id || 'unknown',
      segmentKey: row.segment_id || 'unknown',
      quantitySold: Number(row.quantity_sold || 0),
      grossSales: Number(row.gross_sales || 0),
      discountAmount: Number(row.discount_amount || 0),
      discountDepth: Number(row.discount_depth || 0),
      netSales: Number(row.net_sales || 0),
      grossProfit: Number(row.gross_profit || 0),
    }));
  }`);

// Update getNextQuietPeriod payload and response
code = code.replace(/const hour = 15;[\s\S]*?const trafficDrop = 45\.0;/g, ``);
code = code.replace(/hour,\s*is_weekend: isWeekend,\s*temp,\s*traffic_drop: trafficDrop,/g, `is_weekend: isWeekend,\n          temp,`);
code = code.replace(/targetHour: hour,\s*predictedTrafficDrop: trafficDrop,/g, `targetHour: mlResult.targetHour,\n      predictedTrafficDrop: mlResult.predictedTrafficDrop,`);

fs.writeFileSync(file, code);
