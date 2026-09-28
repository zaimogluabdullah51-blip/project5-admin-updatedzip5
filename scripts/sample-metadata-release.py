"""Uniform reproducible sample from the complete local index, read-only."""
import json
import random
import sqlite3
import struct
import zlib
from pathlib import Path
import sys

main_path, text_path, output = sys.argv[1:]
main = sqlite3.connect(Path(main_path).resolve().as_uri() + "?mode=ro", uri=True)
text = sqlite3.connect(Path(text_path).resolve().as_uri() + "?mode=ro", uri=True)
count, low, high = text.execute("SELECT count(*), min(rowid), max(rowid) FROM legal_index_fulltext_map").fetchone()
if low != 1 or count != high:
    raise SystemExit("Sampling requires a contiguous complete rowid map")
ids = sorted(random.Random(260926).sample(range(1, high + 1), min(5000, count)))
chunk = None
with open(output, "x", encoding="utf-8") as handle:
    for rowid in ids:
        if chunk is None or not chunk[0] <= rowid < chunk[0] + len(chunk[1]):
            first, size, payload = text.execute("SELECT first_rowid, row_count, payload FROM legal_index_fulltext_content WHERE chunk_id = (SELECT max(chunk_id) FROM legal_index_fulltext_content WHERE first_rowid <= ?)", (rowid,)).fetchone()
            raw = zlib.decompress(payload)
            offset, docs = 0, []
            for _ in range(size):
                length = struct.unpack_from('<I', raw, offset)[0]
                offset += 4
                docs.append(raw[offset:offset + length].decode('utf-8'))
                offset += length
            if offset != len(raw):
                raise ValueError('Invalid content chunk')
            chunk = first, docs
        hf_id = text.execute("SELECT hf_id FROM legal_index_fulltext_map WHERE rowid=?", (rowid,)).fetchone()[0]
        metadata = main.execute("SELECT court, karar_tarihi FROM legal_index_decisions WHERE hf_id=?", (hf_id,)).fetchone()
        if metadata is None:
            raise ValueError(f'Metadata missing for {hf_id}')
        handle.write(json.dumps(dict(id=hf_id, court=metadata[0], karar_tarihi=metadata[1], text=chunk[1][rowid-chunk[0]]), ensure_ascii=False) + '\n')
print(json.dumps(dict(rows=len(ids), population=count, seed=260926, output=output)))
