import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('search dates cannot escape HTML attributes and excerpts remain escaped', () => {
  const source = fs.readFileSync(new URL('../public/tck.js', import.meta.url), 'utf8');
  const results = { innerHTML: '' };
  const status = {};
  const document = {
    createElement: () => ({ textContent: '', get innerHTML() {
      return this.textContent.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    } }),
    getElementById: id => id === 'local-reference-results' ? results : status
  };
  const context = vm.createContext({ document });
  vm.runInContext(source.slice(source.indexOf('function esc('), source.indexOf('function updateAdminUI(')), context);
  vm.runInContext(source.slice(source.indexOf('function renderLocalReferenceResults('), source.indexOf('async function loadLocalSearchOptions(')), context);
  context.rows = [{ karar_tarihi: '2025-01-01" onmouseover="bad()', short_preview: '<img src=x onerror=bad()>needle', court: '<script>bad()</script>' }];
  vm.runInContext("renderLocalReferenceResults(rows, 'needle', 'text', 'fulltext')", context);
  assert.ok(results.innerHTML.includes('datetime="2025-01-01&quot; onmouseover=&quot;bad()"'));
  assert.ok(!results.innerHTML.includes('<img'));
  assert.ok(!results.innerHTML.includes('<script>'));
  assert.ok(results.innerHTML.includes('<mark>needle</mark>'));
});
