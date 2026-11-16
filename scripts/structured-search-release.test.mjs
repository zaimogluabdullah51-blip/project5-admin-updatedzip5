import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchReleasePolicy } from '../structured-search-release.mjs';

test('structured release never advertises partial keyword indexes', () => {
  const policy = createSearchReleasePolicy();
  const result = policy.options({ ready: true, citation_search_ready: true,
    text_search_ready: true, text_search_scope: 'preview', catalog_rows: 11045085 });
  assert.equal(result.text_search_ready, false);
  assert.equal(result.text_search_scope, 'unavailable');
  assert.equal(result.citation_search_ready, true);
  assert.equal(result.catalog_rows, 11045085);
});

test('keyword queries are rejected before either backend runs, including legacy q', () => {
  for (const query of [{ query: 'ihale' }, { q: 'Adana' }, { query: ['fesih'] }]) {
    let status, body;
    const response = { status(value) { status = value; return this; }, json(value) { body = value; } };
    createSearchReleasePolicy().guard({ query }, response, () => assert.fail('backend called'));
    assert.equal(status, 503);
    assert.equal(body.code, 'KEYWORD_SEARCH_DISABLED');
  }
});

test('structured requests pass unchanged', () => {
  let calls = 0;
  for (const query of [{ legalRef: 'TCK 125' }, { court: 'Test', dateFrom: '2026-01-01' },
    { caseNo: '2026/1', decisionNo: '2026/2' }, { query: '  ' }]) {
    createSearchReleasePolicy().guard({ query }, {}, () => calls++);
  }
  assert.equal(calls, 4);
});

test('future opt-in still requires backend keyword readiness', () => {
  const policy = createSearchReleasePolicy({ keywordEnabled: true });
  assert.equal(policy.options({ text_search_ready: false }).text_search_ready, false);
  assert.equal(policy.options({ text_search_ready: true }).text_search_ready, true);
});

test('legacy deep searches cannot enqueue jobs in structured-only release', () => {
  let status;
  const response = { status(value) { status = value; return this; }, json(body) {
    assert.equal(body.code, 'DEEP_SEARCH_DISABLED');
  } };
  createSearchReleasePolicy().guardDeepSearch({}, response, () => assert.fail('job enqueued'));
  assert.equal(status, 503);
});
