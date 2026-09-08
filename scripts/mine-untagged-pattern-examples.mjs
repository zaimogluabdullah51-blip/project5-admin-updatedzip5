import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { loadLegalParser } from "./load-legal-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = process.env.HF_DATASET_CONFIG || "yargitay";
const START_OFFSET = Math.max(Number(process.env.HF_SAMPLE_OFFSET || 0), 0);
const TOTAL_LIMIT = Math.max(Number(process.env.HF_SAMPLE_LIMIT || 1000000), 1);
const CHUNK_SIZE = Math.min(Math.max(Number(process.env.HF_ANALYZE_CHUNK_SIZE || 50000), 100), 100000);
const MAX_EXAMPLES = Math.max(Number(process.env.HF_PATTERN_MAX_EXAMPLES || 8), 1);

const parser = loadLegalParser();
const patterns = [
  {
    name: "humk_anilan_yasa",
    regex: /HUMK\.?da\s+yapılan\s+değişiklik[\s\S]{0,160}?anılan\s+yasanın\s+\d{1,4}\s*(?:nci|ncı|ncu|ncü|inci|ıncı|uncu|üncü)?\s+madd/iu
  },
  {
    name: "s_kanunu_article",
    regex: /\b[A-ZÇĞİÖŞÜ.]{1,12}\s+S\s+Kanunu['’]nun\s+\d{1,4}\b/u
  },
  {
    name: "law_article_without_madde_word",
    regex: /\b(?:Kanun|Yasa)['’]?(?:nın|nin|nun|nün)\s+\d{1,4}\s*(?:\/\s*[A-Za-z0-9ÇĞİÖŞÜçğıöşü]+)?\s*(?:uyarınca|gereğince|hükmü)/iu
  }
];

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

function excerpt(text, match) {
  const start = Math.max(0, match.index - 260);
  const end = Math.min(text.length, match.index + match[0].length + 260);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

const report = Object.fromEntries(patterns.map(p => [p.name, { count: 0, examples: [] }]));

for (let offset = START_OFFSET; offset < START_OFFSET + TOTAL_LIMIT;) {
  const limit = Math.min(CHUNK_SIZE, START_OFFSET + TOTAL_LIMIT - offset);
  const { lines, waitForExit } = streamParquetRows(offset, limit);
  let chunkRows = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    chunkRows += 1;
    const refs = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(row.text || ""));
    if (refs.length) continue;

    for (const pattern of patterns) {
      const match = pattern.regex.exec(row.text || "");
      if (!match) continue;
      const bucket = report[pattern.name];
      bucket.count += 1;
      if (bucket.examples.length < MAX_EXAMPLES) {
        bucket.examples.push({
          id: row.id,
          court: row.court || "",
          karar_tarihi: row.karar_tarihi || "",
          hf_tags: Array.isArray(row.mevzuat_atif) ? row.mevzuat_atif : [],
          evidence: excerpt(row.text || "", match)
        });
      }
      pattern.regex.lastIndex = 0;
    }
  }

  await waitForExit();
  if (chunkRows === 0) break;
  offset += chunkRows;
  console.error(`[${new Date().toISOString()}] scanned=${offset - START_OFFSET}`);
}

console.log(JSON.stringify(report, null, 2));
