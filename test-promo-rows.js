const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function check() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  const { data, error } = await supabase
      .from('fact_cross_channel_transactions')
      .select('transaction_timestamp,product_id,service_id,channel_id,segment_id,quantity_sold,gross_sales,discount_amount,discount_depth,net_sales,gross_profit')
      .gt('gross_sales', 0)
      .order('transaction_timestamp', { ascending: false })
      .limit(10);
  
  console.log('Error:', error);
  console.log('Rows found:', data ? data.length : 0);
  if (data && data.length > 0) {
    console.log('Sample:', data[0]);
  }
}
check();
