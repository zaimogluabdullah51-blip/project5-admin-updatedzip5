// Preview local UI against public, read-only production endpoints; no DB credentials.
import express from 'express';
import { fileURLToPath } from 'node:url';
import { createSearchReleasePolicy } from '../structured-search-release.mjs';

const app = express();
const policy = createSearchReleasePolicy();
const allowed = new Set(['/api/legal-index/search-options', '/api/legal-index/search',
  '/api/legal-references', '/api/tck-definitions', '/api/tck-article-parts', '/api/tck-summary']);
app.get(['/api/legal-index/search', '/api/legal-references'], policy.guard);
app.post('/api/deep-search-jobs', policy.guardDeepSearch);
app.use('/api', async (req, res) => {
  const url = new URL(req.originalUrl, 'https://www.davatakibi.com');
  if (req.method !== 'GET' || !allowed.has(url.pathname)) return res.sendStatus(404);
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(75000) });
    const body = await upstream.json();
    res.status(upstream.status).json(url.pathname.endsWith('/search-options') && upstream.ok
      ? policy.options(body) : body);
  } catch {
    res.status(503).json({ error: 'Preview could not reach the public search service.' });
  }
});
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
const server = app.listen(Number(process.env.PORT || 5055), '127.0.0.1', () => {
  console.log(`Read-only structured-search preview: http://127.0.0.1:${server.address().port}/tck.html`);
});
