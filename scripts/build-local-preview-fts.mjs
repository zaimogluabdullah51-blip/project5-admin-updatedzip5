import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const dbPath = process.env.LEGAL_INDEX_DB_PATH || path.join(root, "data", "legal-index-all.sqlite");
const rebuildFts = String(process.env.LEGAL_INDEX_FTS_REBUILD || "true").toLowerCase() !== "false";

if (!fs.existsSync(dbPath)) throw new Error(`Legal index not found: ${dbPath}`);

const db = new sqlite3.Database(dbPath);
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(error) {
    if (error) reject(error);
    else resolve(this);
  });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
});
const close = () => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

const startedAt = Date.now();
const beforeBytes = fs.statSync(dbPath).size;
const decisionCount = Number((await get("SELECT count(*) AS n FROM legal_index_decisions"))?.n || 0);

console.log(`Building preview FTS for ${decisionCount.toLocaleString("en-US")} decisions in ${dbPath}`);
await run("PRAGMA journal_mode = DELETE");
await run("PRAGMA synchronous = NORMAL");
await run("CREATE TABLE IF NOT EXISTS legal_index_meta (key TEXT PRIMARY KEY, value TEXT)");
if (rebuildFts) {
  await run("DROP TABLE IF EXISTS legal_index_decisions_fts");
  await run(`
    CREATE VIRTUAL TABLE legal_index_decisions_fts USING fts5(
      short_preview,
      content='legal_index_decisions',
      content_rowid='rowid',
      tokenize='unicode61 remove_diacritics 2'
    )
  `);
  await run("INSERT INTO legal_index_decisions_fts(legal_index_decisions_fts) VALUES('rebuild')");
  await run("INSERT INTO legal_index_decisions_fts(legal_index_decisions_fts) VALUES('optimize')");
}
await run("CREATE TABLE IF NOT EXISTS legal_index_court_counts (court TEXT PRIMARY KEY, decision_count INTEGER NOT NULL)");
await run("DELETE FROM legal_index_court_counts");
await run(`
  INSERT INTO legal_index_court_counts (court, decision_count)
  SELECT court, count(*)
  FROM legal_index_decisions
  WHERE court <> ''
  GROUP BY court
`);
const dates = await get(`
  SELECT min(karar_tarihi) AS min_date, max(karar_tarihi) AS max_date
  FROM legal_index_decisions
  WHERE karar_tarihi <> ''
`);
await run(
  `INSERT OR REPLACE INTO legal_index_meta (key, value)
   VALUES ('preview_fts_rows', ?), ('preview_fts_updated_at', ?), ('min_date', ?), ('max_date', ?)`,
  [String(decisionCount), new Date().toISOString(), dates?.min_date || "", dates?.max_date || ""]
);
await close();

const afterBytes = fs.statSync(dbPath).size;
console.log(JSON.stringify({
  decisions_indexed: decisionCount,
  elapsed_seconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
  added_bytes: afterBytes - beforeBytes,
  database_bytes: afterBytes
}, null, 2));
