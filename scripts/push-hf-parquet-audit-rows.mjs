import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = (process.env.INDEXER_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://davatakibi.onrender.com").replace(/\/+$/, "");
const USERNAME = process.env.INDEXER_ADMIN_USER || process.env.ADMIN_USER || "admin";
const PASSWORD = process.env.INDEXER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "admin135";
const CONFIG = process.env.HF_DATASET_CONFIG || "yargitay";
const TOTAL_LIMIT = Math.max(Number(process.env.HF_AUDIT_ROWS_LIMIT || 1000000), 1);
const START_OFFSET = Math.max(Number(process.env.HF_AUDIT_ROWS_START_OFFSET || 0), 0);
const FETCH_CHUNK_SIZE = Math.min(Math.max(Number(process.env.HF_AUDIT_ROWS_FETCH_CHUNK_SIZE || 10000), 100), 50000);
const POST_BATCH_SIZE = Math.min(Math.max(Number(process.env.HF_AUDIT_ROWS_BATCH_SIZE || 250), 1), 500);
const CHECKPOINT = process.env.HF_AUDIT_ROWS_CHECKPOINT || `/tmp/hf-parquet-audit-${CONFIG}-${START_OFFSET}-${TOTAL_LIMIT}-checkpoint.json`;
const DELAY_MS = Math.max(Number(process.env.HF_AUDIT_ROWS_DELAY_MS || 150), 0);
const CHUNK_DELAY_MS = Math.max(Number(process.env.HF_AUDIT_ROWS_CHUNK_DELAY_MS || 1000), 0);
const MAX_RETRIES = Math.max(Number(process.env.HF_AUDIT_ROWS_MAX_RETRIES || 8), 0);
const RETRY_BASE_MS = Math.max(Number(process.env.HF_AUDIT_ROWS_RETRY_BASE_MS || 20000), 1000);
const COMPACT = process.env.HF_AUDIT_ROWS_COMPACT
  ? String(process.env.HF_AUDIT_ROWS_COMPACT).toLowerCase() !== "false"
  : true;
const INSERT_RULE_ONLY = String(process.env.HF_AUDIT_ROWS_INSERT_RULE_ONLY || "true").toLowerCase() !== "false";
const DRY_RUN = String(process.env.HF_AUDIT_ROWS_DRY_RUN || "").toLowerCase() === "true";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function retryable(error) {
  return /429|500|502|503|504|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|timeout|loading/i.test(String(error?.message || ""));
}

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT)) return null;
  return JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
}

function saveCheckpoint(value) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(value, null, 2) + "\n");
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

async function postBatch(cookie, rows) {
  if (DRY_RUN) {
    return { ok: true, rows_received: rows.length, rows_indexed: rows.length, decisions_indexed: 0, citations_indexed: 0, audit_stats: {} };
  }
  const response = await fetch(`${BASE_URL}/api/legal-index/audit-rows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie
    },
    body: JSON.stringify({
      compact: COMPACT,
      insertRuleOnly: INSERT_RULE_ONLY,
      rows
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Audit rows failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  return payload;
}

async function postBatchWithRetry(cookie, rows, offset) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await postBatch(cookie, rows);
    } catch (error) {
      if (attempt >= MAX_RETRIES || !retryable(error)) throw error;
      const waitMs = RETRY_BASE_MS * Math.min(attempt + 1, 6);
      console.log(`[${new Date().toISOString()}] retry ${attempt + 1}/${MAX_RETRIES} at offset ${offset}: ${error.message}. waiting ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
  throw new Error(`Retry loop exhausted at offset ${offset}`);
}

function streamParquetRows({ offset, limit }) {
  const helper = path.join(__dirname, "export-hf-parquet-sample.py");
  const child = spawn("python3", [helper], {
    env: {
      ...process.env,
      HF_DATASET_CONFIG: CONFIG,
      HF_SAMPLE_OFFSET: String(offset),
      HF_SAMPLE_LIMIT: String(limit)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stderr.on("data", chunk => process.stderr.write(chunk));

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  async function waitForExit() {
    const code = await new Promise(resolve => child.on("close", resolve));
    if (code !== 0) throw new Error(`Parquet export failed with exit code ${code}`);
  }
  return { lines: rl, waitForExit };
}

const checkpoint = loadCheckpoint();
let globalOffset = Math.max(START_OFFSET, Number(checkpoint?.next_offset || 0));
const endOffset = START_OFFSET + TOTAL_LIMIT;

console.log(`Target: ${BASE_URL}`);
console.log(`Config: ${CONFIG}`);
console.log(`Range: ${globalOffset}-${endOffset} (${TOTAL_LIMIT} rows requested from start offset ${START_OFFSET})`);
console.log(`Fetch chunk: ${FETCH_CHUNK_SIZE}, post batch: ${POST_BATCH_SIZE}`);
console.log(`Compact: ${COMPACT}, insert_rule_only: ${INSERT_RULE_ONLY}, dry_run: ${DRY_RUN}`);
console.log(`Checkpoint: ${CHECKPOINT}`);

const cookie = DRY_RUN ? "" : await login();
let totalRows = Number(checkpoint?.total_rows || 0);
let totalIndexedRows = Number(checkpoint?.total_indexed_rows || 0);
let totalDecisions = Number(checkpoint?.total_decisions || 0);
let totalCitations = Number(checkpoint?.total_citations || 0);
const startedAt = Date.now();

while (globalOffset < endOffset) {
  const chunkLimit = Math.min(FETCH_CHUNK_SIZE, endOffset - globalOffset);
  const { lines, waitForExit } = streamParquetRows({ offset: globalOffset, limit: chunkLimit });
  const batch = [];
  let chunkRows = 0;

  for await (const line of lines) {
    if (!line.trim()) continue;
    batch.push(JSON.parse(line));
    chunkRows += 1;
    if (batch.length >= POST_BATCH_SIZE) {
      const result = await postBatchWithRetry(cookie, batch.splice(0), globalOffset + chunkRows - batch.length);
      totalRows += Number(result.rows_received || 0);
      totalIndexedRows += Number(result.rows_indexed || 0);
      totalDecisions += Number(result.decisions_indexed || 0);
      totalCitations += Number(result.citations_indexed || 0);
      const nextOffset = globalOffset + chunkRows;
      const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      console.log(`[${new Date().toISOString()}] offset=${nextOffset}/${endOffset}, rows=${totalRows}, indexed_rows=${totalIndexedRows}, decisions=${totalDecisions}, citations=${totalCitations}, elapsed_s=${elapsedSeconds}`);
      saveCheckpoint({ target: BASE_URL, config: CONFIG, start_offset: START_OFFSET, next_offset: nextOffset, end_offset: endOffset, total_rows: totalRows, total_indexed_rows: totalIndexedRows, total_decisions: totalDecisions, total_citations: totalCitations, updated_at: new Date().toISOString() });
      if (DELAY_MS) await sleep(DELAY_MS);
    }
  }

  if (batch.length) {
    const result = await postBatchWithRetry(cookie, batch.splice(0), globalOffset + chunkRows);
    totalRows += Number(result.rows_received || 0);
    totalIndexedRows += Number(result.rows_indexed || 0);
    totalDecisions += Number(result.decisions_indexed || 0);
    totalCitations += Number(result.citations_indexed || 0);
  }

  await waitForExit();
  if (chunkRows === 0) break;
  globalOffset += chunkRows;
  saveCheckpoint({ target: BASE_URL, config: CONFIG, start_offset: START_OFFSET, next_offset: globalOffset, end_offset: endOffset, total_rows: totalRows, total_indexed_rows: totalIndexedRows, total_decisions: totalDecisions, total_citations: totalCitations, updated_at: new Date().toISOString() });
  if (CHUNK_DELAY_MS) await sleep(CHUNK_DELAY_MS);
}

console.log(`Done. rows=${totalRows}, indexed_rows=${totalIndexedRows}, decisions=${totalDecisions}, citations=${totalCitations}`);
