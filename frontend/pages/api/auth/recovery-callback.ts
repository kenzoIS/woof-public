import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@supabase/ssr';
import { appendSupabaseCookies, appendWoofSessionCookies } from '../../../src/app/lib/supabaseServerCookies';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) return res.redirect(302, '/reset-password?error=invalid-link');
  const client = createServerClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { cookies: appendSupabaseCookies(req, res) });
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session) return res.redirect(302, '/reset-password?error=invalid-link');
  appendWoofSessionCookies(res, data.session.access_token, data.session.refresh_token);
  return res.redirect(302, '/reset-password');
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
