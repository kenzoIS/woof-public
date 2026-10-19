'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
async function resolveAsset(root, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== 'woof:' || url.hostname !== 'app' || url.port || url.username || url.password) return null;
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { return null; }
  if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').includes('..')) return null;
  let base;
  try { base = await fs.realpath(root); } catch { return null; }
  const target = path.resolve(base, `.${pathname}`);
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  const choices = [target, path.join(target, 'index.html'), `${target}.html`];
  for (const candidate of choices) {
    try {
      if (!(await fs.stat(candidate)).isFile()) continue;
      const real = await fs.realpath(candidate);
      if (real.startsWith(base + path.sep)) return real;
    } catch { /* Try the next exported route shape. */ }
  }
  return null;
}
module.exports = { resolveAsset };
