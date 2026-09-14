import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import sqlite3 from "sqlite3";
import { fileURLToPath } from "node:url";
import { loadLegalParser } from "./load-legal-parser.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const CONFIG = process.env.HF_DATASET_CONFIG || "yargitay";
const START_OFFSET = Math.max(Number(process.env.HF_INDEX_START_OFFSET || process.env.HF_SAMPLE_OFFSET || 0), 0);
const TOTAL_LIMIT = Math.max(Number(process.env.HF_INDEX_LIMIT || process.env.HF_SAMPLE_LIMIT || 1000000), 1);
const FETCH_CHUNK_SIZE = Math.min(Math.max(Number(process.env.HF_INDEX_FETCH_CHUNK_SIZE || 25000), 100), 100000);
const TX_BATCH_SIZE = Math.min(Math.max(Number(process.env.HF_INDEX_TX_BATCH_SIZE || 1000), 50), 10000);
const DB_PATH = process.env.LEGAL_INDEX_DB_PATH || path.join(rootDir, "data", "legal-index.sqlite");
const CHECKPOINT = process.env.HF_INDEX_CHECKPOINT || `/tmp/local-legal-index-${CONFIG}-${START_OFFSET}-${TOTAL_LIMIT}.json`;
const COMPACT = String(process.env.HF_INDEX_COMPACT || "true").toLowerCase() !== "false";
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const INPUT_JSONL = process.env.HF_INDEX_INPUT_JSONL || "";
const MAX_CHUNK_RETRIES = Math.max(Number(process.env.HF_INDEX_MAX_CHUNK_RETRIES || 8), 0);
const RETRY_BASE_MS = Math.max(Number(process.env.HF_INDEX_RETRY_BASE_MS || 15000), 1000);

const parser = loadLegalParser();

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return null;
  return JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
}

function saveCheckpoint(value) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(value, null, 2) + "\n");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function makeExcerpt(text, rawReference = "", maxLength = 360) {
  const clean = normalizeWhitespace(text);
  if (!clean) return "";
  const needle = normalizeWhitespace(rawReference);
  const idx = needle ? clean.toLocaleLowerCase("tr-TR").indexOf(needle.toLocaleLowerCase("tr-TR")) : -1;
  const start = Math.max(0, (idx >= 0 ? idx : 0) - 100);
  const excerpt = clean.slice(start, start + maxLength);
  return `${start > 0 ? "..." : ""}${excerpt}${start + maxLength < clean.length ? "..." : ""}`;
}

function streamParquetRows(offset, limit) {
  const child = spawn(PYTHON_BIN, [path.join(__dirname, "export-hf-parquet-sample.py")], {
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

function streamJsonlRows(inputPath, offset, limit) {
  const input = fs.createReadStream(inputPath);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  async function* lines() {
    let index = 0;
    let yielded = 0;
    for await (const line of rl) {
      if (index < offset) {
        index += 1;
        continue;
      }
      if (yielded >= limit) break;
      index += 1;
      yielded += 1;
      yield line;
    }
  }
  return {
    lines: lines(),
    async waitForExit() {}
  };
}

function streamRows(offset, limit) {
  if (INPUT_JSONL) return streamJsonlRows(INPUT_JSONL, offset, limit);
  return streamParquetRows(offset, limit);
}

async function initLocalIndex(db) {
  await run(db, "PRAGMA journal_mode = WAL");
  await run(db, "PRAGMA synchronous = NORMAL");
  await run(db, "PRAGMA temp_store = MEMORY");

  await run(db, `
    CREATE TABLE IF NOT EXISTS legal_index_decisions (
      hf_id TEXT PRIMARY KEY,
      source TEXT,
      document_id TEXT,
      court TEXT,
      esas_no TEXT,
      karar_no TEXT,
      karar_tarihi TEXT,
      year INTEGER,
      month INTEGER,
      text_len INTEGER,
      masked_count INTEGER,
      raw_sha256 TEXT,
      short_preview TEXT,
      citation_count INTEGER DEFAULT 0,
      indexed_at TEXT
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS legal_index_citations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hf_id TEXT NOT NULL,
      law_no TEXT,
      law_code TEXT,
      law_name TEXT,
      article TEXT,
      paragraph TEXT,
      subparagraph TEXT,
      canonical_ref TEXT NOT NULL,
      raw_reference TEXT,
      context TEXT,
      source_method TEXT,
      confidence TEXT,
      quality_status TEXT,
      position INTEGER DEFAULT 0,
      indexed_at TEXT,
      UNIQUE (hf_id, canonical_ref, raw_reference)
    )
  `);

  await run(db, `
    CREATE TABLE IF NOT EXISTS legal_index_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  await run(db, "CREATE INDEX IF NOT EXISTS idx_legal_index_citations_canonical ON legal_index_citations (canonical_ref)");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_legal_index_citations_law_article ON legal_index_citations (law_no, law_code, article)");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_legal_index_citations_hf_id ON legal_index_citations (hf_id)");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_legal_index_decisions_date ON legal_index_decisions (karar_tarihi DESC, year DESC)");
  await run(db, "CREATE INDEX IF NOT EXISTS idx_legal_index_decisions_court ON legal_index_decisions (court)");
}

async function setMeta(db, key, value) {
  await run(db, "INSERT OR REPLACE INTO legal_index_meta (key, value) VALUES (?, ?)", [key, String(value ?? "")]);
}

async function indexRow(db, row, absoluteIndex) {
  const text = row.text || "";
  const hfId = row.id || `${row.source || CONFIG}:${row.document_id || absoluteIndex}`;
  const refs = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(text || ""));
  const now = new Date().toISOString();

  await run(
    db,
    `INSERT INTO legal_index_decisions
      (hf_id, source, document_id, court, esas_no, karar_no, karar_tarihi, year, month, text_len, masked_count, raw_sha256, short_preview, citation_count, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(hf_id) DO UPDATE SET
      source = excluded.source,
      document_id = excluded.document_id,
      court = excluded.court,
      esas_no = excluded.esas_no,
      karar_no = excluded.karar_no,
      karar_tarihi = excluded.karar_tarihi,
      year = excluded.year,
      month = excluded.month,
      text_len = excluded.text_len,
      masked_count = excluded.masked_count,
      raw_sha256 = excluded.raw_sha256,
      short_preview = excluded.short_preview,
      citation_count = excluded.citation_count,
      indexed_at = excluded.indexed_at`,
    [
      hfId,
      row.source || CONFIG,
      row.document_id || "",
      row.court || "",
      row.esas_no || "",
      row.karar_no || "",
      row.karar_tarihi || "",
      Number(row.year || 0) || null,
      Number(row.month || 0) || null,
      Number(row.text_len || String(text).length || 0) || null,
      Number(row.masked_count || 0) || 0,
      row.raw_sha256 || "",
      makeExcerpt(text, "", 520),
      refs.length,
      now
    ]
  );

  let inserted = 0;
  let canonicalCount = 0;
  for (const [idx, ref] of refs.entries()) {
    const normalized = parser.normalizeLegalRef ? parser.normalizeLegalRef(ref) : ref;
    const canonical = parser.canonicalLegalRef(normalized);
    if (!canonical) continue;
    canonicalCount += 1;
    const rawReference = String(ref.raw_reference || parser.labelLegalRef?.(normalized) || canonical);
    const result = await run(
      db,
      `INSERT OR IGNORE INTO legal_index_citations
        (hf_id, law_no, law_code, law_name, article, paragraph, subparagraph, canonical_ref, raw_reference, context, source_method, confidence, quality_status, position, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hfId,
        normalized.law_no || "",
        normalized.law_code || "",
        normalized.law_name || "",
        normalized.article || "",
        normalized.paragraph || "",
        normalized.subparagraph || "",
        canonical,
        rawReference,
        COMPACT ? "" : makeExcerpt(text, rawReference, 360),
        "rule_based",
        "medium",
        "parser_detected",
        idx,
        now
      ]
    );
    if (result.changes) inserted += 1;
  }
  await run(
    db,
    "UPDATE legal_index_decisions SET citation_count = (SELECT count(*) FROM legal_index_citations WHERE hf_id = ?) WHERE hf_id = ?",
    [hfId, hfId]
  );
  return { refs: canonicalCount, inserted };
}

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new sqlite3.Database(DB_PATH);
await initLocalIndex(db);

function checkpointPayload(nextOffset) {
  return {
    db_path: DB_PATH,
    config: CONFIG,
    start_offset: START_OFFSET,
    next_offset: nextOffset,
    end_offset: endOffset,
    total_rows: totalRows,
    total_tagged_rows: totalTaggedRows,
    total_citations: totalCitations,
    updated_at: new Date().toISOString()
  };
}

function applyCheckpointState(checkpoint) {
  if (!checkpoint) return;
  totalRows = Number(checkpoint.total_rows || 0);
  totalTaggedRows = Number(checkpoint.total_tagged_rows || 0);
  totalCitations = Number(checkpoint.total_citations || 0);
}

async function processChunk(chunkOffset, chunkLimit) {
  const { lines, waitForExit } = streamRows(chunkOffset, chunkLimit);
  let chunkRows = 0;
  let pendingInTx = 0;
  let txOpen = false;

  try {
    await run(db, "BEGIN");
    txOpen = true;
    for await (const line of lines) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      const absoluteIndex = chunkOffset + chunkRows;
      const result = await indexRow(db, row, absoluteIndex);
      chunkRows += 1;
      totalRows += 1;
      totalCitations += result.inserted;
      if (result.refs) totalTaggedRows += 1;
      pendingInTx += 1;

      if (pendingInTx >= TX_BATCH_SIZE) {
        await run(db, "COMMIT");
        txOpen = false;
        pendingInTx = 0;
        const nextOffset = chunkOffset + chunkRows;
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        console.log(`[${new Date().toISOString()}] offset=${nextOffset}/${endOffset}, rows=${totalRows}, tagged_rows=${totalTaggedRows}, citations=${totalCitations}, elapsed_s=${elapsedSeconds}`);
        saveCheckpoint(checkpointPayload(nextOffset));
        await run(db, "BEGIN");
        txOpen = true;
      }
    }
    await run(db, "COMMIT");
    txOpen = false;
    await waitForExit();
    return chunkRows;
  } catch (error) {
    if (txOpen) {
      await run(db, "ROLLBACK").catch(() => {});
    }
    throw error;
  }
}

const endOffset = START_OFFSET + TOTAL_LIMIT;
const checkpoint = loadCheckpoint();
let totalRows = Number(checkpoint?.total_rows || 0);
let totalTaggedRows = Number(checkpoint?.total_tagged_rows || 0);
let totalCitations = Number(checkpoint?.total_citations || 0);
let offset = Math.max(START_OFFSET, Number(checkpoint?.next_offset || 0));
const startedAt = Date.now();

console.log(`Local legal index DB: ${DB_PATH}`);
console.log(`Config=${CONFIG}, range=${offset}-${endOffset}, fetch_chunk=${FETCH_CHUNK_SIZE}, tx_batch=${TX_BATCH_SIZE}, compact=${COMPACT}`);
if (INPUT_JSONL) console.log(`Input JSONL: ${INPUT_JSONL}`);
console.log(`Checkpoint: ${CHECKPOINT}`);
console.log(`Chunk retries: ${MAX_CHUNK_RETRIES}, retry_base_ms=${RETRY_BASE_MS}`);

await setMeta(db, "status", "building");
await setMeta(db, "config", CONFIG);
await setMeta(db, "start_offset", START_OFFSET);
await setMeta(db, "target_limit", TOTAL_LIMIT);

chunks:
while (offset < endOffset) {
  const chunkLimit = Math.min(FETCH_CHUNK_SIZE, endOffset - offset);
  let chunkRows = 0;
  for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
    try {
      chunkRows = await processChunk(offset, chunkLimit);
      break;
    } catch (error) {
      const latestCheckpoint = loadCheckpoint();
      applyCheckpointState(latestCheckpoint);
      const checkpointOffset = Math.max(START_OFFSET, Number(latestCheckpoint?.next_offset || 0));
      if (checkpointOffset > offset) {
        offset = checkpointOffset;
        continue chunks;
      }
      if (attempt >= MAX_CHUNK_RETRIES) {
        await setMeta(db, "status", "failed");
        await setMeta(db, "error", error.message || String(error));
        throw error;
      }
      const waitMs = RETRY_BASE_MS * Math.min(attempt + 1, 6);
      console.log(`[${new Date().toISOString()}] chunk retry ${attempt + 1}/${MAX_CHUNK_RETRIES} at offset=${offset}: ${error.message}. waiting ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }

  if (chunkRows === 0) break;
  offset += chunkRows;
  saveCheckpoint(checkpointPayload(offset));
}

const decisionCount = await get(db, "SELECT count(*) as n FROM legal_index_decisions");
const citationCount = await get(db, "SELECT count(*) as n FROM legal_index_citations");
const taggedDecisionCount = await get(db, "SELECT count(*) as n FROM legal_index_decisions WHERE citation_count > 0");
await setMeta(db, "status", "ready");
await setMeta(db, "updated_at", new Date().toISOString());
await setMeta(db, "rows", decisionCount?.n || 0);
await setMeta(db, "tagged_rows", taggedDecisionCount?.n || 0);
await setMeta(db, "citations", citationCount?.n || 0);
console.log(`Done. decisions=${decisionCount?.n || 0}, citations=${citationCount?.n || 0}, tagged_rows=${taggedDecisionCount?.n || 0}`);
db.close();
