import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadLegalParser } from "./load-legal-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = process.env.HF_DATASET_CONFIG || "yargitay";
const START_OFFSET = Math.max(Number(process.env.HF_SAMPLE_OFFSET || 0), 0);
const TOTAL_LIMIT = Math.max(Number(process.env.HF_SAMPLE_LIMIT || 1000000), 1);
const CHUNK_SIZE = Math.min(Math.max(Number(process.env.HF_ANALYZE_CHUNK_SIZE || 50000), 100), 100000);
const OUT = process.env.HF_UNTAGGED_ANALYSIS_OUT || `/tmp/hf-parser-untagged-${CONFIG}-${START_OFFSET}-${TOTAL_LIMIT}.json`;
const SAMPLE_PER_BUCKET = Math.max(Number(process.env.HF_UNTAGGED_SAMPLE_PER_BUCKET || 12), 1);

const parser = loadLegalParser();
const fold = (value) => String(value || "").toLocaleLowerCase("tr-TR");

function streamParquetRows(offset, limit) {
  const child = spawn("python3", [path.join(__dirname, "export-hf-parquet-sample.py")], {
    env: {
      ...process.env,
      HF_DATASET_CONFIG: CONFIG,
      HF_SAMPLE_OFFSET: String(offset),
      HF_SAMPLE_LIMIT: String(limit)
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
      if (code !== 0) throw new Error(`Parquet export failed with exit code ${code}`);
    }
  };
}

function addSample(bucket, row, reason, evidence = "") {
  bucket.count += 1;
  if (bucket.examples.length >= SAMPLE_PER_BUCKET) return;
  bucket.examples.push({
    id: row.id,
    court: row.court || "",
    karar_tarihi: row.karar_tarihi || "",
    hf_tags: Array.isArray(row.mevzuat_atif) ? row.mevzuat_atif.slice(0, 8) : [],
    reason,
    evidence: evidence.replace(/\s+/g, " ").trim().slice(0, 700)
  });
}

function evidenceAround(text, regex) {
  const match = regex.exec(text);
  regex.lastIndex = 0;
  if (!match) return "";
  const start = Math.max(0, match.index - 220);
  const end = Math.min(text.length, match.index + match[0].length + 220);
  return text.slice(start, end);
}

const buckets = {
  hf_has_tag_parser_zero: { count: 0, examples: [] },
  explicit_law_article_like: { count: 0, examples: [] },
  abbreviation_article_like: { count: 0, examples: [] },
  numbered_law_no_article: { count: 0, examples: [] },
  law_name_no_article: { count: 0, examples: [] },
  regulation_or_tariff: { count: 0, examples: [] },
  contract_or_spec: { count: 0, examples: [] },
  ibbk_or_case_law: { count: 0, examples: [] },
  general_illegality: { count: 0, examples: [] },
  decision_history_only: { count: 0, examples: [] },
  other: { count: 0, examples: [] }
};

const regexes = {
  explicitLawArticle: /\b(?:\d{3,4}|[1lIİı]\d{2,3})\s*(?:s\.?|sayılı)\s+(?:[^.\n]{0,140}?)\b(?:kanun|yasa|khk|kanun hükmünde kararname)\b[^.\n]{0,180}?\b(?:m\.|md\.|madde|maddesi|maddesinde|maddesine|maddesinin)\s*\d{1,4}(?:\s*\/\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü-]+)?/iu,
  abbreviationArticle: /\b(?:TCK|TCY|CMK|CMUK|HUMK|HMUK|HUMY|HYUY|HMK|İİK|IIK|İYUK|BK|TBK|MK|TMK|TTK|VUK|SSK|KDVK|TKHK)\s*(?:'|’|`|´)?\s*(?:nun|nın|nin|na|ne|da|de)?\.?\s*(?:m\.|md\.|madde|maddesi|maddesinde|maddesine|maddesinin)\s*\d{1,4}(?:\s*\/\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü-]+)?/iu,
  numberedLawNoArticle: /\b(?:\d{3,4}|[1lIİı]\d{2,3})\s*(?:s\.?|sayılı)\s+(?:[^.\n]{0,120}?)\b(?:kanun|yasa|khk|kanun hükmünde kararname)\b/iu,
  lawNameNoArticle: /\b(?:ceza|hukuk|borçlar|medeni|icra|iflas|kadastro|kamulaştırma|orman|harçlar|avukatlık|noterlik|tüketici|iş|trafik|imar|vergi)\s+(?:kanunu|yasası)\b/iu,
  regulationTariff: /\b(?:yönetmelik|tüzük|tarife|tebliğ|genelge)\b/iu,
  contractSpec: /\b(?:sözleşme|şartname|protokol|ihale dokümanı|teknik şartname|idari şartname)\b/iu,
  ibbkCase: /\b(?:içtihad[ıi] birleştirme|yargıtay [^.\n]{0,80}(?:kararı|ilamı)|anayasa mahkemesi kararı|danıştay [^.\n]{0,80}kararı)\b/iu,
  generalIllegality: /\b(?:kanuna|yasaya|hukuka|usul ve yasaya|usul ve kanuna)\s+aykır[ıi]/iu,
  decisionHistory: /\b(?:esas|karar|bozma|direnme|temyiz|onama|mahkemece|dairesi|kurulu|gün ve|sayılı karar|sayılı ilam)\b/iu
};

const phraseCounts = new Map();
const summary = {
  config: CONFIG,
  start_offset: START_OFFSET,
  limit: TOTAL_LIMIT,
  scanned: 0,
  parser_tagged_rows: 0,
  untagged_rows: 0,
  hf_tagged_while_parser_zero: 0,
  hf_tagged_rows: 0,
  generated_at: null
};

for (let offset = START_OFFSET; offset < START_OFFSET + TOTAL_LIMIT;) {
  const chunkLimit = Math.min(CHUNK_SIZE, START_OFFSET + TOTAL_LIMIT - offset);
  const { lines, waitForExit } = streamParquetRows(offset, chunkLimit);
  let chunkRows = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    chunkRows += 1;
    summary.scanned += 1;
    if (Array.isArray(row.mevzuat_atif) && row.mevzuat_atif.length) summary.hf_tagged_rows += 1;

    const refs = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(row.text || ""));
    if (refs.length) {
      summary.parser_tagged_rows += 1;
      continue;
    }

    summary.untagged_rows += 1;
    const text = row.text || "";
    const lower = fold(text);
    const hfHasTags = Array.isArray(row.mevzuat_atif) && row.mevzuat_atif.length;
    if (hfHasTags) {
      summary.hf_tagged_while_parser_zero += 1;
      addSample(buckets.hf_has_tag_parser_zero, row, "HF has mevzuat_atif but local parser emitted zero", text.slice(0, 700));
    }

    const phraseRegex = /([A-ZÇĞİÖŞÜa-zçğıöşü0-9 .()'’/-]{0,80}(?:Kanun|Yasa|Yönetmelik|Tüzük|Tarife|Şartname|Sözleşme)[A-ZÇĞİÖŞÜa-zçğıöşü0-9 .()'’/-]{0,80})/gu;
    for (const match of text.matchAll(phraseRegex)) {
      const phrase = match[0].replace(/\s+/g, " ").trim();
      const key = fold(phrase).replace(/\d+/g, "#").slice(0, 120);
      phraseCounts.set(key, (phraseCounts.get(key) || 0) + 1);
    }

    if (regexes.explicitLawArticle.test(text)) {
      addSample(buckets.explicit_law_article_like, row, "Numbered law and article-like expression", evidenceAround(text, regexes.explicitLawArticle));
    } else if (regexes.abbreviationArticle.test(text)) {
      addSample(buckets.abbreviation_article_like, row, "Known abbreviation and article-like expression", evidenceAround(text, regexes.abbreviationArticle));
    } else if (regexes.numberedLawNoArticle.test(text)) {
      addSample(buckets.numbered_law_no_article, row, "Law number/name exists, article missing or outside parser grammar", evidenceAround(text, regexes.numberedLawNoArticle));
    } else if (regexes.lawNameNoArticle.test(text)) {
      addSample(buckets.law_name_no_article, row, "Law name exists without article", evidenceAround(text, regexes.lawNameNoArticle));
    } else if (regexes.regulationTariff.test(text)) {
      addSample(buckets.regulation_or_tariff, row, "Regulation/tariff type source", evidenceAround(text, regexes.regulationTariff));
    } else if (regexes.contractSpec.test(text)) {
      addSample(buckets.contract_or_spec, row, "Contract/specification article, not statute article", evidenceAround(text, regexes.contractSpec));
    } else if (regexes.ibbkCase.test(text)) {
      addSample(buckets.ibbk_or_case_law, row, "Case law or içtihadı birleştirme reference", evidenceAround(text, regexes.ibbkCase));
    } else if (regexes.generalIllegality.test(text)) {
      addSample(buckets.general_illegality, row, "Generic illegality formula without concrete law/article", evidenceAround(text, regexes.generalIllegality));
    } else if (regexes.decisionHistory.test(lower)) {
      addSample(buckets.decision_history_only, row, "Mostly procedural/case-history references", text.slice(0, 700));
    } else {
      addSample(buckets.other, row, "No obvious legal-source signal", text.slice(0, 700));
    }
  }

  await waitForExit();
  if (chunkRows === 0) break;
  offset += chunkRows;
  console.log(`[${new Date().toISOString()}] scanned=${summary.scanned}, untagged=${summary.untagged_rows}`);
}

summary.generated_at = new Date().toISOString();
const report = {
  summary,
  buckets,
  repeated_phrases: [...phraseCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([phrase, count]) => ({ phrase, count }))
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ summary, bucket_counts: Object.fromEntries(Object.entries(buckets).map(([key, value]) => [key, value.count])), out: OUT }, null, 2));
