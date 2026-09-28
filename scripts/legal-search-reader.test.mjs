import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { setTimeout as delay } from "node:timers/promises";
import { createLegalSearchReader } from "../legal-search-reader.mjs";

async function fixture(file) {
  const db = new sqlite3.Database(file);
  await new Promise((resolve, reject) => db.exec("CREATE TABLE sample(value); INSERT INTO sample VALUES (42)", (error) => error ? reject(error) : resolve()));
  await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
}

const slowSql = `WITH RECURSIVE numbers(x) AS (
  SELECT 1 UNION ALL SELECT x + 1 FROM numbers WHERE x < 1000000000
) SELECT sum(x) FROM numbers`;

async function withReader(options, check) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "legal-reader-"));
  const main = path.join(dir, "main.sqlite");
  const text = path.join(dir, "text.sqlite");
  const reader = createLegalSearchReader(main, text, options);
  try {
    await fixture(main);
    await fixture(text);
    await reader.all("SELECT 1");
    await check(reader);
  } finally {
    await reader.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("queue rejects overload, removes cancelled jobs and isolates active interruption", async () => {
  await withReader({ maxQueued: 1, timeoutMs: 2000 }, async (reader) => {
    const active = new AbortController();
    const waiting = new AbortController();
    const running = assert.rejects(reader.all(slowSql, [], { signal: active.signal }), { code: "SEARCH_ABORTED" });
    await delay(50);
    const queued = assert.rejects(reader.all("SELECT 2", [], { signal: waiting.signal }), { code: "SEARCH_ABORTED" });
    await assert.rejects(reader.all("SELECT 3"), { code: "SEARCH_BUSY" });
    waiting.abort();
    await queued;
    const next = reader.all("SELECT 42 AS value");
    active.abort();
    await running;
    assert.deepEqual(await next, [{ value: 42 }]);
    await assert.rejects(reader.all("SELECT 4", [], { signal: active.signal }), { code: "SEARCH_ABORTED" });
  });
});

test("deadline interrupts running work without poisoning subsequent reads", async () => {
  await withReader({ timeoutMs: 100 }, async (reader) => {
    await assert.rejects(reader.all(slowSql), { code: "SEARCH_TIMEOUT" });
    assert.deepEqual(await reader.all("SELECT 42 AS value"), [{ value: 42 }]);
  });
});

test("isolated reader joins databases, rejects writes and recovers after a query error", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "legal-reader-"));
  const main = path.join(dir, "main.sqlite");
  const text = path.join(dir, "text #1.sqlite");
  const reader = createLegalSearchReader(main, text);
  try {
    await fixture(main);
    await fixture(text);
    const results = await Promise.all(Array.from({ length: 4 }, () => reader.all("SELECT a.value + b.value AS total FROM sample a CROSS JOIN legal_fulltext.sample b")));
    assert.deepEqual(results, Array.from({ length: 4 }, () => [{ total: 84 }]));
    await assert.rejects(reader.all("DELETE FROM sample"), /readonly/i);
    await assert.rejects(reader.all("DELETE FROM legal_fulltext.sample"), /readonly/i);
    assert.deepEqual(await reader.all("SELECT value FROM sample"), [{ value: 42 }]);
  } finally {
    await reader.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("missing attachment is not created and initialization can retry", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "legal-reader-"));
  const main = path.join(dir, "main.sqlite");
  const text = path.join(dir, "text.sqlite");
  const reader = createLegalSearchReader(main, text);
  try {
    await fixture(main);
    await assert.rejects(reader.all("SELECT 1"), /unable to open/i);
    await assert.rejects(access(text));
    await fixture(text);
    assert.deepEqual(await reader.all("SELECT value FROM legal_fulltext.sample"), [{ value: 42 }]);
  } finally {
    await reader.close();
    await rm(dir, { recursive: true, force: true });
  }
});
