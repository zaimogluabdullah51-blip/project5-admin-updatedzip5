// Public, read-only release checks. No credentials or corpus downloads.
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] || 'http://127.0.0.1:5000');
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Expected HTTP(S) URL');
async function request(path, query = {}) {
  const url = new URL(path, base);
  url.search = new URLSearchParams(query).toString();
  const start = Date.now();
  const response = await fetch(url, { signal: AbortSignal.timeout(75000) });
  const body = await response.json();
  return { response, body, elapsed_ms: Date.now() - start };
}
const report = [];
async function search(label, query, validate) {
  const { response, body, elapsed_ms } = await request('/api/legal-index/search', { limit: '3', ...query });
  assert.equal(response.status, 200, `${label}: ${body.error}`);
  assert.ok(Array.isArray(body.results), `${label}: missing results`);
  validate(body);
  report.push({ check: label, rows: body.results.length, elapsed_ms });
  return body;
}
const { response, body: options } = await request('/api/legal-index/search-options');
assert.equal(response.status, 200);
assert.equal(options.ready, true);
assert.equal(options.citation_search_ready, true);
assert.equal(options.text_search_ready, false);
assert.equal(options.catalog_rows, 11045085);
assert.ok(options.sources.every(source => source.rows === source.expected && source.citations_complete === source.rows));
report.push({ check: 'catalog readiness', rows: options.catalog_rows });
const first = await search('court/date', {
  court: '1. Ceza Dairesi', dateFrom: '2020-01-01', dateTo: '2026-12-31',
}, body => {
  assert.ok(body.results.length > 0);
  assert.ok(body.results.every(row => row.court === '1. Ceza Dairesi' &&
    row.karar_tarihi >= '2020-01-01' && row.karar_tarihi <= '2026-12-31'));
});
const second = await search('pagination', {
  court: '1. Ceza Dairesi', dateFrom: '2020-01-01', dateTo: '2026-12-31', offset: '3',
}, body => assert.ok(body.results.length > 0));
assert.ok(second.results.every(row => !first.results.some(previous => previous.id === row.id)));
const fixture = first.results.find(row => row.esas_no && row.karar_no);
assert.ok(fixture, 'Need a real case/decision-number fixture');
await search('exact numbers', { court: fixture.court, caseNo: fixture.esas_no, decisionNo: fixture.karar_no }, body => {
  assert.ok(body.results.some(row => row.id === fixture.id));
  assert.ok(body.results.every(row => row.esas_no === fixture.esas_no && row.karar_no === fixture.karar_no));
});
await search('statute', { legalRef: 'TCK 125' }, body => {
  assert.ok(body.results.length > 0);
  assert.ok(body.results.every(row => row.detected_law_refs.some(ref => /^5237:TCK:125(?:$|:)/.test(ref))));
});
await search('no match', { caseNo: '9999/999999999' }, body => assert.equal(body.results.length, 0));
const invalid = await request('/api/legal-index/search', { dateFrom: '2026-02-30' });
assert.equal(invalid.response.status, 400);
report.push({ check: 'invalid date rejected' });
const keyword = await request('/api/legal-index/search', { query: 'ihale' });
assert.equal(keyword.response.status, 503);
report.push({ check: 'keyword disabled', code: keyword.body.code || 'backend readiness gate' });
console.log(JSON.stringify({ base: base.origin, checks: report, decision_text_verified: false }, null, 2));
