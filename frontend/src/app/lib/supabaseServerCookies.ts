import type { NextApiRequest, NextApiResponse } from 'next';

type CookieToSet = { name: string; value: string; options: Record<string, unknown> };

/** Cookie adapter used only by server-side @supabase/ssr clients. */
export function appendSupabaseCookies(req: NextApiRequest, res: NextApiResponse) {
  return {
    getAll() {
      return Object.entries(req.cookies).map(([name, value]) => ({ name, value: value || '' }));
    },
    setAll(cookies: CookieToSet[]) {
      const existing = res.getHeader('Set-Cookie');
      const values = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
      for (const cookie of cookies) values.push(serializeCookie(cookie.name, cookie.value, cookie.options));
      res.setHeader('Set-Cookie', values);
    },
  };
}

export function appendWoofSessionCookies(res: NextApiResponse, accessToken: string, refreshToken: string) {
  const existing = res.getHeader('Set-Cookie');
  const values = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  values.push(serializeCookie('woof_session', accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/', maxAge: 3600 }));
  values.push(serializeCookie('woof_refresh', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/', maxAge: 2_592_000 }));
  res.setHeader('Set-Cookie', values);
}

function serializeCookie(name: string, value: string, options: Record<string, unknown>) {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge) segments.push(`Max-Age=${Math.floor(Number(options.maxAge))}`);
  if (options.path) segments.push(`Path=${options.path}`);
  if (options.httpOnly) segments.push('HttpOnly');
  if (options.secure) segments.push('Secure');
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  return segments.join('; ');
}
