import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/tck.js', import.meta.url), 'utf8');
const loader = source.slice(source.indexOf('async function loadLocalSearchOptions()'), source.indexOf('function bindLocalReferenceSearch()'));
function harness(fetch) {
  const nodes = new Map();
  const element = () => ({ value: '', dataset: {}, children: [], replaceChildren(...items) { this.children = items; }, appendChild(item) { this.children.push(item); } });
  const context = vm.createContext({ fetch, AbortSignal, navigator: { onLine: true }, document: {
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
    createElement: element,
  } });
  vm.runInContext('let localOptionsRequestId = 0;\n' + loader, context);
  return { load: () => vm.runInContext('loadLocalSearchOptions()', context), nodes, context };
}
const ready = { ready: true, courts: [{court:'2. Hukuk Dairesi',count:10}], text_search_ready:true, min_date:'2005-01-01',max_date:'2026-01-01' };
const response = value => ({ ok:true, json:async()=>value });

test('missing index can recover without duplicate courts or a disabled text field', async () => {
  let value = { ready:false,courts:[],text_search_ready:false };
  const h = harness(async()=>response(value));
  await h.load();
  assert.equal(h.nodes.get('local-index-ready').textContent, 'İndeks hazır değil');
  assert.equal(h.nodes.get('local-text-input').disabled, true);
  value = ready;
  await h.load();
  h.nodes.get('local-court-input').value = '2. Hukuk Dairesi';
  await h.load();
  assert.equal(h.nodes.get('local-court-input').children.length, 2);
  assert.equal(h.nodes.get('local-court-input').value, '2. Hukuk Dairesi');
  assert.equal(h.nodes.get('local-text-input').disabled, false);
  assert.equal(h.nodes.get('local-index-ready').textContent, 'Hazır');
});
test('network failure is visible and retry recovers', async () => {
  let failing = true;
  const h = harness(async()=>{ if (failing) throw new TypeError('fetch failed'); return response(ready); });
  await h.load();
  assert.equal(h.nodes.get('local-index-ready').dataset.state, 'unavailable');
  assert.equal(h.nodes.get('local-options-retry').hidden, false);
  failing = false;
  await h.load();
  assert.equal(h.nodes.get('local-options-retry').hidden, true);
});
test('an older options request cannot overwrite the recovered state', async () => {
  let resolveOld;
  let count = 0;
  const h = harness(()=>++count===1 ? new Promise(resolve=>{resolveOld=resolve;}) : Promise.resolve(response(ready)));
  const old = h.load();
  await h.load();
  resolveOld(response({ready:false,courts:[],text_search_ready:false}));
  await old;
  assert.equal(h.nodes.get('local-index-ready').textContent, 'Hazır');
  assert.equal(h.nodes.get('local-text-input').disabled, false);
});
