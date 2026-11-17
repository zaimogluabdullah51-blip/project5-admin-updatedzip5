import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

const production = process.env.RENDER === "true" && process.env.LEGAL_SEARCH_BACKEND === "supabase-v2";
const output = process.env.LEGAL_DECISION_OFFSETS || "data/decision-offsets.sqlite";
const source = process.env.LEGAL_DECISION_OFFSETS_URL || (production
  ? "https://github.com/zaimogluabdullah51-blip/project5-admin-updatedzip5/releases/download/decision-offsets-v1/decision-offsets.sqlite.gz"
  : "");
if (source) {
  const expected = process.env.LEGAL_DECISION_OFFSETS_SHA256 || (!process.env.LEGAL_DECISION_OFFSETS_URL
    ? "874fd353df7cee843932c5b81cdad3ce5e6e1307db94b941d82cc5f634db83da" : "");
  if (!output || !/^[a-f0-9]{64}$/.test(expected || "") || new URL(source).protocol !== "https:") {
    throw new Error("Decision offsets require an HTTPS URL, destination and SHA-256");
  }
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = output + ".partial";
  const hash = createHash("sha256");
  let bytes = 0;
  const verify = new Transform({
    transform(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > 400 * 1024 * 1024) return done(new Error("Decision offsets exceed size limit"));
      hash.update(chunk);
      done(null, chunk);
    },
  });
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`Decision offsets download failed (${response.status})`);
    await pipeline(Readable.fromWeb(response.body), createGunzip(), verify, createWriteStream(temporary));
    if (hash.digest("hex") !== expected) throw new Error("Decision offsets SHA-256 mismatch");
    await rename(temporary, output);
    console.log("Decision offsets ready");
  } finally {
    await rm(temporary, { force: true });
  }
}
