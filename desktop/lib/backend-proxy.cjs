'use strict';
/** Main-process-only session jar: cookies never enter the renderer bridge. */
function createBackendProxy(config, fetchImpl = fetch) {
  const cookies = new Map();
  let generation = 0;
  return async function proxy(request) {
    const url = new URL(request.url);
    if (url.protocol !== 'woof:' || url.hostname !== 'app') return null;
    const prefix = url.pathname.startsWith('/backend-api/') ? '/backend-api/' : url.pathname.startsWith('/upload-backend-api/') ? '/upload-backend-api/' : null;
    if (!prefix) return null;
    const base = prefix === '/backend-api/' ? config.apiUrl : config.uploadApiUrl;
    const target = new URL(base.replace(/\/$/, '') + '/' + url.pathname.slice(prefix.length) + url.search);
    // Resolve only within the configured API path; never follow a caller-selected host.
    const allowed = new URL(base);
    if (target.origin !== allowed.origin || !target.pathname.startsWith(allowed.pathname.replace(/\/$/, '') + '/')) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    for (const name of ['content-type', 'accept', 'authorization']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    const logout = target.pathname.endsWith('/auth/logout') && request.method === 'POST';
    if (logout) { generation++; cookies.clear(); }
    const requestGeneration = generation;
    try {
      const response = await fetchImpl(target, {
        method: request.method, headers, redirect: 'error', signal: AbortSignal.timeout(logout ? 10000 : 600000),
        ...(!['GET', 'HEAD'].includes(request.method) ? { body: await request.arrayBuffer() } : {}),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const match = cookie.match(/^(woof_session|woof_refresh|woof_recovery)=([^;]*)/);
        if (!match || requestGeneration !== generation || logout) continue;
        if (!match[2] || /max-age=0(?:;|$)/i.test(cookie)) cookies.delete(match[1]);
        else cookies.set(match[1], match[2]);
      }
      const out = new Headers(response.headers);
      out.delete('set-cookie'); out.delete('content-encoding'); out.delete('content-length');
      out.set('Cache-Control', 'no-store');
      return new Response(response.body, { status: response.status, headers: out });
    } catch { return Response.json({ message: 'Backend unavailable. Start the WOOF backend and try again.' }, { status: 502 }); }
  };
}
module.exports = { createBackendProxy };
