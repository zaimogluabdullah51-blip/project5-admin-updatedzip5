import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/tck.js', import.meta.url), 'utf8');
const binding = source.slice(source.indexOf('function bindLocalReferenceSearch()'), source.indexOf('\n}', source.indexOf('function bindLocalReferenceSearch()')) + 2);
function setup(fetch) {
  const elements = new Map();
  const documentListeners = {};
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', dataset: {}, hidden: true, listeners: {}, textContent: '',
      addEventListener(name, fn) { this.listeners[name] = fn; },
      setAttribute() {}, removeAttribute() {}, focus() {}, scrollIntoView() {},
      querySelector(selector) { return selector.includes('submit') ? element('submit') : { value: '' }; }
    });
    return elements.get(id);
  }
  const modes = ['text', 'browse', 'citation'].map(mode => {
    const item = element(mode); item.dataset.localMode = mode; return item;
  });
  const context = vm.createContext({
    document: { getElementById: element, addEventListener(name, fn) { documentListeners[name] = fn; },
      querySelectorAll: selector => selector === '[data-local-mode]' ? modes : [] },
    window: { addEventListener() {}, requestAnimationFrame() {} }, AbortController, URLSearchParams, fetch,
    localSearchMode: 'text', loadLocalSearchOptions() {},
    renderLocalReferenceResults() { element('rendered').textContent = 'yes'; }
  });
  vm.runInContext(binding + '\nbindLocalReferenceSearch();', context);
  element('local-text-input').value = 'sanık';
  return { element, referenceSearch: legalRef => documentListeners['legal-reference-search']({ detail: { legalRef } }), submit: () => {
    element('local-reference-form').listeners.submit({ preventDefault() {} });
  }};
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('missing citation tags are not presented as proof that a decision has no references', () => {
  const start = source.indexOf('function renderLocalReferenceResults(');
  const renderer = source.slice(start, source.indexOf('async function loadLocalSearchOptions()', start));
  const results = {}, status = {};
  const context = vm.createContext({
    document: { getElementById: id => id === 'local-reference-results' ? results : status },
    esc: String, escAttribute: String,
  });
  vm.runInContext(renderer, context);
  context.renderLocalReferenceResults([{ court: 'Test Court', citation_count: 0 }], '', 'browse');
  assert.match(results.innerHTML, /Atıf etiketi yok/);
  assert.doesNotMatch(results.innerHTML, /Atıfsız/);
  context.renderLocalReferenceResults([{ court: 'Test Court', citation_count: 2 }], '', 'browse');
  assert.match(results.innerHTML, /2 mevzuat atfı/);
});

test('options distinguish catalog readiness from citation readiness', async () => {
  const start = source.indexOf('async function loadLocalSearchOptions()');
  const optionsCode = source.slice(start, source.indexOf('\nfunction bindLocalReferenceSearch()', start));
  for (const citationReady of [false, true, undefined]) {
    const elements = new Map();
    const element = id => {
      if (!elements.has(id)) elements.set(id, { value: '', dataset: {}, replaceChildren() {}, appendChild() {} });
      return elements.get(id);
    };
    const radios = [{ value: '', checked: false }, { value: 'tagged', checked: true }];
    const context = vm.createContext({
      document: { getElementById: element, querySelectorAll: () => radios, createElement: () => ({}) },
      AbortSignal, localOptionsRequestId: 0, navigator: { onLine: true },
      fetch: async () => ({ ok: true, json: async () => ({
        ready: true, courts: [{ court: 'Test Court', count: 10 }],
        text_search_ready: false, citation_search_ready: citationReady,
      }) }),
    });
    vm.runInContext(optionsCode, context);
    await context.loadLocalSearchOptions();
    assert.equal(element('local-index-ready').dataset.state, 'ready');
    assert.equal(element('local-reference-input').disabled, citationReady === false);
    assert.equal(element('local-text-input').disabled, true);
    assert.equal(radios[1].disabled, citationReady === false);
    if (citationReady === false) {
      assert.equal(radios[0].checked, true);
      assert.equal(radios[1].checked, false);
    }
  }
});

test('keyword search shows progress and cancel aborts without rendering stale results', async () => {
  let signal, resolve;
  const app = setup((url, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); });
  app.submit();
  assert.equal(app.element('local-search-cancel').hidden, false);
  assert.match(app.element('local-reference-status').textContent, /zaman alabilir/);
  app.element('local-search-cancel').listeners.click();
  assert.equal(signal.aborted, true);
  resolve({ ok: true, status: 200, json: async () => ({ results: [] }) });
  await settle();
  assert.match(app.element('local-reference-status').textContent, /iptal edildi/);
  assert.equal(app.element('rendered').textContent, '');
  assert.equal(app.element('submit').disabled, false);
});

test('article card event uses the structured citation search', async () => {
  const urls = [];
  const app = setup(async url => {
    urls.push(new URL(url, 'http://localhost'));
    return { ok: true, json: async () => ({ results: [] }) };
  });
  app.referenceSearch('TCK 314'); await settle();
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/api/legal-index/search');
  assert.equal(urls[0].searchParams.get('legalRef'), 'TCK 314');
  assert.equal(urls[0].searchParams.get('citationState'), 'tagged');
});

test('gateway timeout with a non-JSON body is not an empty result', async () => {
  const app = setup(async () => ({ ok: false, status: 504, json: async () => { throw new Error('HTML'); } }));
  app.submit(); await settle();
  assert.match(app.element('local-reference-status').textContent, /süre sınırına/);
  assert.equal(app.element('rendered').textContent, '');
  assert.equal(app.element('local-search-cancel').hidden, true);
});

test('successful empty results are rendered, malformed success is an error', async () => {
  for (const payload of [{ results: [] }, {}]) {
    const app = setup(async () => ({ ok: true, status: 200, json: async () => payload }));
    app.submit(); await settle();
    assert.equal(app.element('rendered').textContent, payload.results ? 'yes' : '');
    if (!payload.results) assert.match(app.element('local-reference-status').textContent, /yanıtı alınamadı/);
  }
});

test('number-only search sends exact filters and preserves them for the next page', async () => {
  const urls = [];
  const app = setup(async url => {
    urls.push(new URL(url, 'http://localhost'));
    return { ok: true, status: 200, json: async () => ({ results: [{}], has_more: true }) };
  });
  app.element('browse').listeners.click();
  app.element('local-case-number').value = ' 2026/123 ';
  app.element('local-decision-number').value = '2026/456';
  app.submit(); await settle();
  app.element('local-page-next').listeners.click(); await settle();
  assert.equal(urls.length, 2);
  for (const url of urls) {
    assert.equal(url.searchParams.get('caseNo'), '2026/123');
    assert.equal(url.searchParams.get('decisionNo'), '2026/456');
    assert.equal(url.searchParams.has('query'), false);
  }
  assert.equal(urls[1].searchParams.get('offset'), '20');
});

test('incomplete citations do not issue a search or prevent number-only browsing', async () => {
  let requests = 0;
  const app = setup(async () => {
    requests++;
    return { ok: true, json: async () => ({ results: [] }) };
  });
  app.element('local-reference-input').disabled = true;
  app.element('citation').listeners.click();
  app.element('local-reference-input').value = 'TCK 314';
  app.submit(); await settle();
  assert.equal(requests, 0);
  assert.match(app.element('local-reference-status').textContent, /hazırlanması sürüyor/);
  app.element('browse').listeners.click();
  app.element('local-case-number').value = '2026/123';
  app.submit(); await settle();
  assert.equal(requests, 1);
});
