import json
import os
import sqlite3
import struct
import sys
import time
import zlib
from pathlib import Path

sys.path.insert(0, os.environ.get("DUCKDB_PYTHONPATH", "/tmp/duckdbpkg"))

import duckdb


ROOT = Path(__file__).resolve().parent.parent
CONFIG = os.environ.get("HF_DATASET_CONFIG", "yargitay")
SHARD_COUNT = max(int(os.environ.get("HF_SHARD_COUNT", "17")), 1)
CACHE_DIR = Path(os.environ.get("HF_PARQUET_CACHE_DIR", "/private/tmp/hf-parquet-cache"))
DB_PATH = Path(
    os.environ.get(
        "LEGAL_FULLTEXT_DB_PATH",
        os.environ.get(
            "LEGAL_INDEX_FULLTEXT_DB_PATH",
            str(ROOT / "data" / "legal-index-fulltext.sqlite"),
        ),
    )
)
START_OFFSET = max(int(os.environ.get("LEGAL_FULLTEXT_START_OFFSET", "0")), 0)
BATCH_SIZE = min(max(int(os.environ.get("LEGAL_FULLTEXT_BATCH_SIZE", "5000")), 100), 50000)
PROGRESS_EVERY = max(int(os.environ.get("LEGAL_FULLTEXT_PROGRESS_EVERY", "100000")), BATCH_SIZE)
REBUILD = os.environ.get("LEGAL_FULLTEXT_REBUILD", "false").lower() == "true"
OPTIMIZE = os.environ.get("LEGAL_FULLTEXT_OPTIMIZE", "true").lower() == "true"
DETAIL = os.environ.get("LEGAL_FULLTEXT_DETAIL", "full").strip().lower()
CONTENT_ENABLED = os.environ.get("LEGAL_FULLTEXT_CONTENT", "true").lower() != "false"
CONTENT_REBUILD = os.environ.get("LEGAL_FULLTEXT_CONTENT_REBUILD", "false").lower() == "true"
CONTENT_CHUNK_SIZE = min(
    max(int(os.environ.get("LEGAL_FULLTEXT_CONTENT_CHUNK_SIZE", "256")), 32), 2048
)
CONTENT_COMMIT_CHUNKS = min(
    max(int(os.environ.get("LEGAL_FULLTEXT_CONTENT_COMMIT_CHUNKS", "64")), 1), 512
)
if DETAIL not in ("full", "column", "none"):
    raise ValueError("LEGAL_FULLTEXT_DETAIL must be full, column, or none")


def requested_limit():
    value = os.environ.get("LEGAL_FULLTEXT_LIMIT", "all").strip().lower()
    if value in ("", "all"):
        return None
    return max(int(value), 1)


def resolve_shards():
    base = CACHE_DIR / CONFIG if (CACHE_DIR / CONFIG).is_dir() else CACHE_DIR
    train = base / "train"
    shards = [train / f"{index:04d}.parquet" for index in range(SHARD_COUNT)]
    missing = [path for path in shards if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Missing cached parquet shards: "
            + ", ".join(str(path) for path in missing[:3])
        )
    return [str(path) for path in shards]


def remove_database(path):
    for candidate in (path, Path(f"{path}-wal"), Path(f"{path}-shm")):
        if candidate.exists():
            candidate.unlink()


def set_meta(db, key, value):
    db.execute(
        "INSERT OR REPLACE INTO legal_index_fulltext_meta (key, value) VALUES (?, ?)",
        (key, str(value)),
    )


def get_meta(db, key, default=""):
    row = db.execute(
        "SELECT value FROM legal_index_fulltext_meta WHERE key = ?", (key,)
    ).fetchone()
    return row[0] if row else default


def initialize_database(db):
    db.execute("PRAGMA journal_mode = TRUNCATE")
    db.execute("PRAGMA synchronous = NORMAL")
    db.execute("PRAGMA temp_store = MEMORY")
    db.execute("PRAGMA cache_size = -262144")
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS legal_index_fulltext_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS legal_index_fulltext_map (
          rowid INTEGER PRIMARY KEY,
          hf_id TEXT NOT NULL
        )
        """
    )
    db.execute(
        f"""
        CREATE VIRTUAL TABLE IF NOT EXISTS legal_index_fulltext_fts USING fts5(
          body,
          content='',
          detail={DETAIL},
          tokenize='unicode61 remove_diacritics 2'
        )
        """
    )
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS legal_index_fulltext_content (
          chunk_id INTEGER PRIMARY KEY,
          first_rowid INTEGER NOT NULL,
          row_count INTEGER NOT NULL,
          payload BLOB NOT NULL
        )
        """
    )
    db.commit()


def pack_content_rows(rows):
    framed = bytearray()
    for row in rows:
        body = str(row[0] or "").encode("utf-8")
        framed.extend(struct.pack("<I", len(body)))
        framed.extend(body)
    return zlib.compress(framed, 6)


limit = requested_limit()
shards = resolve_shards()
source = duckdb.connect()
source_total = int(
    source.execute("SELECT count(*) FROM read_parquet(?)", [shards]).fetchone()[0]
)
end_offset = source_total if limit is None else min(source_total, START_OFFSET + limit)

DB_PATH.parent.mkdir(parents=True, exist_ok=True)
if REBUILD:
    remove_database(DB_PATH)

db = sqlite3.connect(DB_PATH)
initialize_database(db)

stored_start = int(get_meta(db, "start_offset", START_OFFSET))
if stored_start != START_OFFSET:
    raise RuntimeError(
        f"Index start offset mismatch: database={stored_start}, requested={START_OFFSET}"
    )

next_offset = max(START_OFFSET, int(get_meta(db, "next_offset", START_OFFSET)))
if next_offset > end_offset:
    raise RuntimeError(
        f"Checkpoint is beyond requested range: checkpoint={next_offset}, end={end_offset}"
    )

if next_offset < end_offset:
    set_meta(db, "status", "building")
set_meta(db, "config", CONFIG)
set_meta(db, "detail", DETAIL)
set_meta(db, "source_rows", source_total)
set_meta(db, "start_offset", START_OFFSET)
set_meta(db, "target_end_offset", end_offset)
set_meta(db, "next_offset", next_offset)
set_meta(db, "updated_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
db.commit()

remaining = end_offset - next_offset
started_at = time.time()
print(
    f"Full-text index: source_rows={source_total}, range={next_offset}:{end_offset}, "
    f"batch={BATCH_SIZE}, db={DB_PATH}",
    flush=True,
)

processed = next_offset
last_reported = next_offset

try:
    if remaining:
        cursor = source.execute(
            "SELECT id, text FROM read_parquet(?) LIMIT ? OFFSET ?",
            [shards, remaining, next_offset],
        )
        while processed < end_offset:
            rows = cursor.fetchmany(min(BATCH_SIZE, end_offset - processed))
            if not rows:
                break
            mapped = []
            indexed = []
            for index, row in enumerate(rows):
                rowid = processed + index + 1
                hf_id = str(row[0] or "")
                body = str(row[1] or "")
                mapped.append((rowid, hf_id))
                indexed.append((rowid, body))

            db.execute("BEGIN")
            db.executemany(
                "INSERT INTO legal_index_fulltext_map(rowid, hf_id) VALUES (?, ?)", mapped
            )
            db.executemany(
                "INSERT INTO legal_index_fulltext_fts(rowid, body) VALUES (?, ?)", indexed
            )
            processed += len(rows)
            set_meta(db, "next_offset", processed)
            set_meta(db, "rows_indexed", processed - START_OFFSET)
            set_meta(db, "updated_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
            db.commit()

            if processed == end_offset or processed - last_reported >= PROGRESS_EVERY:
                elapsed = max(time.time() - started_at, 0.001)
                rate = (processed - next_offset) / elapsed
                print(
                    f"offset={processed}/{end_offset} rows={processed - START_OFFSET} "
                    f"rate={rate:.0f}/s size_mb={DB_PATH.stat().st_size / 1024 / 1024:.1f}",
                    flush=True,
                )
                last_reported = processed

    if processed != end_offset:
        raise RuntimeError(f"Source ended early at offset {processed}, expected {end_offset}")

    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_index_fulltext_map_hf_id "
        "ON legal_index_fulltext_map(hf_id)"
    )
    if OPTIMIZE:
        db.execute(
            "INSERT INTO legal_index_fulltext_fts(legal_index_fulltext_fts) VALUES('optimize')"
        )
    complete = START_OFFSET == 0 and end_offset == source_total
    set_meta(db, "status", "ready")
    set_meta(db, "complete", "1" if complete else "0")
    set_meta(db, "rows_indexed", processed - START_OFFSET)
    set_meta(db, "next_offset", processed)
    set_meta(db, "completed_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    db.commit()

    content_processed = START_OFFSET
    content_chunks = 0
    if CONTENT_ENABLED:
        stored_chunk_size = int(get_meta(db, "content_chunk_size", CONTENT_CHUNK_SIZE))
        stored_content_rows = int(get_meta(db, "content_rows", 0))
        if stored_content_rows and stored_chunk_size != CONTENT_CHUNK_SIZE:
            if not CONTENT_REBUILD:
                raise RuntimeError(
                    "Content chunk size mismatch: "
                    f"database={stored_chunk_size}, requested={CONTENT_CHUNK_SIZE}. "
                    "Set LEGAL_FULLTEXT_CONTENT_REBUILD=true to rebuild snippets."
                )
            db.execute("DELETE FROM legal_index_fulltext_content")
            stored_content_rows = 0
            set_meta(db, "content_next_offset", START_OFFSET)
            db.commit()

        if CONTENT_REBUILD and stored_content_rows:
            db.execute("DELETE FROM legal_index_fulltext_content")
            stored_content_rows = 0
            set_meta(db, "content_next_offset", START_OFFSET)
            db.commit()

        content_next_offset = max(
            START_OFFSET,
            int(get_meta(db, "content_next_offset", START_OFFSET)),
        )
        if content_next_offset > end_offset:
            raise RuntimeError(
                "Content checkpoint is beyond requested range: "
                f"checkpoint={content_next_offset}, end={end_offset}"
            )

        relative_offset = content_next_offset - START_OFFSET
        if content_next_offset < end_offset and relative_offset % CONTENT_CHUNK_SIZE:
            content_next_offset -= relative_offset % CONTENT_CHUNK_SIZE
            restart_chunk = (content_next_offset - START_OFFSET) // CONTENT_CHUNK_SIZE
            db.execute(
                "DELETE FROM legal_index_fulltext_content WHERE chunk_id >= ?",
                (restart_chunk,),
            )
            set_meta(db, "content_next_offset", content_next_offset)
            set_meta(db, "content_rows", content_next_offset - START_OFFSET)
            db.commit()

        set_meta(db, "content_status", "building")
        set_meta(db, "content_complete", "0")
        set_meta(db, "content_compression", "zlib")
        set_meta(db, "content_encoding", "utf8_length_prefix_v1")
        set_meta(db, "content_chunk_size", CONTENT_CHUNK_SIZE)
        set_meta(db, "content_next_offset", content_next_offset)
        db.commit()

        content_processed = content_next_offset
        content_started_at = time.time()
        content_last_reported = content_next_offset
        pending_chunks = []
        content_cursor = source.execute(
            "SELECT text FROM read_parquet(?) LIMIT ? OFFSET ?",
            [shards, end_offset - content_next_offset, content_next_offset],
        )

        def commit_content_chunks():
            if not pending_chunks:
                return
            db.execute("BEGIN")
            db.executemany(
                """
                INSERT OR REPLACE INTO legal_index_fulltext_content
                  (chunk_id, first_rowid, row_count, payload)
                VALUES (?, ?, ?, ?)
                """,
                pending_chunks,
            )
            set_meta(db, "content_next_offset", content_processed)
            set_meta(db, "content_rows", content_processed - START_OFFSET)
            set_meta(db, "content_updated_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
            db.commit()
            pending_chunks.clear()

        while content_processed < end_offset:
            rows = content_cursor.fetchmany(
                min(CONTENT_CHUNK_SIZE, end_offset - content_processed)
            )
            if not rows:
                break
            chunk_id = (content_processed - START_OFFSET) // CONTENT_CHUNK_SIZE
            pending_chunks.append(
                (
                    chunk_id,
                    content_processed + 1,
                    len(rows),
                    pack_content_rows(rows),
                )
            )
            content_processed += len(rows)
            if len(pending_chunks) >= CONTENT_COMMIT_CHUNKS:
                commit_content_chunks()

            if (
                content_processed == end_offset
                or content_processed - content_last_reported >= PROGRESS_EVERY
            ):
                commit_content_chunks()
                elapsed = max(time.time() - content_started_at, 0.001)
                rate = (content_processed - content_next_offset) / elapsed
                print(
                    f"content_offset={content_processed}/{end_offset} "
                    f"rows={content_processed - START_OFFSET} rate={rate:.0f}/s "
                    f"size_mb={DB_PATH.stat().st_size / 1024 / 1024:.1f}",
                    flush=True,
                )
                content_last_reported = content_processed

        commit_content_chunks()
        if content_processed != end_offset:
            raise RuntimeError(
                f"Content source ended early at offset {content_processed}, expected {end_offset}"
            )
        content_chunks = int(
            db.execute("SELECT count(*) FROM legal_index_fulltext_content").fetchone()[0]
        )
        content_complete = START_OFFSET == 0 and end_offset == source_total
        set_meta(db, "content_status", "ready")
        set_meta(db, "content_complete", "1" if content_complete else "0")
        set_meta(db, "content_rows", content_processed - START_OFFSET)
        set_meta(db, "content_chunks", content_chunks)
        set_meta(db, "content_next_offset", content_processed)
        set_meta(db, "content_completed_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        db.commit()
finally:
    source.close()
    db.close()

elapsed = max(time.time() - started_at, 0.001)
print(
    json.dumps(
        {
            "database": str(DB_PATH),
            "database_bytes": DB_PATH.stat().st_size,
            "source_rows": source_total,
            "rows_indexed": processed - START_OFFSET,
            "complete": START_OFFSET == 0 and end_offset == source_total,
            "content_enabled": CONTENT_ENABLED,
            "content_rows": content_processed - START_OFFSET if CONTENT_ENABLED else 0,
            "content_chunks": content_chunks if CONTENT_ENABLED else 0,
            "elapsed_seconds": round(elapsed, 2),
            "rows_per_second": round((processed - next_offset) / elapsed, 2),
        },
        indent=2,
    )
)
