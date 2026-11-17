import sqlite3 from "sqlite3";

export function openDecisionArchive(file) {
  const db = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (error) => {
    if (error) console.error("Decision offsets unavailable:", error.code);
  });
  return async (id, signal) => {
    const offset = await new Promise((resolve, reject) => {
      db.get("SELECT row_offset FROM offsets WHERE hf_id=?", [id], (error, row) => {
        if (error) reject(error);
        else resolve(row?.row_offset);
      });
    });
    if (offset === undefined) return null;
    const url = new URL("https://datasets-server.huggingface.co/rows");
    url.search = new URLSearchParams({
      dataset: "Alptekinege/turkish-court-decisions", config: id.split(":")[0],
      split: "train", offset, length: 1,
    });
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Decision archive unavailable");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 4 * 1024 * 1024) throw new Error("Decision archive response too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const row = payload.rows?.[0];
    if (row?.row_idx !== offset || row.row?.id !== id || !Array.isArray(row.truncated_cells)
        || row.truncated_cells.length || typeof row.row.text !== "string" || !row.row.text
        || Buffer.byteLength(row.row.text) > 2 * 1024 * 1024) {
      throw new Error("Decision archive identity or completeness mismatch");
    }
    return { hf_id: id, text: row.row.text };
  };
}
