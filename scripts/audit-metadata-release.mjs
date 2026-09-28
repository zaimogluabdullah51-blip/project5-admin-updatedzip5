import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { evaluateDecisionMetadata, metadataParserHash, metadataPolicyVersion } from './decision-metadata-policy.mjs';

// Produce a reviewable sidecar; source database values are never mutated here.
const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length) throw new Error('Usage: node scripts/audit-metadata-release.mjs OUTPUT_DIR INPUT.jsonl [...]');
fs.mkdirSync(output, { recursive: true });
const parserHash = metadataParserHash;
const summary = {
  generated_at: new Date().toISOString(), parser_sha256: parserHash, policy_version: metadataPolicyVersion,
  inputs: [], rows: 0, duplicates: 0, fields: { court: {}, decision_date: {} }, years: {}, courts: {},
  caveat: 'Sampling method is determined by the input. HF agreement is not independently labelled accuracy.',
};
const seen = new Set();
const fd = fs.openSync(path.join(output, 'results.ndjson'), 'wx');
try {
  for (const input of inputs) {
    const hash = createHash('sha256');
    const stream = fs.createReadStream(input);
    stream.on('data', chunk => hash.update(chunk));
    for await (const line of readline.createInterface({ input: stream, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      if (!row.id || typeof row.text !== 'string') throw new Error(`Missing id/text in ${input}`);
      if (seen.has(row.id)) { summary.duplicates++; continue; }
      seen.add(row.id);
      const year = String(row.karar_tarihi ?? '').slice(0, 4) || 'missing';
      summary.years[year] = (summary.years[year] || 0) + 1;
      const court = row.court || 'missing';
      summary.courts[court] = (summary.courts[court] || 0) + 1;
      const evaluation = evaluateDecisionMetadata(row);
      for (const field of ['court', 'decision_date']) {
        const { status } = evaluation.fields[field];
        summary.fields[field][status] = (summary.fields[field][status] || 0) + 1;
      }
      fs.writeSync(fd, JSON.stringify({ hf_id: row.id, ...evaluation }) + '\n');
      summary.rows++;
    }
    summary.inputs.push({ path: path.resolve(input), sha256: hash.digest('hex') });
  }
} finally { fs.closeSync(fd); }
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(summary, null, 2));
