import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { resetDashboardPassword } from '../src/app/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (router.query.error) setMessage('This password-reset link is invalid or has expired.');
  }, [router.query.error]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 12) return setMessage('Use at least 12 characters.');
    if (password !== confirmPassword) return setMessage('Passwords do not match.');
    try {
      await resetDashboardPassword(password);
      setMessage('Password updated. Redirecting to sign in…');
      setTimeout(() => router.replace('/login'), 1000);
    } catch { setMessage('This password-reset link is invalid or has expired.'); }
  }

  return <main className="flex min-h-screen items-center justify-center bg-[#fff8fc] p-6"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-xl"><h1 className="text-2xl font-bold text-[#223047]">Set a new password</h1><p className="text-sm text-slate-600">Use a unique password with at least 12 characters.</p><input className="w-full rounded border p-3" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" required /><input className="w-full rounded border p-3" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" required /><button className="w-full rounded bg-[#F53799] p-3 font-semibold text-white" type="submit">Update password</button>{message && <p role="status" className="text-sm text-[#223047]">{message}</p>}</form></main>;
}
