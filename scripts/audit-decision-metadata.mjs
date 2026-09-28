import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseDecisionMetadata, normalizeCourt } from "./decision-metadata-parser.mjs";
import { loadLegalParser } from "./load-legal-parser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const limit = Number(process.env.HF_SAMPLE_LIMIT || 10000);
const offset = Number(process.env.HF_SAMPLE_OFFSET || 0);
const config = process.env.HF_DATASET_CONFIG || "yargitay";
if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0) throw new Error("Invalid sample size/offset");
const out = path.resolve(process.env.HF_METADATA_OUTPUT || "/tmp/hf-metadata-audit");
fs.mkdirSync(out, { recursive: true });
const cache = path.join(out, `${config}-${offset}-${limit}.ndjson`);
if (!fs.existsSync(cache)) {
  console.log(`Fetching ${config}: offset=${offset}, limit=${limit}`);
  const child = spawn("python3", [path.join(here, "export-hf-parquet-sample.py")], {
    env: { ...process.env, HF_SAMPLE_LIMIT: String(limit), HF_SAMPLE_OFFSET: String(offset), HF_DATASET_CONFIG: config },
    stdio: ["ignore", "pipe", "inherit"]
  });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Export failed: ${code}`)));
  });
  fs.writeFileSync(cache, Buffer.concat(chunks));
}
const raw = fs.readFileSync(cache, "utf8");
const rows = raw.trim().split("\n").map((line) => JSON.parse(line));
if (rows.length !== limit || new Set(rows.map((row) => row.id)).size !== limit) throw new Error("Incomplete sample or duplicate IDs");
const summary = {
  rows: rows.length, config, offset, first_id: rows[0].id, last_id: rows.at(-1).id,
  sample_sha256: createHash("sha256").update(raw).digest("hex"),
  parser_sha256: createHash("sha256").update(fs.readFileSync(path.join(here, "decision-metadata-parser.mjs"))).digest("hex"),
  generated_at: new Date().toISOString(),
  caveat: "HF agreement, not independently labelled accuracy; first rows are not a random sample. Court headings may be derived from source metadata.",
  fields: {}, examples: {}, date_flags: {}, legal: { rows_with_hf_tags: 0, hf_refs: 0, rule_refs: 0, hf_canonical_exact: 0, hf_without_canonical_exact: 0, rule_without_canonical_exact: 0, audit_stats: {}, flags: {} }
};
const legalParser = loadLegalParser();
summary.legal_server_sha256 = createHash("sha256").update(fs.readFileSync(path.join(here, "../server.js"))).digest("hex");
const results = [];
for (const row of rows) {
  const parsed = parseDecisionMetadata(row.text);
  const result = { id: row.id, parsed, comparisons: {} };
  for (const flag of parsed.decision_date.flags) summary.date_flags[flag] = (summary.date_flags[flag] || 0) + 1;
  const legal = legalParser.buildAuditedLegalReferencesForRow({ row }, { compact: true, withContext: false, insertRuleOnly: false });
  const hfRefs = legalParser.mergeLegalReferenceCandidates(legalParser.extractLegalReferencesFromHfTags(row, row.text, { withContext: false }));
  const ruleRefs = legalParser.mergeLegalReferenceCandidates(legalParser.extractLegalReferences(row.text));
  const hfSet = new Set(hfRefs.map(legalParser.canonicalLegalRef));
  const ruleSet = new Set(ruleRefs.map(legalParser.canonicalLegalRef));
  summary.legal.rows_with_hf_tags += Number(hfSet.size > 0);
  summary.legal.hf_refs += hfSet.size;
  summary.legal.rule_refs += ruleSet.size;
  summary.legal.hf_canonical_exact += [...hfSet].filter(r => ruleSet.has(r)).length;
  summary.legal.hf_without_canonical_exact += [...hfSet].filter(r => !ruleSet.has(r)).length;
  summary.legal.rule_without_canonical_exact += [...ruleSet].filter(r => !hfSet.has(r)).length;
  for (const [key, value] of Object.entries(legal.stats)) summary.legal.audit_stats[key] = (summary.legal.audit_stats[key] || 0) + value;
  for (const citation of [...legal.citations, ...legal.suggestions]) for (const flag of citation.conflict_flags || []) summary.legal.flags[flag] = (summary.legal.flags[flag] || 0) + 1;
  result.legal = { hf_references: [...hfSet], rule_references: [...ruleSet], ...legal };
  for (const field of ["court", "decision_date"]) {
    const referenceRaw = field === "court" ? row.court : row.karar_tarihi;
    const reference = field === "court" ? normalizeCourt(referenceRaw) : referenceRaw;
    const extracted = parsed[field].value;
    const status = !reference ? "reference_missing" : !extracted ? "not_extracted" : reference === extracted ? "match" : "mismatch";
    const stats = summary.fields[field] ||= { extracted: 0, reference_present: 0, comparable: 0, match: 0, mismatch: 0, not_extracted: 0, reference_missing: 0, ambiguous: 0 };
    stats[status]++;
    if (reference) stats.reference_present++;
    if (extracted) stats.extracted++;
    if (reference && extracted) stats.comparable++;
    if (parsed[field].flags.includes("conflicting_candidates")) stats.ambiguous++;
    result.comparisons[field] = { reference: referenceRaw, status };
    const examples = summary.examples[`${field}_${status}`] ||= [];
    if (examples.length < 12) examples.push({ id: row.id, reference: referenceRaw, extracted, candidates: parsed[field].candidates,
      head: row.text.slice(0, 400), tail: row.text.slice(-700) });
  }
  results.push(result);
  if (results.length % 1000 === 0) console.log(`Audited ${results.length}/${rows.length}`);
}
for (const stats of Object.values(summary.fields)) {
  stats.coverage_pct = 100 * stats.extracted / rows.length;
  stats.agreement_among_comparable_pct = stats.comparable ? 100 * stats.match / stats.comparable : null;
  stats.match_among_reference_present_pct = stats.reference_present ? 100 * stats.match / stats.reference_present : null;
}
fs.writeFileSync(path.join(out, "results.ndjson"), results.map((r) => JSON.stringify(r)).join("\n") + "\n");
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ ...summary, examples: undefined }, null, 2));
console.log(`Detailed report: ${path.join(out, "summary.json")}`);
