// Served by the Vercel project gtg-demo-api on team devfiance (root directory server/), built from main.
// In server/: npm ci && npx vercel link --project gtg-demo-api --scope devfiance
// npx vercel env pull .env.local --environment=production && npm run migrate
// The game calls its own origin's web/api/; the root vercel.json rewrites that path to https://gtg-demo-api.vercel.app/api.
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
