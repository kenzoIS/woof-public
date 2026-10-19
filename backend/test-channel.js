require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const [{ data: minTiktok, error: minErr }, { data: maxTiktok, error: maxErr }] = await Promise.all([
    supabase.from('fact_cross_channel_transactions')
      .select('transaction_timestamp')
      .eq('channel_id', 'CH_TIKTOK')
      .order('transaction_timestamp', { ascending: true })
      .limit(1),
    supabase.from('fact_cross_channel_transactions')
      .select('transaction_timestamp')
      .eq('channel_id', 'CH_TIKTOK')
      .order('transaction_timestamp', { ascending: false })
      .limit(1),
  ]);

  console.log("minTiktok:", minTiktok);
  console.log("maxTiktok:", maxTiktok);
}

run();
