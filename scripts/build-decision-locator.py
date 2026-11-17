"""Build a local decision-to-Parquet locator without reading decision texts."""

import argparse
import os
from pathlib import Path
import sqlite3
import tempfile

import pyarrow.parquet as pq


REVISION = "5db4e34c0c99fa48819371d0deb0e7a28fea3266"
SOURCES = {
    "aym_bb": (1, 17067),
    "aym_norm": (1, 5563),
    "danistay": (2, 386608),
    "emsal": (9, 815702),
    "yargitay": (17, 9820145),
}


def build(cache, output, sources):
    if output.exists():
        raise FileExistsError(output)
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        staging = Path(temp) / "locator.sqlite"
        with sqlite3.connect(staging) as db:
            db.executescript("""
                CREATE TABLE metadata (revision TEXT NOT NULL);
                CREATE TABLE shards (
                    id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE
                );
                CREATE TABLE locations (
                    hf_id TEXT PRIMARY KEY, shard INTEGER NOT NULL REFERENCES shards,
                    row_group INTEGER NOT NULL, row_offset INTEGER NOT NULL
                ) WITHOUT ROWID;
            """)
            db.execute("INSERT INTO metadata VALUES (?)", (REVISION,))
            for source in sources:
                shard_count, expected = SOURCES[source]
                total = 0
                for index in range(shard_count):
                    relative = Path(source) / f"train-{index:05d}-of-{shard_count:05d}.parquet"
                    parquet = pq.ParquetFile(cache / REVISION / relative)
                    shard = db.execute("INSERT INTO shards(path) VALUES (?)",
                                       (f"data/{relative.as_posix()}",)).lastrowid
                    for group in range(parquet.num_row_groups):
                        offset = 0
                        for batch in parquet.iter_batches(
                            batch_size=8192, row_groups=[group], columns=["id"]
                        ):
                            ids = batch.column(0).to_pylist()
                            if any(not key or not key.startswith(source + ":") for key in ids):
                                raise ValueError(f"Unexpected decision ID in {relative}:{group}")
                            db.executemany("INSERT INTO locations VALUES (?,?,?,?)", (
                                (key, shard, group, i) for i, key in enumerate(ids, offset)
                            ))
                            offset += len(ids)
                        if offset != parquet.metadata.row_group(group).num_rows:
                            raise ValueError(f"Incomplete row group in {relative}:{group}")
                        total += offset
                if total != expected:
                    raise ValueError(f"{source}: expected {expected}, got {total}")
                print(f"{source}: {total:,} verified locations")
        os.link(staging, output)


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--cache", type=Path, required=True)
    cli.add_argument("--output", type=Path, required=True)
    cli.add_argument("--source", choices=SOURCES, action="append")
    args = cli.parse_args()
    build(args.cache, args.output, list(dict.fromkeys(args.source or SOURCES)))
