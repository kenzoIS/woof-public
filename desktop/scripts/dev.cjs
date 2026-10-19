'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const { publicConfig } = require('../lib/config.cjs');
const root = path.resolve(__dirname, '../..');
const children = [];
const config = publicConfig(require('../desktop-config.json'));
let exiting = false;
function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env }, shell: false, detached: process.platform !== 'win32' });
  children.push(child);
  child.on('error', (error) => { console.error(error.message); finish(1); });
  return child;
}
function finish(code = 0) {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Already exited. */ } }
  }
  process.exitCode = code;
}
async function reachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.status < 500;
  } catch { return false; }
}
async function ready(url) {
  for (let attempt = 0; attempt < 180 && !exiting; attempt++) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
(async () => {
  if (['localhost', '127.0.0.1'].includes(new URL(config.apiUrl).hostname) && !(await reachable(config.apiUrl))) {
    start(process.execPath, [path.join(root, 'backend/node_modules/@nestjs/cli/bin/nest.js'), 'start'], path.join(root, 'backend'));
  }
  // A dedicated port keeps the ordinary web development server independent.
  const url = 'http://127.0.0.1:3012';
  const server = http.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(3012, '127.0.0.1', () => server.close(resolve)));
  start(process.execPath, [path.join(root, 'frontend/node_modules/next/dist/bin/next'), 'dev', '-p', '3012', '-H', '127.0.0.1'], path.join(root, 'frontend'), { WOOF_DESKTOP_DEV: '1', NEXT_PUBLIC_API_URL: config.apiUrl, NEXT_PUBLIC_UPLOAD_API_URL: config.uploadApiUrl, NEXT_PUBLIC_WS_URL: config.realtimeUrl });
  await Promise.all([ready(url), ready(config.apiUrl)]);
  const electron = start(require('electron'), ['.'], path.join(root, 'desktop'), { WOOF_DEV_URL: url, ELECTRON_RUN_AS_NODE: undefined });
  electron.on('exit', (code) => finish(code || 0));
})().catch((error) => { console.error(error.message); finish(1); });
process.on('SIGINT', () => finish());
process.on('SIGTERM', () => finish());
