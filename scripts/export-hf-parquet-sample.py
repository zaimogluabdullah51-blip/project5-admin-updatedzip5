import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("DUCKDB_PYTHONPATH", "/tmp/duckdbpkg"))

import duckdb

config = os.environ.get("HF_DATASET_CONFIG", "yargitay")
limit = max(int(os.environ.get("HF_SAMPLE_LIMIT", "10000")), 1)
offset = max(int(os.environ.get("HF_SAMPLE_OFFSET", "0")), 0)
shard_count = max(int(os.environ.get("HF_SHARD_COUNT", "17")), 1)
cache_dir = os.environ.get("HF_PARQUET_CACHE_DIR") or os.environ.get("HF_PARQUET_LOCAL_DIR") or ""
revision = os.environ.get("HF_PARQUET_REVISION", "4df66ee63c4adbcae8434787718c7b42381a69dd")
all_shard_starts = {
    "aym_bb": 0,
    "aym_norm": 1,
    "danistay": 2,
    "emsal": 4,
    "yargitay": 13,
}

if cache_dir:
    base_dir = Path(cache_dir)
    if (base_dir / config).is_dir():
        base_dir = base_dir / config
    train_dir = base_dir / "train"
    shards = [
        str(train_dir / f"{idx:04d}.parquet")
        for idx in range(shard_count)
    ]
    missing = [shard for shard in shards if not Path(shard).exists()]
    if missing:
        legacy_shards = [
            str(base_dir / f"train-{idx:05d}-of-{shard_count:05d}.parquet")
            for idx in range(shard_count)
        ]
        if all(Path(shard).exists() for shard in legacy_shards):
            shards = legacy_shards
            missing = []
    if missing:
        print(
            "missing cached parquet shards; run scripts/download-hf-parquet-shards.py first: "
            + ", ".join(missing[:3])
            + (" ..." if len(missing) > 3 else ""),
            file=sys.stderr,
        )
        sys.exit(2)
else:
    if config in all_shard_starts:
        remote_paths = [f"all/train/{all_shard_starts[config] + idx:04d}.parquet" for idx in range(shard_count)]
    else:
        remote_paths = [f"{config}/train/{idx:04d}.parquet" for idx in range(shard_count)]
    shards = [
        f"https://huggingface.co/datasets/hamzabagirsakci/turkish-court-decisions/resolve/{revision}/{remote_path}"
        for remote_path in remote_paths
    ]

con = duckdb.connect()
try:
    con.execute("INSTALL httpfs; LOAD httpfs;")
except Exception as exc:
    print(f"httpfs warning: {exc}", file=sys.stderr)

schema = con.execute("describe select * from read_parquet(?) limit 0", [shards]).fetchall()
columns = {row[0] for row in schema}

select_items = []
for column in [
    "id",
    "source",
    "document_id",
    "court",
    "esas_no",
    "karar_no",
    "karar_tarihi",
    "year",
    "month",
    "text_len",
    "masked_count",
    "raw_sha256",
    "mevzuat_atif",
    "text",
]:
    if column in columns:
        select_items.append(column)
    elif column == "mevzuat_atif":
        select_items.append("[] as mevzuat_atif")
    elif column in ("year", "month", "text_len", "masked_count"):
        select_items.append(f"NULL as {column}")
    else:
        select_items.append(f"'' as {column}")

sql = f"""
    select {", ".join(select_items)}
    from read_parquet(?)
    limit ? offset ?
"""

rows = con.execute(sql, [shards, limit, offset]).fetchall()
cols = [desc[0] for desc in con.description]

for row in rows:
    item = dict(zip(cols, row))
    if item.get("mevzuat_atif") is None:
        item["mevzuat_atif"] = []
    print(json.dumps(item, ensure_ascii=False, default=str))
