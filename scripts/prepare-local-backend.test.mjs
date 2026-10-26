import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("Supabase startup never downloads or replaces a local index", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "legal-backend-"));
  try {
    const target = path.join(dir, "existing.sqlite");
    fs.writeFileSync(target, "preserve existing file");
    for (const force of ["true", "false"]) {
      const result = spawnSync(process.execPath, ["scripts/prepare-local-legal-index.mjs"], {
        encoding: "utf8", timeout: 5000,
        env: { ...process.env, LEGAL_SEARCH_BACKEND: "supabase-v2",
          LEGAL_INDEX_DB_PATH: target, LEGAL_INDEX_DB_URL: path.join(dir, "missing-source.sqlite"),
          LEGAL_INDEX_DB_PREPARE_FORCE: force, LEGAL_INDEX_REQUIRED: "true",
          LEGAL_INDEX_DB_SHA256: "invalid-on-purpose", LEGAL_INDEX_DB_DOWNLOAD_RETRIES: "0" },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /structured search uses Supabase v2/);
      assert.equal(fs.readFileSync(target, "utf8"), "preserve existing file");
      assert.deepEqual(fs.readdirSync(dir), ["existing.sqlite"]);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
