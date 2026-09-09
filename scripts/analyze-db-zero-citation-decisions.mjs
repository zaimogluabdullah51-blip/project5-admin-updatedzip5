import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadLegalParser } from "./load-legal-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = (process.env.INDEXER_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://davatakibi.onrender.com").replace(/\/+$/, "");
const USERNAME = process.env.INDEXER_ADMIN_USER || process.env.ADMIN_USER || "admin";
const PASSWORD = process.env.INDEXER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin135";
const CONFIG = process.env.HF_DATASET_CONFIG || "yargitay";
const TARGET_LIMIT = Math.min(Math.max(Number(process.env.ZERO_CITATION_TARGET_LIMIT || 2000), 1), 50000);
const ENDPOINT_LIMIT = Math.min(Math.max(Number(process.env.ZERO_CITATION_ENDPOINT_LIMIT || Math.min(TARGET_LIMIT, 5000)), 1), 50000);
const SCAN_LIMIT = Math.min(Math.max(Number(process.env.ZERO_CITATION_SCAN_LIMIT || Math.max(ENDPOINT_LIMIT * 12, 5000)), 1), 500000);
const START_OFFSET = Math.max(Number(process.env.ZERO_CITATION_START_OFFSET || 0), 0);
const MAX_PAGES = Math.max(Number(process.env.ZERO_CITATION_MAX_PAGES || 20), 1);
const SAMPLE_PER_BUCKET = Math.max(Number(process.env.ZERO_CITATION_SAMPLE_PER_BUCKET || 10), 1);
const OUT = process.env.ZERO_CITATION_ANALYSIS_OUT || `/tmp/db-zero-citation-analysis-${CONFIG}-${Date.now()}.json`;
const AUDIT_RECOVERED = String(process.env.ZERO_CITATION_AUDIT_RECOVERED || "").toLowerCase() === "true";
const AUDIT_BATCH_SIZE = Math.min(Math.max(Number(process.env.ZERO_CITATION_AUDIT_BATCH_SIZE || 200), 1), 500);

const parser = loadLegalParser();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login() {
  const response = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  });
  if (!response.ok) throw new Error(`Login failed (${response.status}): ${await response.text().catch(() => "")}`);
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Login did not return an auth cookie.");
  return cookie.split(";")[0];
}

async function fetchZeroCitationPage(cookie, offset) {
  const url = new URL(`${BASE_URL}/api/legal-index/zero-citation-decisions`);
  url.searchParams.set("limit", String(ENDPOINT_LIMIT));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("scan_limit", String(SCAN_LIMIT));
  url.searchParams.set("order", "oldest");
  const response = await fetch(url, { headers: { Cookie: cookie } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Zero-citation lookup failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  return payload;
}

function streamParquetRowsByIds(ids) {
  const file = path.join(os.tmpdir(), `hf-zero-citation-ids-${process.pid}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(ids));
  const child = spawn("python3", [path.join(__dirname, "export-hf-parquet-by-ids.py")], {
    env: {
      ...process.env,
      HF_DATASET_CONFIG: CONFIG,
      HF_ID_FILE: file
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stderr.on("data", chunk => process.stderr.write(chunk));
  const exitPromise = new Promise(resolve => child.on("close", resolve));
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  return {
    lines,
    async waitForExit() {
      const code = await exitPromise;
      fs.rmSync(file, { force: true });
      if (code !== 0) throw new Error(`Parquet export failed with exit code ${code}`);
    }
  };
}

async function postAuditRows(cookie, rows) {
  const response = await fetch(`${BASE_URL}/api/legal-index/audit-rows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      compact: true,
      insertRuleOnly: true,
      rows
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Audit rows failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  return payload;
}

function fold(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

function excerpt(text, index = 0, radius = 280) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function firstMatch(text, regex) {
  regex.lastIndex = 0;
  const match = regex.exec(text);
  regex.lastIndex = 0;
  return match;
}

function addSample(bucket, row, reason, evidence, extra = {}) {
  bucket.count += 1;
  if (bucket.examples.length >= SAMPLE_PER_BUCKET) return;
  bucket.examples.push({
    id: row.id,
    court: row.court || "",
    karar_tarihi: row.karar_tarihi || "",
    hf_tags: Array.isArray(row.mevzuat_atif) ? row.mevzuat_atif.slice(0, 8) : [],
    reason,
    evidence: String(evidence || "").replace(/\s+/g, " ").trim().slice(0, 900),
    ...extra
  });
}

const buckets = {
  parser_now_tags: { count: 0, examples: [] },
  hf_has_tag_parser_zero: { count: 0, examples: [] },
  temporary_article_statute: { count: 0, examples: [] },
  explicit_law_article_like: { count: 0, examples: [] },
  abbreviation_article_like: { count: 0, examples: [] },
  treaty_or_international_article: { count: 0, examples: [] },
  regulation_or_tariff_article: { count: 0, examples: [] },
  contract_or_spec_article: { count: 0, examples: [] },
  case_law_article_false_friend: { count: 0, examples: [] },
  article_less_law_reference: { count: 0, examples: [] },
  general_illegality: { count: 0, examples: [] },
  decision_history_only: { count: 0, examples: [] },
  other: { count: 0, examples: [] }
};

const regexes = {
  temporaryArticle: /\b(?:\d{3,4}\s*(?:s\.?|sayılı)\s+)?(?:[^.\n]{0,140}?)\b(?:kanun|yasa)(?:u|ı|i|un|ın|in|nun|nın|nin|na|ne|da|de)?(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün))?[\s\S]{0,160}?\bgeçici\s+\d{1,4}\s*\.?\s*(?:madde|maddesi|maddesinin|maddesinde)|\b(?:\d{3,4}\s*(?:s\.?|sayılı)\s+)?(?:[^.\n]{0,140}?)\b(?:kanun|yasa)(?:u|ı|i|un|ın|in|nun|nın|nin|na|ne|da|de)?(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün))?[\s\S]{0,160}?\bgeçici\s+madde\s+\d{1,4}/iu,
  explicitLawArticle: /\b(?:\d{3,4}|[1lIİı]\d{2,3})\s*(?:s\.?|sayılı)\s+(?!KHK\b)(?!Kanun(?:la|le|un|unla)?\s+değiş)(?:[^.\n]{0,180}?)\b(?:kanun|yasa)(?:u|ı|i|un|ın|in|nun|nın|nin|na|ne|da|de)?(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün))?[\s\S]{0,220}?\b(?:m\.|md\.|mad\.?|madde|maddesi|maddesinde|maddesine|maddesinin)\s*\d{1,4}(?:\s*[/.-]\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü-]+)?/iu,
  abbreviationArticle: /\b(?:TCK|TCY|CMK|CMUK|HUMK|HMUK|HUMY|HYUY|HMK|İİK|IIK|İYUK|BK|TBK|MK|TMK|TTK|VUK|SSK|KDVK|TKHK|AİHS|AIHS|A\.İ\.H\.S\.)\s*(?:'|’|`|´)?\s*(?:nun|nın|nin|na|ne|da|de)?\.?\s*(?:m\.|md\.|mad\.?|madde|maddesi|maddesinde|maddesine|maddesinin)\s*\d{1,4}(?:\s*\/\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü-]+)?/iu,
  treatyArticle: /\b(?:Avrupa\s+İnsan\s+Hakları\s+Sözleşmesi|İnsan\s+Hakları\s+Avrupa\s+Sözleşmesi|AİHS|AIHS|Birleşmiş\s+Milletler|uluslararası\s+sözleşme)[\s\S]{0,140}?\b(?:m\.|md\.|mad\.?|madde|maddesi|maddesinde|maddesine|maddesinin)\s*\d{1,4}/iu,
  regulationTariff: /\b(?:yönetmelik|tüzük|tarife|tebliğ|genelge)(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün|na|ne|da|de))?[\s\S]{0,120}?\b(?:\d{1,4}\s*\.?\s*(?:madde|maddesi|maddesinde|maddesinin)|(?:m\.|md\.|madde|maddesi)\s*\d{1,4})\b/iu,
  contractSpec: /\b(?:sözleşme|şartname|protokol|ihale\s+dokümanı|teknik\s+şartname|idari\s+şartname)(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün|na|ne|da|de))?[\s\S]{0,120}?\b(?:\d{1,4}\s*\.?\s*(?:madde|maddesi|maddesinde|maddesinin)|(?:m\.|md\.|madde|maddesi)\s*\d{1,4})\b/iu,
  caseLaw: /\b(?:Yargıtay|Danıştay|Anayasa\s+Mahkemesi|Uyuşmazlık\s+Mahkemesi|İçtihad[ıi]\s+Birleştirme)[\s\S]{0,180}?\b(?:\d{1,4}\s*\.?\s*(?:madde|maddesi)|(?:madde|maddesi)\s*\d{1,4}|sayılı\s+(?:karar|ilam))\b/iu,
  articleLessLaw: /\b(?:\d{3,4}|[1lIİı]\d{2,3})\s*(?:s\.?|sayılı)\s+(?:[^.\n]{0,160}?)\b(?:kanun|yasa|khk|kanun hükmünde kararname)\b|\b(?:ceza|hukuk|borçlar|medeni|icra|iflas|kadastro|kamulaştırma|orman|harçlar|avukatlık|noterlik|tüketici|iş|trafik|imar|vergi)\s+(?:kanunu|yasası)\b/iu,
  generalIllegality: /\b(?:kanuna|yasaya|hukuka|usul ve yasaya|usul ve kanuna)\s+aykır[ıi]|\b(?:kanuna|yasaya)\s+muhalefet\b/iu,
  decisionHistory: /\b(?:esas|karar|bozma|direnme|temyiz|onama|mahkemece|dairesi|kurulu|gün ve|sayılı karar|sayılı ilam)\b/iu
};

function classifyZeroParserRow(row) {
  const text = row.text || "";
  const hfHasTags = Array.isArray(row.mevzuat_atif) && row.mevzuat_atif.length > 0;
  if (hfHasTags) {
    const match = firstMatch(text, regexes.articleLessLaw) || { index: 0 };
    addSample(buckets.hf_has_tag_parser_zero, row, "HF tag exists but local parser still emits zero", excerpt(text, match.index));
  }

  const ordered = [
    ["temporary_article_statute", regexes.temporaryArticle, "Temporary article needs source-kind/article-kind support"],
    ["explicit_law_article_like", regexes.explicitLawArticle, "Numbered statute and article-like expression remains unparsed"],
    ["abbreviation_article_like", regexes.abbreviationArticle, "Known legal abbreviation and article-like expression remains unparsed"],
    ["treaty_or_international_article", regexes.treatyArticle, "Treaty or international convention article is outside current statute schema"],
    ["regulation_or_tariff_article", regexes.regulationTariff, "Regulation/tariff source is outside current statute schema"],
    ["contract_or_spec_article", regexes.contractSpec, "Contract/specification article is not statute legislation"],
    ["case_law_article_false_friend", regexes.caseLaw, "Case-law/procedural reference looks article-like but is not a statute article"],
    ["article_less_law_reference", regexes.articleLessLaw, "Law source exists without a concrete article"],
    ["general_illegality", regexes.generalIllegality, "Generic illegality formula without concrete law/article"],
    ["decision_history_only", regexes.decisionHistory, "Procedural history/case-number text without concrete statute article"]
  ];

  for (const [bucketName, regex, reason] of ordered) {
    const match = firstMatch(text, regex);
    if (!match) continue;
    addSample(buckets[bucketName], row, reason, excerpt(text, match.index));
    return bucketName;
  }

  addSample(buckets.other, row, "No obvious statute-source signal", excerpt(text, 0));
  return "other";
}

async function collectZeroCitationIds(cookie) {
  const ids = [];
  const seen = new Set();
  const pages = [];
  let offset = START_OFFSET;

  for (let pageIndex = 0; pageIndex < MAX_PAGES && ids.length < TARGET_LIMIT;) {
    const page = await fetchZeroCitationPage(cookie, offset);
    pages.push({
      offset,
      rows_returned: page.rows_returned || 0,
      decisions_scanned: page.decisions_scanned || 0,
      next_offset: page.next_offset || offset
    });
    for (const id of page.hf_ids || []) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      if (ids.length >= TARGET_LIMIT) break;
    }
    if (!page.next_offset || page.next_offset <= offset || !page.rows_returned) break;
    offset = page.next_offset;
    pageIndex += 1;
  }

  return { ids, pages, next_offset: offset };
}

async function loadRowsForIds(ids) {
  const { lines, waitForExit } = streamParquetRowsByIds(ids);
  const rows = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  await waitForExit();
  return rows;
}

async function auditRecoveredRows(cookie, rows) {
  const totals = {
    rows_sent: 0,
    decisions_indexed: 0,
    citations_indexed: 0
  };
  for (let index = 0; index < rows.length; index += AUDIT_BATCH_SIZE) {
    const batch = rows.slice(index, index + AUDIT_BATCH_SIZE);
    const result = await postAuditRows(cookie, batch);
    totals.rows_sent += Number(result.rows_received || 0);
    totals.decisions_indexed += Number(result.decisions_indexed || 0);
    totals.citations_indexed += Number(result.citations_indexed || 0);
    console.log(`[${new Date().toISOString()}] audited_recovered=${totals.rows_sent}/${rows.length}, citations=${totals.citations_indexed}`);
    await sleep(100);
  }
  return totals;
}

console.log(`Target: ${BASE_URL}`);
console.log(`Config: ${CONFIG}`);
console.log(`Zero-citation target: ${TARGET_LIMIT}, endpoint_limit=${ENDPOINT_LIMIT}, scan_limit=${SCAN_LIMIT}`);
console.log(`Audit recovered rows: ${AUDIT_RECOVERED}`);

const cookie = await login();
const { ids, pages, next_offset } = await collectZeroCitationIds(cookie);
console.log(`Collected zero-citation hf_ids=${ids.length}, next_offset=${next_offset}`);

const rows = await loadRowsForIds(ids);
const rowIds = new Set(rows.map((row) => row.id).filter(Boolean));
const missingIds = ids.filter((id) => !rowIds.has(id));
const recoveredRows = [];
const repeatedPhrases = new Map();

for (const row of rows) {
  const text = row.text || "";
  const refs = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(text));
  if (refs.length) {
    recoveredRows.push(row);
    addSample(
      buckets.parser_now_tags,
      row,
      "Current parser finds statute citation although DB has no citation row",
      excerpt(text, Number(refs[0].position || 0)),
      { parser_refs: refs.slice(0, 8).map((ref) => parser.canonicalLegalRef(ref)).filter(Boolean) }
    );
    continue;
  }

  classifyZeroParserRow(row);

  const phraseRegex = /\b((?:\d{3,4}\s*(?:S\.?|sayılı)\s+)?[A-ZÇĞİÖŞÜa-zçğıöşü0-9 .()'’/-]{0,100}(?:Kanun|Yasa|KHK|Yönetmelik|Tüzük|Tarife|Şartname|Sözleşme)[A-ZÇĞİÖŞÜa-zçğıöşü0-9 .()'’/-]{0,100})/gu;
  for (const match of text.matchAll(phraseRegex)) {
    const key = fold(match[1]).replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 140);
    repeatedPhrases.set(key, (repeatedPhrases.get(key) || 0) + 1);
  }
}

const audit = AUDIT_RECOVERED && recoveredRows.length
  ? await auditRecoveredRows(cookie, recoveredRows)
  : null;

const report = {
  summary: {
    config: CONFIG,
    requested_zero_citation_ids: TARGET_LIMIT,
    collected_zero_citation_ids: ids.length,
    parquet_rows_found: rows.length,
    missing_parquet_rows: missingIds.length,
    parser_recovered_rows: recoveredRows.length,
    parser_still_zero_rows: rows.length - recoveredRows.length,
    endpoint_pages: pages,
    audit_recovered: audit,
    generated_at: new Date().toISOString()
  },
  bucket_counts: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.count])),
  buckets,
  missing_ids: missingIds.slice(0, 200),
  repeated_phrases: [...repeatedPhrases.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([phrase, count]) => ({ phrase, count }))
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  summary: report.summary,
  bucket_counts: report.bucket_counts,
  out: OUT
}, null, 2));
