const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '/Users/rico/Downloads/WOOF/WOOF_V1/backend/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_constraint_def', { constraint_name: 'date_dim_date_id_matches_full_date' });
  if (error) {
    console.log("RPC failed, fetching from pg_constraint directly via raw SQL if possible, or using PostgREST.");
    // Fallback if no RPC: we can't easily query pg_constraint without raw SQL access, but we can try to get the table schema.
    const { data: cols } = await supabase.from('date_dim').select('*').limit(1);
    console.log("date_dim sample:", cols);
  } else {
    console.log(data);
  }
}
run();
