const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function run() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  const { data, error } = await supabase
      .from('fact_cross_channel_transactions')
      .select('transaction_timestamp,product_id,service_id,channel_id,segment_id,quantity_sold,gross_sales,discount_amount,discount_depth,net_sales,gross_profit')
      .gt('gross_sales', 0)
      .order('transaction_timestamp', { ascending: false })
      .limit(500);

  const payload = {
    hour: 15,
    is_weekend: 0,
    temp: 30.0,
    traffic_drop: 45.0,
    discount_depth: 0.15,
    trainingSignature: "test-real:" + data.length,
    trainingRows: data.map(r => ({
      transactionTimestamp: r.transaction_timestamp,
      productId: r.product_id,
      serviceId: r.service_id,
      channelId: r.channel_id,
      segmentId: r.segment_id,
      quantitySold: r.quantity_sold,
      grossSales: r.gross_sales,
      discountAmount: r.discount_amount,
      discountDepth: r.discount_depth,
      netSales: r.net_sales,
      grossProfit: r.gross_profit
    }))
  };

  const result = execSync('python3 backend/src/analytics/python/dynamic_promo.py', {
    input: JSON.stringify(payload),
    env: process.env
  });
  console.log(result.toString());
}
run();
