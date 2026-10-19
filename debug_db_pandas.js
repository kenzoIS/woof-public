const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
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
  const { data: normalRes } = await supabase.from('fact_cross_channel_transactions').select(columns).gt('gross_sales', 0).order('transaction_timestamp', { ascending: false }).limit(500);
  
  const formatted = normalRes.map(row => ({
      transactionTimestamp: row.transaction_timestamp,
      quantitySold: Number(row.quantity_sold || 0)
  }));
  
  const payload = {
    is_weekend: 0,
    temp: 30.0,
    discount_depth: 0.15,
    trainingSignature: "test-pandas-real:1",
    trainingRows: formatted
  };
  
  const out = execSync('python3 backend/src/analytics/python/dynamic_promo.py', { input: JSON.stringify(payload), env: process.env, maxBuffer: 1024 * 1024 * 50 });
  console.log(out.toString());
}
run();
