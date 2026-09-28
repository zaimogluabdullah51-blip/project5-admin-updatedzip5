import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sqlite3 from 'sqlite3';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const all = (db, sql) => new Promise((resolve, reject) => db.all(sql, (e, rows) => e ? reject(e) : resolve(rows)));
const run = (db, sql) => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
const close = db => new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve()));

test('builder replaces citations, supports zero transitions and rolls back failed replacements', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'index-reprocess-'));
  const dbPath = path.join(dir, 'build.sqlite');
  let sequence = 0;
  let db;
  let lastEnv;
  let lastInput;
  const row = (id, text) => ({ id, text, source: 'yargitay', court: '4. Ceza Dairesi', karar_tarihi: '2025-01-02' });
  async function build(rows) {
    const input = path.join(dir, `input-${++sequence}.jsonl`);
    await writeFile(input, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    lastInput = input;
    lastEnv = { ...process.env, LEGAL_INDEX_DB_PATH: dbPath, HF_INDEX_INPUT_JSONL: input,
      HF_INDEX_CHECKPOINT: path.join(dir, `checkpoint-${sequence}.json`),
      HF_INDEX_TRACK_SEARCH_UPDATES: 'true',
      HF_INDEX_START_OFFSET: '0', HF_INDEX_LIMIT: String(rows.length), HF_INDEX_MAX_CHUNK_RETRIES: '0' };
    return exec(process.execPath, ['scripts/build-local-legal-index.mjs'], {
      cwd: root, timeout: 15000,
      env: lastEnv
    });
  }
  async function snapshot() {
    return {
      decisions: await all(db, 'SELECT * FROM legal_index_decisions ORDER BY hf_id'),
      citations: await all(db, 'SELECT * FROM legal_index_citations ORDER BY id'),
      audit: await all(db, 'SELECT * FROM legal_index_metadata_audit ORDER BY hf_id'),
      updates: await all(db, 'SELECT * FROM legal_index_search_updates ORDER BY hf_id')
    };
  }
  try {
    await build([row('a', '5237 sayılı TCK\'nın 125. maddesi uygulanmıştır.'), row('b', '5237 sayılı TCK\'nın 86. maddesi uygulanmıştır.')]);
    db = new sqlite3.Database(dbPath);
    const original = await snapshot();
    await run(db, `CREATE VIRTUAL TABLE legal_index_decisions_fts USING fts5(short_preview,
      content='legal_index_decisions',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2');
      INSERT INTO legal_index_decisions_fts(legal_index_decisions_fts) VALUES('rebuild')`);
    assert.ok(original.citations.some(r => r.hf_id === 'a' && r.article === '125'));
    await build([row('a', '5237 sayılı TCK\'nın 106. maddesi uygulanmıştır.')]);
    const changed = await snapshot();
    assert.ok(changed.citations.some(r => r.hf_id === 'a' && r.article === '106'));
    assert.ok(!changed.citations.some(r => r.hf_id === 'a' && r.article === '125'));
    assert.deepEqual(changed.citations.filter(r => r.hf_id === 'b'), original.citations.filter(r => r.hf_id === 'b'));
    await build([row('a', '5237 sayılı TCK\'nın 106. maddesi uygulanmıştır.')]);
    const replay = await snapshot();
    assert.deepEqual(replay, changed, 'unchanged replay must not rewrite timestamps or citation ids');
    await exec(process.execPath, ['scripts/build-local-legal-index.mjs'], { cwd: root, env: lastEnv, timeout: 15000 });
    assert.deepEqual(await snapshot(), replay, 'completed matching checkpoint resumes safely');
    await writeFile(lastInput, JSON.stringify(row('a', 'changed input')) + '\n');
    await assert.rejects(exec(process.execPath, ['scripts/build-local-legal-index.mjs'], { cwd: root, env: lastEnv, timeout: 15000 }), /Checkpoint source\/parser\/options mismatch/);
    assert.deepEqual(await snapshot(), replay, 'checkpoint mismatch must not alter decisions');
    const semantic = rows => rows.map(({ id, indexed_at, ...r }) => r).sort((a,b) => a.hf_id.localeCompare(b.hf_id));
    assert.deepEqual(semantic(replay.citations), semantic(changed.citations));
    await build([row('a', 'Dosyanın incelenmesine karar verildi.')]);
    const zero = await snapshot();
    assert.deepEqual(await all(db, "SELECT rowid FROM legal_index_decisions_fts WHERE legal_index_decisions_fts MATCH '106'"), []);
    assert.equal((await all(db, "SELECT value FROM legal_index_meta WHERE key='status'"))[0].value, 'pending_search_sync');
    assert.equal(zero.updates.find(r => r.hf_id === 'a').body, 'Dosyanın incelenmesine karar verildi.');
    assert.equal(zero.citations.filter(r => r.hf_id === 'a').length, 0);
    assert.equal(zero.decisions.find(r => r.hf_id === 'a').citation_count, 0);
    await build([row('a', '5237 sayılı TCK\'nın 125. maddesi uygulanmıştır.')]);
    const beforeFailure = await snapshot();
    await run(db, `CREATE TRIGGER fail_citation BEFORE INSERT ON legal_index_citations
      WHEN NEW.hf_id = 'a' BEGIN SELECT RAISE(ABORT, 'forced failure'); END`);
    await assert.rejects(build([row('b', 'Dosya incelendi.'), row('a', '5237 sayılı TCK\'nın 106. maddesi uygulanmıştır.')]), /forced failure/);
    assert.deepEqual(await snapshot(), beforeFailure);
    await run(db, 'DROP TRIGGER fail_citation');
    await build([row('a', '5237 sayılı TCK\'nın 106. maddesi uygulanmıştır.')]);
    const beforeInvalid = await snapshot();
    await assert.rejects(build([{ id: 'a' }]), /Decision text must be present/);
    assert.deepEqual(await snapshot(), beforeInvalid);
    await build([{ ...row('a', '5237 sayılı TCK\'nın 106. maddesi uygulanmıştır.'), karar_tarihi: '2025-02-03' }]);
    assert.equal((await all(db, "SELECT karar_tarihi FROM legal_index_decisions WHERE hf_id='a'"))[0].karar_tarihi, '2025-02-03');
    assert.deepEqual(await all(db, `SELECT d.hf_id FROM legal_index_decisions d WHERE citation_count !=
      (SELECT count(*) FROM legal_index_citations c WHERE c.hf_id=d.hf_id)`), []);
  } finally {
    if (db) await close(db);
    await rm(dir, { recursive: true, force: true });
  }
});
