import type { GetServerSideProps } from 'next';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@supabase/supabase-js';

type Props = { factorId: string; qrCode: string; secret: string };

export default function MfaEnrollPage({ factorId, qrCode, secret }: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return setMessage('Enter the 6-digit code from Google Authenticator.');
    setBusy(true);
    const response = await fetch('/backend-api/auth/mfa/enrollment/verify', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ factorId, code }) });
    if (!response.ok) { setBusy(false); return setMessage('That code could not be verified. Try a current code.'); }
    router.replace('/');
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#fff8fc] p-6"><section className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-xl"><h1 className="text-2xl font-bold text-[#223047]">Secure your WOOF account</h1><p className="text-sm text-slate-600">Scan this one-time QR code with Google Authenticator, then enter its current code. Do not share it.</p><img className="mx-auto h-52 w-52" src={`data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`} alt="Google Authenticator setup QR code" /><details><summary className="cursor-pointer text-sm font-medium">Can’t scan the code?</summary><p className="mt-2 break-all rounded bg-slate-50 p-2 font-mono text-xs">{secret}</p></details><form onSubmit={verify} className="space-y-3"><input aria-label="Authenticator code" className="w-full rounded border p-3 text-center tracking-[0.2em]" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /><button disabled={busy} className="w-full rounded bg-[#F53799] p-3 font-semibold text-white" type="submit">{busy ? 'Verifying…' : 'Verify and continue'}</button></form>{message && <p role="status" className="text-sm text-red-700">{message}</p>}</section></main>;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
  const accessToken = req.cookies.woof_session;
  const refreshToken = req.cookies.woof_refresh;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Enrollment creates an Auth factor. Keep it disabled unless a staging
  // environment explicitly opts in, so local development cannot mutate production.
  if (process.env.MFA_ENROLLMENT_ENABLED !== 'true') return { redirect: { destination: '/login?error=mfa-enrollment-disabled', permanent: false } };
  if (!accessToken || !refreshToken || !url || !key) return { redirect: { destination: '/login', permanent: false } };
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error: sessionError } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (sessionError) return { redirect: { destination: '/login', permanent: false } };
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (aal?.currentLevel === 'aal2') return { redirect: { destination: '/', permanent: false } };
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Google Authenticator' });
  if (error || !data?.totp) return { redirect: { destination: '/login', permanent: false } };
  return { props: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret } };
};
