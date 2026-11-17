"""Build an ID-to-source-row artifact, without reading any decision text."""
import argparse
from contextlib import closing
import os
from pathlib import Path
import sqlite3
import tempfile

import pyarrow.parquet as pq


def uri(path):
    return path.resolve(strict=True).as_uri() + "?mode=ro"


def build(locator, cache, fulltext, output):
    with tempfile.TemporaryDirectory(dir=output.parent) as tmp:
        staging = Path(tmp) / "offsets.sqlite"
        with closing(sqlite3.connect(staging, uri=True)) as db, db:
            db.execute("CREATE TABLE offsets(hf_id TEXT PRIMARY KEY, row_offset INTEGER NOT NULL) WITHOUT ROWID")
            db.execute("ATTACH DATABASE ? AS locator", (uri(locator),))
            db.execute("ATTACH DATABASE ? AS yargitay", (uri(fulltext),))
            revision, = db.execute("SELECT revision FROM locator.metadata").fetchone()
            db.execute("CREATE TABLE starts(shard INTEGER, row_group INTEGER, row_offset INTEGER, PRIMARY KEY(shard,row_group))")
            totals = {}
            for shard, path in db.execute("SELECT id,path FROM locator.shards ORDER BY path").fetchall():
                relative = Path(path).relative_to("data")
                source = relative.parts[0]
                offset = totals.get(source, 0)
                metadata = pq.read_metadata(cache / revision / relative)
                for group in range(metadata.num_row_groups):
                    db.execute("INSERT INTO starts VALUES(?,?,?)", (shard, group, offset))
                    offset += metadata.row_group(group).num_rows
                totals[source] = offset
            db.execute("""INSERT INTO offsets
                SELECT hf_id, starts.row_offset + locations.row_offset
                FROM locator.locations JOIN starts USING(shard,row_group)""")
            if db.execute("SELECT count(*) FROM offsets").fetchone()[0] != 1224940:
                raise ValueError("Incomplete non-Yargitay locator")
            if db.execute("""SELECT count(*),min(rowid),max(rowid)
                FROM yargitay.legal_index_fulltext_map""").fetchone() != (9820145, 1, 9820145):
                raise ValueError("Incomplete Yargitay archive map")
            db.execute("INSERT INTO offsets SELECT hf_id,rowid-1 FROM yargitay.legal_index_fulltext_map")
            db.execute("DROP TABLE starts")
        os.link(staging, output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("locator", "cache", "fulltext", "output"):
        parser.add_argument("--" + option, required=True, type=Path)
    build(**vars(parser.parse_args()))
