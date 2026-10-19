'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { publicConfig } = require('../lib/config.cjs');
const desktop = path.resolve(__dirname, '..');
const frontend = path.resolve(desktop, '../frontend');
const config = publicConfig(require('../desktop-config.json'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'woof-desktop-build-'));
try {
  // Build a snapshot so desktop export never overwrites a running website's .next.
  fs.cpSync(frontend, stage, { recursive: true, filter: (file) => {
    if (file === frontend) return true;
    const first = path.relative(frontend, file).split(path.sep)[0];
    return !['node_modules', 'out', 'desktop-out'].includes(first) && !first.startsWith('.next') && !first.startsWith('.env');
  } });
  // The incoming enrollment page intentionally requires a live Next.js server.
  // Keep that website implementation intact; never export its server-only setup logic.
  fs.writeFileSync(path.join(stage, 'pages/mfa-enroll.tsx'), `
export default function DesktopMfaEnrollment() {
  return <main className="flex min-h-screen items-center justify-center bg-[#fff8fc] p-6"><section className="max-w-md space-y-4 rounded-2xl bg-white p-8 shadow-xl"><h1 className="text-2xl font-bold text-[#223047]">Secure your WOOF account</h1><p>First-time authenticator enrollment requires the WOOF website and an administrator-enabled enrollment environment. Complete setup there, then sign in again in the desktop app.</p><p>Existing authenticator codes continue to work when signing in here.</p><a className="text-pink-600 underline" href="/login/">Return to sign in</a></section></main>;
}
`);
  fs.symlinkSync(path.join(frontend, 'node_modules'), path.join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const result = spawnSync(process.execPath, [path.join(frontend, 'node_modules/next/dist/bin/next'), 'build'], {
    cwd: stage, stdio: 'inherit', env: { ...process.env, WOOF_DESKTOP_BUILD: '1', NEXT_PUBLIC_API_URL: config.apiUrl, NEXT_PUBLIC_UPLOAD_API_URL: config.uploadApiUrl, NEXT_PUBLIC_WS_URL: config.realtimeUrl },
  });
  if (result.status !== 0) throw new Error(`Desktop frontend build failed (${result.status}).`);
  // For Next output:export, distDir names the final export directory.
  const output = path.join(stage, 'desktop-out');
  if (!fs.existsSync(path.join(output, 'index.html'))) throw new Error('Next.js did not generate the static desktop frontend.');
  fs.rmSync(path.join(desktop, 'renderer'), { recursive: true, force: true });
  fs.cpSync(output, path.join(desktop, 'renderer'), { recursive: true });
  fs.writeFileSync(path.join(desktop, 'desktop-config.json'), JSON.stringify(config, null, 2) + '\n');
  console.log('WOOF desktop frontend prepared. Existing pages, styles, images, and scripts are bundled locally.');
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
