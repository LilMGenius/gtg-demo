function allowed(origin) {
  if (origin === 'https://lilmgenius.github.io') return true;
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol) && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

export async function handleRankFetch(request, store) {
  const origin = request.headers.get('origin');
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (allowed(origin)) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    headers['access-control-allow-headers'] = 'Content-Type';
  }
  const send = (status, body = {}) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed(origin)) return send(403);
  const path = new URL(request.url).pathname;
  if (!['/api/nick', '/api/line', '/api/lines'].includes(path)) return send(404);
  if (request.method === 'OPTIONS') return send(200);
  if (request.method === 'GET' && path === '/api/lines') return send(200, { lines: await store.lines() });
  if (request.method === 'POST' && ['/api/nick', '/api/line'].includes(path)) {
    let body;
    try { body = await request.json(); } catch { return send(400); }
    if (!body) return send(400);
    const id = String(body.id || '');
    return send(await (path === '/api/nick' ? store.claim(id, body.nick) : store.post(id, body.line)));
  }
  return send(404);
}
