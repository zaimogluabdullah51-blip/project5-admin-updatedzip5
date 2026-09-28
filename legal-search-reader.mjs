import sqlite3 from "sqlite3";
import { pathToFileURL } from "node:url";

export function createLegalSearchReader(databasePath, fulltextPath, { maxQueued = 8, timeoutMs = 30000 } = {}) {
  if (!Number.isInteger(maxQueued) || maxQueued < 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Invalid search queue limits");
  }
  let connection;
  const queue = [];
  let active = false;
  let closing = false;
  let idle;
  function failure(code) {
    return Object.assign(new Error(code), { code });
  }
  function open() {
    if (!connection) {
      connection = new Promise((resolve, reject) => {
        const db = new sqlite3.Database(databasePath, sqlite3.OPEN_READONLY | sqlite3.OPEN_URI, (error) => {
          if (error) return reject(error);
          const uri = pathToFileURL(fulltextPath);
          uri.searchParams.set("mode", "ro");
          db.run("ATTACH DATABASE ? AS legal_fulltext", [uri.href], (attachError) => {
            if (attachError) return db.close(() => reject(attachError));
            db.run("PRAGMA query_only = ON", (pragmaError) => {
              if (pragmaError) return db.close(() => reject(pragmaError));
              resolve(db);
            });
          });
        });
      }).catch((error) => { connection = null; throw error; });
    }
    return connection;
  }
  async function drain() {
    if (active) return;
    const job = queue.shift();
    if (!job) { idle?.(); return; }
    active = true;
    try {
      const db = await open();
      if (job.cancelled) throw job.cancelled;
      const rows = await new Promise((resolve, reject) => {
        job.runningDb = db;
        db.all(job.sql, job.params, (error, rows) => {
          job.runningDb = null;
          error ? reject(error) : resolve(rows || []);
        });
      });
      job.cancelled ? job.reject(job.cancelled) : job.resolve(rows);
    } catch (error) {
      job.reject(job.cancelled || error);
    } finally {
      job.cleanup();
      active = false;
      // Wait for SQLite's callback before starting the next query after interrupt.
      void drain();
    }
  }
  return {
    all(sql, params = [], { signal } = {}) {
      if (signal?.aborted) return Promise.reject(failure("SEARCH_ABORTED"));
      if (closing) return Promise.reject(failure("SEARCH_CLOSED"));
      if (active && queue.length >= maxQueued) return Promise.reject(failure("SEARCH_BUSY"));
      return new Promise((resolve, reject) => {
        const job = { sql, params, resolve, reject };
        function cancel(code) {
          if (job.cancelled) return;
          job.cancelled = failure(code);
          const position = queue.indexOf(job);
          if (position >= 0) {
            queue.splice(position, 1);
            job.cleanup();
            reject(job.cancelled);
          } else if (job.runningDb) {
            job.runningDb.interrupt();
          }
        }
        const abort = () => cancel("SEARCH_ABORTED");
        const timer = setTimeout(() => cancel("SEARCH_TIMEOUT"), timeoutMs);
        job.cleanup = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
        };
        signal?.addEventListener("abort", abort, { once: true });
        queue.push(job);
        void drain();
      });
    },
    async close() {
      closing = true;
      if (active) await new Promise((resolve) => { idle = resolve; });
      if (!connection) return;
      const db = await connection;
      await new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
      connection = null;
    }
  };
}
