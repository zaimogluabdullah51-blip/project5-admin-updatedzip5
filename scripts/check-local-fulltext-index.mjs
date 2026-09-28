import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const mainPath = process.env.LEGAL_INDEX_DB_PATH || path.join(root, "data", "legal-index-all.sqlite");
const fulltextPath = process.env.LEGAL_FULLTEXT_DB_PATH
  || process.env.LEGAL_INDEX_FULLTEXT_DB_PATH
  || path.join(root, "data", "legal-index-fulltext.sqlite");
const searchTerms = String(process.env.LEGAL_FULLTEXT_CHECK_QUERIES || "tarım sigortalılığı,boşanma,kamulaştırma bedeli,sanık")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!fs.existsSync(mainPath)) throw new Error(`Main legal index not found: ${mainPath}`);
if (!fs.existsSync(fulltextPath)) throw new Error(`Full-text legal index not found: ${fulltextPath}`);

const fulltextDb = new sqlite3.Database(fulltextPath, sqlite3.OPEN_READWRITE);
const fulltextGet = (sql, params = []) => new Promise((resolve, reject) => {
  fulltextDb.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
});
const fulltextClose = () => new Promise((resolve, reject) => fulltextDb.close((error) => error ? reject(error) : resolve()));
const quickCheck = await fulltextGet("PRAGMA quick_check");
await fulltextClose();

const db = new sqlite3.Database(mainPath, sqlite3.OPEN_READONLY);
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(error) {
    if (error) reject(error);
    else resolve(this);
  });
});
const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (error, row) => error ? reject(error) : resolve(row || null));
});
const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows || []));
});
const close = () => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));

function ftsQuery(value) {
  const tokens = String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .match(/[\p{L}\p{N}]+/gu)
    ?.filter((token) => token.length >= 2)
    .slice(0, 10) || [];
  return tokens.map((token) => `"${token.replace(/"/g, '""')}"*`).join(" AND ");
}

await run("ATTACH DATABASE ? AS legal_fulltext", [fulltextPath]);
const metaRows = await all("SELECT key, value FROM legal_fulltext.legal_index_fulltext_meta ORDER BY key");
const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));
const [mainCount, mapCount, ftsCount, contentCount] = await Promise.all([
  get("SELECT count(*) AS n FROM legal_index_decisions"),
  get("SELECT count(*) AS n FROM legal_fulltext.legal_index_fulltext_map"),
  get("SELECT count(*) AS n FROM legal_fulltext.legal_index_fulltext_fts"),
  get("SELECT count(*) AS n, coalesce(sum(row_count), 0) AS rows FROM legal_fulltext.legal_index_fulltext_content")
]);

const benchmarks = [];
for (const query of searchTerms) {
  const started = performance.now();
  const results = await all(
    `SELECT d.hf_id, d.court, d.karar_tarihi, fulltext_fts.rank AS rank
     FROM legal_fulltext.legal_index_fulltext_fts fulltext_fts
     JOIN legal_fulltext.legal_index_fulltext_map fulltext_map ON fulltext_map.rowid = fulltext_fts.rowid
     JOIN legal_index_decisions d ON d.hf_id = fulltext_map.hf_id
     WHERE legal_index_fulltext_fts MATCH ?
     ORDER BY rank
     LIMIT 5`,
    [ftsQuery(query)]
  );
  benchmarks.push({
    query,
    elapsed_ms: Number((performance.now() - started).toFixed(2)),
    result_count: results.length,
    first_result: results[0] || null
  });
}

await close();

const counts = {
  main: Number(mainCount?.n || 0),
  map: Number(mapCount?.n || 0),
  fts: Number(ftsCount?.n || 0),
  content_chunks: Number(contentCount?.n || 0),
  content_rows: Number(contentCount?.rows || 0)
};
const quickCheckValue = quickCheck?.quick_check || Object.values(quickCheck || {})[0] || "";
const valid = meta.status === "ready"
  && meta.complete === "1"
  && counts.main === counts.map
  && counts.map === counts.fts
  && counts.fts === Number(meta.rows_indexed || 0)
  && (meta.content_status !== "ready" || (
    meta.content_complete === "1"
    && counts.content_rows === counts.fts
    && counts.content_chunks === Number(meta.content_chunks || 0)
  ))
  && quickCheckValue === "ok";

console.log(JSON.stringify({ valid, mainPath, fulltextPath, counts, quick_check: quickCheckValue, meta, benchmarks }, null, 2));
if (!valid) process.exitCode = 1;
