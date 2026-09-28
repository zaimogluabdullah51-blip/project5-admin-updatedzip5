import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";
import { loadLegalParser } from "./load-legal-parser.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dbPath = process.env.LEGAL_INDEX_AUDIT_DB || path.join(root, "data", "legal-index-all.sqlite");
const outputPath = process.env.LEGAL_INDEX_AUDIT_OUT || path.join(root, "data", "legal-index-quality-audit.json");
const perCohort = Math.max(Number(process.env.LEGAL_INDEX_AUDIT_PER_COHORT || 50), 1);
const seed = Math.max(Number(process.env.LEGAL_INDEX_AUDIT_SEED || 20260922), 1);
const cohorts = [
  { name: "1997-2010", from: 1997, to: 2010 },
  { name: "2011-2015", from: 2011, to: 2015 },
  { name: "2016-2020", from: 2016, to: 2020 },
  { name: "2021-2026", from: 2021, to: 2026 }
];

const parser = loadLegalParser();
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY);

function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
}

function closeDb() {
  return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
}

function makeRng(initial) {
  let state = initial >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function sampleDecisionRows(cohort, hasCitation, count, rng) {
  const first = await get(
    `SELECT rowid FROM legal_index_decisions
     WHERE karar_tarihi >= ? ORDER BY karar_tarihi, rowid LIMIT 1`,
    [`${cohort.from}-01-01`]
  );
  const last = await get(
    `SELECT rowid FROM legal_index_decisions
     WHERE karar_tarihi <= ? ORDER BY karar_tarihi DESC, rowid DESC LIMIT 1`,
    [`${cohort.to}-12-31`]
  );
  if (!first || !last) throw new Error(`No rows available for cohort ${cohort.name}`);
  const selected = new Map();
  const attempts = Math.max(count * 30, 1000);
  for (let attempt = 0; attempt < attempts && selected.size < count; attempt += 1) {
    const target = Math.floor(Number(first.rowid) + rng() * (Number(last.rowid) - Number(first.rowid) + 1));
    const row = await get(
      `SELECT rowid, hf_id, source, document_id, court, esas_no, karar_no, karar_tarihi, year,
              citation_count, short_preview
       FROM legal_index_decisions
       WHERE rowid = ?`,
      [target]
    );
    const correctCitationGroup = hasCitation ? Number(row?.citation_count) > 0 : Number(row?.citation_count) === 0;
    if (row && row.year >= cohort.from && row.year <= cohort.to && correctCitationGroup) {
      selected.set(row.hf_id, { ...row, cohort: cohort.name });
    }
  }
  if (selected.size < count) throw new Error(`Could not sample ${count} rows for ${cohort.name}/${hasCitation ? "cited" : "zero"}`);
  return [...selected.values()];
}

async function loadCitations(ids) {
  const result = new Map(ids.map((id) => [id, []]));
  for (let index = 0; index < ids.length; index += 400) {
    const batch = ids.slice(index, index + 400);
    const placeholders = batch.map(() => "?").join(",");
    const rows = await all(
      `SELECT hf_id, law_no, law_code, law_name, article, paragraph, subparagraph,
              canonical_ref, raw_reference, source_method, confidence, quality_status
       FROM legal_index_citations
       WHERE hf_id IN (${placeholders})
       ORDER BY hf_id, position`,
      batch
    );
    for (const row of rows) result.get(row.hf_id)?.push(row);
  }
  return result;
}

async function loadParquetRows(ids) {
  const idFile = path.join(os.tmpdir(), `legal-index-audit-${process.pid}.json`);
  fs.writeFileSync(idFile, JSON.stringify(ids));
  const child = spawn("python3", [path.join(here, "export-hf-parquet-by-ids.py")], {
    env: { ...process.env, HF_DATASET_CONFIG: "yargitay", HF_ID_FILE: idFile },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const rows = new Map();
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    rows.set(row.id, row);
  }
  const code = await new Promise((resolve) => child.on("close", resolve));
  fs.rmSync(idFile, { force: true });
  if (code !== 0) throw new Error(`Parquet export failed (${code}): ${stderr}`);
  return rows;
}

function fold(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/\s+/g, " ")
    .trim();
}

function excerpt(text, needle = "", radius = 260) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const at = needle ? fold(clean).indexOf(fold(needle)) : -1;
  const start = Math.max(0, (at >= 0 ? at : 0) - radius);
  return `${start > 0 ? "..." : ""}${clean.slice(start, start + radius * 2)}${start + radius * 2 < clean.length ? "..." : ""}`;
}

const zeroRules = [
  ["explicit_numbered_law_article", /\b\d{3,4}\s*(?:s\.?|sayılı)\s+[^.\n]{0,180}\b(?:kanun|yasa)[\s\S]{0,180}\b(?:m\.|md\.|madde|maddesi|maddesinin)\s*\d{1,4}/iu],
  ["known_abbreviation_article", /\b(?:TCK|TCY|CMK|CMUK|HUMK|HMK|İİK|IIK|İYUK|BK|TBK|MK|TMK|TTK|VUK|SSK|KDVK|TKHK|AİHS|AIHS)\b[\s\S]{0,90}\b(?:m\.|md\.|madde|maddesi|maddesinin)\s*\d{1,4}/iu],
  ["numbered_law_ordinal_article", /\b\d{3,4}\s*(?:s\.?|sayılı)\s+[^.\n]{0,160}\b(?:kanun|yasa)(?:u|ı|i|un|ın|in|nun|nın|nin)?(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün))?[\s\S]{0,120}\b\d{1,4}\s*(?:ıncı|inci|uncu|üncü|ncı|nci|ncu|ncü)\b/iu],
  ["law_article_with_parenthetical", /\b(?:kanun|yasa)(?:u|ı|i|un|ın|in|nun|nın|nin)?(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün))?\s+\d{1,4}\s*\.?(?:\s*\([^)]{0,120}\))?\s*(?:madde|maddesi|maddesinde|maddesinin)\b/iu],
  ["temporary_article", /\b(?:kanun|yasa)[\s\S]{0,160}\bgeçici\s+(?:madde\s+)?\d{1,4}/iu],
  ["regulation_or_tariff_article", /\b(?:yönetmelik|tüzük|tarife|tebliğ|genelge)[\s\S]{0,120}\b(?:m\.|md\.|madde|maddesi)\s*\d{1,4}/iu],
  ["contract_or_spec_article", /\b(?:sözleşme|şartname|protokol|ihale\s+dokümanı)[\s\S]{0,120}\b(?:m\.|md\.|madde|maddesi)\s*\d{1,4}/iu],
  ["law_without_article", /\b(?:\d{3,4}\s*(?:s\.?|sayılı)\s+[^.\n]{0,100})?(?:kanun|yasa|kanunu|yasası)\b/iu],
  ["generic_illegality", /\b(?:kanuna|yasaya|hukuka|usul ve yasaya)\s+aykır[ıi]/iu]
];

function classifyZero(text) {
  for (const [name, regex] of zeroRules) {
    const match = regex.exec(text);
    if (match) return { name, evidence: excerpt(text, match[0]) };
  }
  return { name: "no_obvious_legislation_signal", evidence: excerpt(text) };
}

function pct(value, total) {
  return total ? Number((value * 100 / total).toFixed(2)) : 0;
}

const rng = makeRng(seed);
const cited = [];
const zero = [];
for (const cohort of cohorts) {
  cited.push(...await sampleDecisionRows(cohort, true, perCohort, rng));
  zero.push(...await sampleDecisionRows(cohort, false, perCohort, rng));
}

const citationsById = await loadCitations(cited.map((row) => row.hf_id));
await closeDb();
const parquetRows = await loadParquetRows([...cited, ...zero].map((row) => row.hf_id));

const positiveReview = [];
let citedRowsReproduced = 0;
let dbRefsReproduced = 0;
let dbRefsTotal = 0;
let rawRefsGrounded = 0;
let rawRefsChecked = 0;

for (const decision of cited) {
  const source = parquetRows.get(decision.hf_id);
  const dbRefs = citationsById.get(decision.hf_id) || [];
  const parsed = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(source?.text || ""));
  const parsedCanonicals = new Set(parsed.map((ref) => parser.canonicalLegalRef(ref)).filter(Boolean));
  const reproduced = dbRefs.filter((ref) => parsedCanonicals.has(ref.canonical_ref)).length;
  if (reproduced === dbRefs.length) citedRowsReproduced += 1;
  dbRefsReproduced += reproduced;
  dbRefsTotal += dbRefs.length;
  for (const ref of dbRefs) {
    if (!ref.raw_reference) continue;
    rawRefsChecked += 1;
    if (fold(source?.text).includes(fold(ref.raw_reference))) rawRefsGrounded += 1;
  }
  positiveReview.push({
    hf_id: decision.hf_id,
    cohort: decision.cohort,
    court: decision.court,
    karar_tarihi: decision.karar_tarihi,
    db_refs: dbRefs.map((ref) => ref.canonical_ref),
    parser_refs_now: [...parsedCanonicals],
    missing_db_refs_now: dbRefs
      .map((ref) => ref.canonical_ref)
      .filter((canonical) => !parsedCanonicals.has(canonical)),
    new_refs_not_in_old_index: [...parsedCanonicals]
      .filter((canonical) => !dbRefs.some((ref) => ref.canonical_ref === canonical)),
    db_citations: dbRefs.map((ref) => ({
      canonical_ref: ref.canonical_ref,
      raw_reference: ref.raw_reference,
      grounded_in_text: Boolean(ref.raw_reference && fold(source?.text).includes(fold(ref.raw_reference))),
      evidence: excerpt(source?.text || "", ref.raw_reference || "")
    })),
    reproduced_refs: reproduced,
    raw_refs_grounded: dbRefs.filter((ref) => ref.raw_reference && fold(source?.text).includes(fold(ref.raw_reference))).length,
    hf_tags: Array.isArray(source?.mevzuat_atif) ? source.mevzuat_atif : [],
    evidence: excerpt(source?.text || "", dbRefs[0]?.raw_reference || ""),
    manual_verdict: "",
    manual_notes: ""
  });
}

const zeroBucketCounts = {};
const zeroReview = [];
let zeroStillZero = 0;
let zeroWithHfTags = 0;
for (const decision of zero) {
  const source = parquetRows.get(decision.hf_id);
  const parsed = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(source?.text || ""));
  if (!parsed.length) zeroStillZero += 1;
  if (Array.isArray(source?.mevzuat_atif) && source.mevzuat_atif.length) zeroWithHfTags += 1;
  const classification = classifyZero(source?.text || "");
  zeroBucketCounts[classification.name] = (zeroBucketCounts[classification.name] || 0) + 1;
  zeroReview.push({
    hf_id: decision.hf_id,
    cohort: decision.cohort,
    court: decision.court,
    karar_tarihi: decision.karar_tarihi,
    parser_refs_now: parsed.map((ref) => parser.canonicalLegalRef(ref)).filter(Boolean),
    hf_tags: Array.isArray(source?.mevzuat_atif) ? source.mevzuat_atif : [],
    auto_bucket: classification.name,
    evidence: classification.evidence,
    manual_verdict: "",
    manual_notes: ""
  });
}

const report = {
  methodology: {
    generated_at: new Date().toISOString(),
    db_path: dbPath,
    seed,
    cohorts,
    sample_per_cohort_per_group: perCohort,
    caveat: "Automated grounding and reproducibility checks are not independent legal accuracy labels. Fill manual_verdict/manual_notes for a human-reviewed precision and recall estimate."
  },
  summary: {
    cited_decisions_sampled: cited.length,
    zero_citation_decisions_sampled: zero.length,
    parquet_rows_found: parquetRows.size,
    cited_rows_fully_reproduced: citedRowsReproduced,
    cited_rows_fully_reproduced_pct: pct(citedRowsReproduced, cited.length),
    db_citations_sampled: dbRefsTotal,
    db_citations_reproduced: dbRefsReproduced,
    db_citations_reproduced_pct: pct(dbRefsReproduced, dbRefsTotal),
    raw_references_checked: rawRefsChecked,
    raw_references_grounded_in_text: rawRefsGrounded,
    raw_references_grounded_pct: pct(rawRefsGrounded, rawRefsChecked),
    zero_rows_still_zero_with_current_parser: zeroStillZero,
    zero_rows_with_hf_tags: zeroWithHfTags,
    zero_bucket_counts: zeroBucketCounts
  },
  positive_review: positiveReview,
  zero_citation_review: zeroReview
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ summary: report.summary, output: outputPath }, null, 2));
