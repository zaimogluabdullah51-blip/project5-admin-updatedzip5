import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseDecisionMetadata, normalizeCourt } from './decision-metadata-parser.mjs';

export const metadataParserHash = createHash('sha256')
  .update(fs.readFileSync(new URL('./decision-metadata-parser.mjs', import.meta.url)))
  .digest('hex');
export const metadataPolicyVersion = 'preserve-source-fill-high-v1';

export function evaluateDecisionMetadata(row) {
  const parsed = parseDecisionMetadata(row.text);
  const fields = {};
  for (const field of ['court', 'decision_date']) {
    const original = (field === 'court' ? row.court : row.karar_tarihi) ?? null;
    const missing = !String(original ?? '').trim() || String(original).trim() === '-';
    const candidate = parsed[field];
    const normalized = field === 'court' ? normalizeCourt(original) : original;
    const accepted = candidate.value && candidate.confidence === 'high' && candidate.flags.length === 0;
    const status = !candidate.value ? 'unresolved' : !accepted ? 'needs_review'
      : missing ? 'proposed_fill' : normalized === candidate.value ? 'supported' : 'conflict';
    // Keep court display spelling; comparison uses the normalized parser value.
    const display = field === 'court'
      ? candidate.candidates.find(c => c.value === candidate.value)?.raw.trim()
      : candidate.value;
    fields[field] = { original, parsed: candidate, status,
      effective: status === 'proposed_fill' ? display : original };
  }
  return { parser_sha256: metadataParserHash, policy_version: metadataPolicyVersion,
    text_sha256: createHash('sha256').update(String(row.text ?? '')).digest('hex'), fields };
}
