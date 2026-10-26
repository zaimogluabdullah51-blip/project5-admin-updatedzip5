import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createLegalSearchV2 } from '../legal-search-v2.mjs';

const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const parser = source.slice(source.indexOf('const LAW_REGISTRY ='), source.indexOf('async function getTckTitleForSearch'));
const routeStart = source.indexOf('app.get("/api/legal-references",');
const route = source.slice(routeStart, source.indexOf('app.get("/api/legal-index/search-options",', routeStart));

async function request(query, fetchImpl) {
  let handler;
  const context = vm.createContext({
    console, URL, URLSearchParams, process: { env: { LEGAL_SEARCH_BACKEND: 'supabase-v2' } },
    normalizeTckCode: value => String(value || '').trim(),
    SUPABASE_URL: 'https://example.invalid', SUPABASE_WRITE_KEY: 'test-only',
    createLegalSearchV2: options => createLegalSearchV2({ ...options, fetchImpl }),
    app: { get(path, fn) { handler = fn; } },
  });
  vm.runInContext(parser + '\n' + route, context);
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ query }, response);
  return response;
}

test('unfiltered legacy preview never loads the old catalog in v2 mode', async () => {
  const response = await request({ limit: '250' }, () => { throw new Error('Unexpected request'); });
  assert.equal(response.code, 200);
  assert.equal(response.body.length, 0);
});

test('filtered references use the v2 RPC with bounded results', async () => {
  const response = await request({ tck: '86', limit: '250' }, async (url, options) => {
    const params = JSON.parse(options.body);
    assert.equal(params.p_reference, '5237:TCK:86');
    assert.equal(params.p_limit, 100);
    return { ok: true, json: async () => ({ results: [{ hf_id: 'test:1' }] }) };
  });
  assert.equal(response.code, 200);
  assert.equal(response.body[0].hf_id, 'test:1');
});

test('incomplete reference index is not hidden behind legacy results', async () => {
  const response = await request({ tck: '86' }, async () => ({
    ok: false, status: 400,
    json: async () => ({ code: '55000', message: 'Full-corpus citation index is incomplete' }),
  }));
  assert.equal(response.code, 503);
  assert.match(response.body.error, /mevzuat etiketleri/);
});
