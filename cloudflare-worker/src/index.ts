export interface Env {
  WOOF_BACKEND_ORIGIN: string;
}

const CACHE_TTL_SECONDS = 600;

const CACHEABLE_PREFIXES = [
  '/api/analytics/home',
  '/api/analytics/dashboard/',
  '/api/analytics/forecast/',
  '/api/analytics/forecast-by-channel/',
  '/api/analytics/data-range',
  '/api/analytics/channel-status',
  '/api/analytics/cross-sell',
  '/api/analytics/pricing-catalog',
  '/api/analytics/traffic-optimizer',
  '/api/analytics/promos/quiet-periods',
  '/api/activation/recommendations',
  '/api/activation/campaigns',
  '/api/smart-reports',
];

function isCacheable(request: Request, url: URL) {
  if (request.method !== 'GET') return false;
  if (url.searchParams.get('forceRefresh') === 'true') return false;
  return CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const incomingUrl = new URL(request.url);
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    const backendOrigin = env.WOOF_BACKEND_ORIGIN?.replace(/\/+$/, '');
    if (!backendOrigin) {
      return new Response('WOOF_BACKEND_ORIGIN is not configured', { status: 500 });
    }

    const backendUrl = new URL(`${backendOrigin}${incomingUrl.pathname}${incomingUrl.search}`);
    const cache = caches.default;
    const cacheKey = new Request(backendUrl.toString(), { method: 'GET' });

    if (isCacheable(request, incomingUrl)) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const response = new Response(cached.body, cached);
        response.headers.set('x-woof-cache', 'HIT');
        Object.entries(corsHeaders(origin)).forEach(([key, value]) => response.headers.set(key, value));
        return response;
      }
    }

    const backendRequest = new Request(backendUrl.toString(), request);
    const backendResponse = await fetch(backendRequest);
    const response = new Response(backendResponse.body, backendResponse);
    Object.entries(corsHeaders(origin)).forEach(([key, value]) => response.headers.set(key, value));

    if (isCacheable(request, incomingUrl) && backendResponse.ok) {
      response.headers.set('Cache-Control', `public, max-age=${CACHE_TTL_SECONDS}`);
      response.headers.set('x-woof-cache', 'MISS');
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }

    return response;
  },
};
