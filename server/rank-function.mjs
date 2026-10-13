// In server/: npm ci && npx vercel link --project gtg-rank --scope <team>
// npx vercel integration add neon --plan free_v3 -m region=pdx1 -m auth=false
// npx vercel env pull .env.local --environment=production && npm run migrate
// After commercial-plan upgrade: npx vercel deploy --prod
// Set web/index.html gtg-api content to https://<deployment>/api; leave empty before cutover.
import { neon } from '@neondatabase/serverless';
import { createPostgresRankStore } from './postgres-rank.mjs';
import { handleRankFetch } from './rank-http.mjs';

// Vercel Node handler contract: https://vercel.com/docs/functions/runtimes/node-js
export function createRankFunction(store) {
  return async (req, res) => {
    try {
      let body;
      if (!['GET', 'HEAD'].includes(req.method)) {
        let parsed;
        // Vercel's JSON getter may throw; shared routing still owns the 400 and CORS.
        try { parsed = req.body; }
        catch { parsed = '{'; }
        if (parsed !== undefined) body = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        else { body = ''; for await (const chunk of req) body += chunk; }
      }
      const response = await handleRankFetch(new Request(new URL(req.url, 'https://rank.invalid'), {
        method: req.method, headers: req.headers, body
      }), store);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end('{}');
    }
  };
}

let store;
const lazyStore = Object.fromEntries(['claim', 'post', 'lines'].map((method) => [method, (...args) => {
  store ||= createPostgresRankStore(neon(process.env.DATABASE_URL));
  return store[method](...args);
}]));
export default createRankFunction(lazyStore);
