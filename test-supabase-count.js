const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });

async function check() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
  const { count, error } = await supabase.from('fact_cross_channel_transactions').select('*', { count: 'exact', head: true });
  console.log('fact_cross_channel_transactions count:', count);
  console.log('error:', error);
}
check();
