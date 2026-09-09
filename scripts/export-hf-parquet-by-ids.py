import json
import os
import sys

sys.path.insert(0, os.environ.get("DUCKDB_PYTHONPATH", "/tmp/duckdbpkg"))

import duckdb

config = os.environ.get("HF_DATASET_CONFIG", "yargitay")
id_file = os.environ.get("HF_ID_FILE", "")
id_list = os.environ.get("HF_ID_LIST", "")
shard_count = max(int(os.environ.get("HF_SHARD_COUNT", "17")), 1)

if id_file:
    with open(id_file, "r", encoding="utf-8") as handle:
        ids = json.load(handle)
elif id_list:
    ids = [item.strip() for item in id_list.split(",")]
else:
    ids = []

ids = [str(item).strip() for item in ids if str(item).strip()]
if not ids:
    sys.exit(0)

shards = [
    f"https://huggingface.co/datasets/hamzabagirsakci/turkish-court-decisions/resolve/main/data/{config}/train-{idx:05d}-of-{shard_count:05d}.parquet"
    for idx in range(shard_count)
]

con = duckdb.connect()
try:
    con.execute("INSTALL httpfs; LOAD httpfs;")
except Exception as exc:
    print(f"httpfs warning: {exc}", file=sys.stderr)

con.execute("create temp table target_ids(id varchar primary key)")
con.executemany("insert or ignore into target_ids values (?)", [(item,) for item in ids])

sql = """
    select rows.id, rows.source, rows.document_id, rows.court, rows.esas_no, rows.karar_no,
           rows.karar_tarihi, rows.year, rows.month, rows.text_len, rows.masked_count,
           rows.raw_sha256, rows.mevzuat_atif, rows.text
    from read_parquet(?) rows
    join target_ids target on rows.id = target.id
"""

rows = con.execute(sql, [shards]).fetchall()
cols = [desc[0] for desc in con.description]

for row in rows:
    item = dict(zip(cols, row))
    if item.get("mevzuat_atif") is None:
        item["mevzuat_atif"] = []
    print(json.dumps(item, ensure_ascii=False, default=str))
