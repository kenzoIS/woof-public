const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function check() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  const { data, error } = await supabase
      .from('fact_cross_channel_transactions')
      .select('discount_amount, discount_depth')
      .or('discount_amount.gt.0,discount_depth.gt.0');
  
  console.log('Error:', error);
  console.log('Total discounted rows:', data ? data.length : 0);
}
check();
