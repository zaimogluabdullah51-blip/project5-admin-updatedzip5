import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadLegalParser } from "./load-legal-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = process.env.HF_DATASET_CONFIG || "yargitay";
const START_OFFSET = Math.max(Number(process.env.HF_SAMPLE_OFFSET || 0), 0);
const TOTAL_LIMIT = Math.max(Number(process.env.HF_SAMPLE_LIMIT || 100000), 1);
const CHUNK_SIZE = Math.min(Math.max(Number(process.env.HF_ANALYZE_CHUNK_SIZE || 25000), 100), 100000);
const MAX_EXAMPLES = Math.max(Number(process.env.HF_PATTERN_MAX_EXAMPLES || 8), 1);

const parser = loadLegalParser();

function streamParquetRows(offset, limit) {
  const child = spawn("python3", [path.join(__dirname, "export-hf-parquet-sample.py")], {
    env: { ...process.env, HF_DATASET_CONFIG: CONFIG, HF_SAMPLE_OFFSET: String(offset), HF_SAMPLE_LIMIT: String(limit) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stderr.on("data", chunk => process.stderr.write(chunk));
  const exitPromise = new Promise(resolve => child.on("close", resolve));
  return {
    lines: readline.createInterface({ input: child.stdout, crlfDelay: Infinity }),
    async waitForExit() {
      const code = await exitPromise;
      if (code !== 0) throw new Error(`Parquet export failed with exit code ${code}`);
    }
  };
}

function fold(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

function excerpt(text, index, length) {
  const start = Math.max(0, index - Math.floor(length / 2));
  const end = Math.min(text.length, index + length);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function add(bucket, row, evidence, index = 0) {
  bucket.count += 1;
  if (bucket.examples.length >= MAX_EXAMPLES) return;
  bucket.examples.push({
    id: row.id,
    court: row.court || "",
    karar_tarihi: row.karar_tarihi || "",
    hf_tags: Array.isArray(row.mevzuat_atif) ? row.mevzuat_atif : [],
    evidence: evidence || excerpt(row.text || "", index, 520)
  });
}

const buckets = {
  new_code_candidates: { count: 0, examples: [] },
  unregistered_numbered_law_article: { count: 0, examples: [] },
  bare_known_law_then_article_without_madde: { count: 0, examples: [] },
  suffix_typo_yasinin: { count: 0, examples: [] },
  roman_or_written_paragraph_only: { count: 0, examples: [] },
  regulation_tariff_article: { count: 0, examples: [] },
  contract_spec_article: { count: 0, examples: [] },
  case_law_article_false_friend: { count: 0, examples: [] }
};

const rules = [
  {
    name: "new_code_candidates",
    regex: /\b(?:TBK|T\.?\s*B\.?\s*K\.?|6098\s*sayılı\s+(?:Türk\s+)?Borçlar\s+Kanunu|6102\s*sayılı\s+(?:Türk\s+)?Ticaret\s+Kanunu|6217\s*sayılı\s+Kanun|6502\s*sayılı\s+(?:Tüketicinin\s+Korunması|Kanun))[\s\S]{0,120}?\b(?:m\.|md\.|madde|maddesi|maddesinde|maddesinin|\d{1,4}\s*['’]?(?:nci|ncı|ncu|ncü|inci|ıncı|uncu|üncü))\b/iu
  },
  {
    name: "unregistered_numbered_law_article",
    regex: /\b(\d{3,4})\s*(?:S\.?|sayılı)\s+(?!KHK\b)(?!Kanun(?:la|le|un|unla)?\s+değiş)(?:[^.\n]{0,160}?)\b(?:Kanun|Yasa)(?:u|ı|i|un|ın|in|nun|nın|nin|na|ne|da|de)?(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün))?[\s\S]{0,180}?\b(?:m\.|md\.|madde|maddesi|maddesinde|maddesinin)\s*(\d{1,4}(?:\s*[/-]\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü.-]+)?)/iu
  },
  {
    name: "bare_known_law_then_article_without_madde",
    regex: /\b(?:Kanun|Yasa)(?:un|ın|in|nun|nın|nin|na|ne)?\s+(\d{1,4}(?:\s*\/\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü.-]+)?)\s*(?:uyarınca|gereğince|hükmünce|hükmüne|hükmü)/iu
  },
  {
    name: "suffix_typo_yasinin",
    regex: /\b\d{3,4}\s*(?:S\.?|sayılı)\s+Yas[ıi]n[ıi]n\s+\d{1,4}(?:\s*\/\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü.-]+)?\s*\.?\s*(?:maddesi|madde|m\.)/iu
  },
  {
    name: "roman_or_written_paragraph_only",
    regex: /\b(?:fıkra|fikra|bend|bent|alt\s+bent|cümle)(?:sinin|sinde|sine|si|de|den)?\s+(?:birinci|ikinci|üçüncü|dördüncü|beşinci|son|[IVXLCDM]+)\b/iu
  },
  {
    name: "regulation_tariff_article",
    regex: /\b(?:Yönetmelik|Tüzük|Tarife|Tebliğ(?!name)|Genelge)(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün|na|ne|da|de))?[\s\S]{0,90}?\b(?:\d{1,4}\s*\.?\s*(?:madde|maddesi)|(?:madde|maddesi)\s*\d{1,4})\b/iu
  },
  {
    name: "contract_spec_article",
    regex: /\b(?:sözleşme|şartname|protokol|ihale\s+dokümanı|teknik\s+şartname|idari\s+şartname)(?:['’]?(?:nın|nin|nun|nün|ın|in|un|ün|na|ne|da|de))?[\s\S]{0,90}?\b(?:\d{1,4}\s*\.?\s*(?:madde|maddesi)|(?:madde|maddesi)\s*\d{1,4})\b/iu
  },
  {
    name: "case_law_article_false_friend",
    regex: /\b(?:Yargıtay|Danıştay|Anayasa\s+Mahkemesi|İçtihadı\s+Birleştirme)[\s\S]{0,160}?\b(?:\d{1,4}\s*\.?\s*(?:madde|maddesi)|(?:madde|maddesi)\s*\d{1,4})\b/iu
  }
];

const topPhrases = new Map();
const summary = {
  config: CONFIG,
  start_offset: START_OFFSET,
  limit: TOTAL_LIMIT,
  scanned: 0,
  parser_zero: 0,
  generated_at: null
};

for (let offset = START_OFFSET; offset < START_OFFSET + TOTAL_LIMIT;) {
  const limit = Math.min(CHUNK_SIZE, START_OFFSET + TOTAL_LIMIT - offset);
  const { lines, waitForExit } = streamParquetRows(offset, limit);
  let chunkRows = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    const text = row.text || "";
    chunkRows += 1;
    summary.scanned += 1;
    const refs = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(text));
    if (refs.length) continue;
    summary.parser_zero += 1;

    const phraseRegex = /\b((?:\d{3,4}\s*(?:S\.?|sayılı)\s+)?[A-ZÇĞİÖŞÜa-zçğıöşü0-9 .()'’/-]{0,110}(?:Kanun|Yasa|KHK|Yönetmelik|Tüzük|Tarife|Şartname|Sözleşme)[A-ZÇĞİÖŞÜa-zçğıöşü0-9 .()'’/-]{0,110})/gu;
    for (const phrase of text.matchAll(phraseRegex)) {
      const key = fold(phrase[1]).replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 140);
      topPhrases.set(key, (topPhrases.get(key) || 0) + 1);
    }

    for (const rule of rules) {
      const match = rule.regex.exec(text);
      if (!match) continue;
      add(buckets[rule.name], row, excerpt(text, match.index, 520), match.index);
      rule.regex.lastIndex = 0;
    }
  }

  await waitForExit();
  if (chunkRows === 0) break;
  offset += chunkRows;
  console.error(`[${new Date().toISOString()}] scanned=${summary.scanned}, parser_zero=${summary.parser_zero}`);
}

summary.generated_at = new Date().toISOString();
console.log(JSON.stringify({
  summary,
  buckets,
  top_phrases: [...topPhrases.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([phrase, count]) => ({ phrase, count }))
}, null, 2));
