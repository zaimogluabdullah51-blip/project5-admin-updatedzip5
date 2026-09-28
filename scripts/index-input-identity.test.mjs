import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { sourceIdentity, rowHash, validateCheckpoint } from './index-input-identity.mjs';

test('source fingerprints detect content changes and canonical row hashes ignore key ordering', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'input-identity-'));
  try {
    const input = path.join(dir, 'input.jsonl');
    fs.writeFileSync(input, 'first');
    const before = await sourceIdentity(input, 'yargitay');
    fs.writeFileSync(input, 'other');
    assert.notDeepEqual(await sourceIdentity(input, 'yargitay'), before);
    assert.equal(rowHash({ a: 1, b: { c: 2, d: 3 } }), rowHash({ b: { d: 3, c: 2 }, a: 1 }));
    assert.notEqual(rowHash({ text: 'same', court: 'a' }), rowHash({ text: 'same', court: 'b' }));
    await assert.rejects(sourceIdentity('', 'yargitay', { HF_PARQUET_REVISION: 'main' }), /immutable/);
    fs.mkdirSync(path.join(dir, 'train'));
    const shard = path.join(dir, 'train', '0000.parquet');
    fs.writeFileSync(shard, 'one');
    const env = { HF_PARQUET_CACHE_DIR: dir, HF_SHARD_COUNT: '1' };
    const cached = await sourceIdentity('', 'yargitay', env);
    fs.writeFileSync(shard, 'two');
    assert.notDeepEqual(await sourceIdentity('', 'yargitay', env), cached);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('checkpoint binds generation, options, target file and valid offset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-identity-'));
  try {
    const db = path.join(dir, 'target.sqlite');
    fs.writeFileSync(db, 'fixture');
    const stat = fs.statSync(db);
    const identity = { source: 'hash', processingHash: 'parser', start: 0, limit: 10 };
    const checkpoint = { format: 'legal-index-checkpoint-v2', identity,
      db_path: fs.realpathSync(db), db_file: `${stat.dev}:${stat.ino}`, next_offset: 5 };
    validateCheckpoint(checkpoint, identity, db, 0, 10);
    for (const identityChange of [{ source: 'changed' }, { processingHash: 'changed' }, { limit: 20 }]) {
      assert.throws(() => validateCheckpoint(checkpoint, { ...identity, ...identityChange }, db, 0, 10), /mismatch/);
    }
    assert.throws(() => validateCheckpoint({ ...checkpoint, format: undefined }, identity, db, 0, 10), /mismatch/);
    assert.throws(() => validateCheckpoint({ ...checkpoint, next_offset: 11 }, identity, db, 0, 10), /offset/);
    fs.renameSync(db, `${db}.old`);
    fs.writeFileSync(db, 'new database');
    assert.throws(() => validateCheckpoint(checkpoint, identity, db, 0, 10), /target database/);
    fs.unlinkSync(db);
    assert.throws(() => validateCheckpoint(checkpoint, identity, db, 0, 10), /target database/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
