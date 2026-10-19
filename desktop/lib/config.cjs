'use strict';
function endpoint(value, name) {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) {
    throw new Error(`${name} must be an HTTPS URL (HTTP is allowed only for localhost), without credentials, query, or fragment.`);
  }
  return url.href.replace(/\/$/, '');
}
function publicConfig(config, env = process.env) {
  const apiUrl = endpoint(env.WOOF_API_URL || config.apiUrl, 'API URL');
  const uploadApiUrl = endpoint(env.WOOF_UPLOAD_API_URL || (env.WOOF_API_URL ? apiUrl : config.uploadApiUrl) || apiUrl, 'Upload API URL');
  const realtimeUrl = endpoint(env.WOOF_REALTIME_URL || ((env.WOOF_API_URL || env.WOOF_UPLOAD_API_URL) ? uploadApiUrl.replace(/\/api$/, '') : config.realtimeUrl) || uploadApiUrl.replace(/\/api$/, ''), 'Realtime URL');
  return Object.freeze({ apiUrl, uploadApiUrl, realtimeUrl });
}
function externalUrl(value) {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(value).protocol); } catch { return false; }
}
function contentSecurityPolicy(config) {
  const connections = new Set(["'self'"]);
  for (const value of Object.values(config)) {
    const url = new URL(value);
    connections.add(url.origin);
    connections.add(url.origin.replace(/^http/, 'ws'));
  }
  return `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data: https:; connect-src ${[...connections].join(' ')}; object-src 'none'; base-uri 'self'; frame-src 'none'; form-action 'self'; worker-src 'self' blob:`;
}
module.exports = { publicConfig, externalUrl, contentSecurityPolicy };
