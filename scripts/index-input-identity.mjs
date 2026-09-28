import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function rowHash(value) {
  function canonical(item) {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])]));
    return item;
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export async function sourceIdentity(input, config, env = process.env) {
  if (input) return { kind: 'jsonl', sha256: await fileHash(input) };
  const count = Number(env.HF_SHARD_COUNT || 17);
  if (!Number.isInteger(count) || count < 1) throw new Error('Invalid shard count');
  const cache = env.HF_PARQUET_CACHE_DIR || env.HF_PARQUET_LOCAL_DIR;
  if (cache) {
    let base = path.resolve(cache);
    if (fs.existsSync(path.join(base, config))) base = path.join(base, config);
    let files = Array.from({ length: count }, (_, i) => path.join(base, 'train', `${String(i).padStart(4, '0')}.parquet`));
    if (!files.every(file => fs.existsSync(file))) {
      files = Array.from({ length: count }, (_, i) => path.join(base, `train-${String(i).padStart(5, '0')}-of-${String(count).padStart(5, '0')}.parquet`));
    }
    const hashes = [];
    for (const file of files) hashes.push(await fileHash(file));
    return { kind: 'parquet-cache', hashes };
  }
  const revision = env.HF_PARQUET_REVISION || '4df66ee63c4adbcae8434787718c7b42381a69dd';
  if (!/^[a-f0-9]{40}$/i.test(revision)) throw new Error('Remote input requires an immutable HF commit revision');
  return { kind: 'parquet-remote', revision, count };
}

export function validateCheckpoint(checkpoint, identity, dbPath, start, end) {
  if (!checkpoint) return;
  if (checkpoint.format !== 'legal-index-checkpoint-v2' || rowHash(checkpoint.identity) !== rowHash(identity)) {
    throw new Error('Checkpoint source/parser/options mismatch; use a new checkpoint for a new input generation');
  }
  const stat = fs.existsSync(dbPath) ? fs.statSync(dbPath) : null;
  if (!stat || checkpoint.db_path !== fs.realpathSync(dbPath) || checkpoint.db_file !== `${stat.dev}:${stat.ino}`) {
    throw new Error('Checkpoint target database mismatch');
  }
  if (!Number.isInteger(checkpoint.next_offset) || checkpoint.next_offset < start || checkpoint.next_offset > end) {
    throw new Error('Checkpoint offset outside requested range');
  }
}
