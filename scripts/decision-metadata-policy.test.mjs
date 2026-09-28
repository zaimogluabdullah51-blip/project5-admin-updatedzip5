import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDecisionMetadata } from './decision-metadata-policy.mjs';

const text = '2. Hukuk Dairesi 2020/1 E., 2020/2 K.\nKarar tarihi: 12.03.2020\n';
test('fills missing metadata and preserves display text and originals', () => {
  const result = evaluateDecisionMetadata({ text, court: '-', karar_tarihi: null });
  assert.equal(result.fields.court.original, '-');
  assert.equal(result.fields.court.effective, '2. Hukuk Dairesi');
  assert.equal(result.fields.decision_date.effective, '2020-03-12');
  assert.equal(result.fields.decision_date.status, 'proposed_fill');
  assert.match(result.text_sha256, /^[a-f0-9]{64}$/);
});
test('conflicting source values remain unchanged', () => {
  const result = evaluateDecisionMetadata({ text, court: '3. Hukuk Dairesi', karar_tarihi: '2020-03-13' });
  assert.equal(result.fields.court.status, 'conflict');
  assert.equal(result.fields.court.effective, '3. Hukuk Dairesi');
  assert.equal(result.fields.decision_date.status, 'conflict');
  assert.equal(result.fields.decision_date.effective, '2020-03-13');
});
test('ambiguous or year-conflicting candidates cannot fill missing metadata', () => {
  const result = evaluateDecisionMetadata({ text: text + 'ONANMASINA, 13.03.2019 tarihinde karar verildi.' });
  assert.notEqual(result.fields.decision_date.status, 'proposed_fill');
  assert.equal(result.fields.decision_date.effective, null);
});
