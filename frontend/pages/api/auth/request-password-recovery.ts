import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@supabase/ssr';
import { appendSupabaseCookies } from '../../../src/app/lib/supabaseServerCookies';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  if (!email) return res.status(200).json({ success: true });

  const client = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { cookies: appendSupabaseCookies(req, res) },
  );
  // The callback URL is server-configured: callers cannot select a redirect destination.
  await client.auth.resetPasswordForEmail(email, { redirectTo: `${requestOrigin(req)}/api/auth/recovery-callback` });
  // Always return the same response to avoid account enumeration.
  return res.status(200).json({ success: true });
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
function requestOrigin(req: NextApiRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (configured && /^https:\/\//.test(configured)) return configured.replace(/\/$/, '');
  const host = req.headers.host;
  return `http://${host}`;
}
