import os
import sys
import time
import json
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path


PRIMARY_DATASET = os.environ.get("HF_DATASET_ID", "hamzabagirsakci/turkish-court-decisions")
FALLBACK_DATASETS = [
    item.strip()
    for item in os.environ.get("HF_DATASET_FALLBACK_IDS", "mrfg/turkish-court-decisions").split(",")
    if item.strip()
]
CONFIG = os.environ.get("HF_DATASET_CONFIG", "yargitay")
SHARD_COUNT = max(int(os.environ.get("HF_SHARD_COUNT", "17")), 1)
SHARD_START = max(int(os.environ.get("HF_SHARD_START", "0")), 0)
SHARD_LIMIT = max(int(os.environ.get("HF_SHARD_LIMIT", str(SHARD_COUNT - SHARD_START))), 1)
CACHE_DIR = Path(os.environ.get("HF_PARQUET_CACHE_DIR", "/private/tmp/hf-parquet-cache")) / CONFIG
DEFAULT_REVISION = "4df66ee63c4adbcae8434787718c7b42381a69dd"
REVISION = os.environ.get("HF_PARQUET_REVISION", DEFAULT_REVISION)
ALL_SHARD_STARTS = {
    "aym_bb": 0,
    "aym_norm": 1,
    "danistay": 2,
    "emsal": 4,
    "yargitay": 13,
}
TOKEN = (
    os.environ.get("HF_TOKEN")
    or os.environ.get("HUGGINGFACE_TOKEN")
    or os.environ.get("HF_HUB_TOKEN")
    or ""
)
MAX_RETRIES = max(int(os.environ.get("HF_DOWNLOAD_MAX_RETRIES", "6")), 0)
RETRY_BASE_SECONDS = max(int(os.environ.get("HF_DOWNLOAD_RETRY_BASE_SECONDS", "10")), 1)
CHUNK_SIZE = max(int(os.environ.get("HF_DOWNLOAD_CHUNK_SIZE", str(8 * 1024 * 1024))), 64 * 1024)


def revision_candidates():
    candidates = [REVISION]
    for value in (DEFAULT_REVISION, "refs%2Fconvert%2Fparquet", "main"):
        if value not in candidates:
            candidates.append(value)
    return candidates


def shard_paths(index):
    paths = [f"{CONFIG}/train/{index:04d}.parquet"]
    if CONFIG in ALL_SHARD_STARTS:
        paths.append(f"all/train/{ALL_SHARD_STARTS[CONFIG] + index:04d}.parquet")
    return paths


def shard_url(path, revision):
    return (
        "https://huggingface.co/datasets/hamzabagirsakci/turkish-court-decisions"
        f"/resolve/{revision}/{path}"
    )


def request_for(url):
    headers = {"User-Agent": "davatakibi-local-indexer/1.0"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"
    return urllib.request.Request(url, headers=headers)


def read_json_url(url):
    with urllib.request.urlopen(request_for(url), timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def urls_from_parquet_payload(payload):
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, str)]
    if isinstance(payload, dict):
        direct = payload.get(CONFIG, {}).get("train")
        if isinstance(direct, list):
            return [item for item in direct if isinstance(item, str)]
        files = payload.get("parquet_files")
        if isinstance(files, list):
            return [
                item.get("url")
                for item in files
                if item.get("config") == CONFIG and item.get("split") == "train" and item.get("url")
            ]
    return []


def dataset_candidates():
    candidates = [PRIMARY_DATASET]
    for dataset in FALLBACK_DATASETS:
        if dataset not in candidates:
            candidates.append(dataset)
    return candidates


def fetch_parquet_urls():
    for dataset in dataset_candidates():
        urls = fetch_parquet_urls_for_dataset(dataset)
        if urls:
            return urls
    return []


def fetch_parquet_urls_for_dataset(dataset):
    dataset_query = urllib.parse.quote(dataset, safe="")
    endpoints = [
        f"https://huggingface.co/api/datasets/{dataset}/parquet/{CONFIG}/train",
        f"https://huggingface.co/api/datasets/{dataset}/parquet",
        f"https://datasets-server.huggingface.co/parquet?dataset={dataset_query}",
    ]
    for endpoint in endpoints:
        try:
            urls = urls_from_parquet_payload(read_json_url(endpoint))
            if urls:
                print(f"parquet_url_source={endpoint}")
                print(f"parquet_url_count={len(urls)}")
                print(f"parquet_dataset={dataset}")
                return urls
        except urllib.error.HTTPError as exc:
            print(f"parquet_url_source_failed={endpoint} status={exc.code}", file=sys.stderr)
        except Exception as exc:
            print(f"parquet_url_source_failed={endpoint} error={exc}", file=sys.stderr)
    return []


def validate_token():
    if not TOKEN:
        return
    req = urllib.request.Request(
        "https://huggingface.co/api/whoami-v2",
        headers={
            "User-Agent": "davatakibi-local-indexer/1.0",
            "Authorization": f"Bearer {TOKEN}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            if response.status == 200:
                print("hf_token_check=ok")
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            raise RuntimeError("HF token is present but invalid. Generate a real read token and export HF_TOKEN again.") from exc
        raise


def download_one(index):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    target_dir = CACHE_DIR / "train"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{index:04d}.parquet"
    partial = target.with_suffix(target.suffix + ".partial")
    if target.exists() and target.stat().st_size > 0:
        print(f"skip shard={index:05d}, exists={target}, bytes={target.stat().st_size}")
        return

    for attempt in range(MAX_RETRIES + 1):
        last_404 = None
        try:
            api_urls = []
            if index < len(PARQUET_URLS):
                api_urls.append(PARQUET_URLS[index])
            for url in api_urls:
                try:
                    print(f"download shard={index:05d}, path=api, url={url}, target={target}")
                    with urllib.request.urlopen(request_for(url), timeout=120) as response:
                        with partial.open("wb") as out:
                            while True:
                                chunk = response.read(CHUNK_SIZE)
                                if not chunk:
                                    break
                                out.write(chunk)
                    break
                except urllib.error.HTTPError as exc:
                    if partial.exists():
                        partial.unlink()
                    if exc.code == 404:
                        last_404 = exc
                        continue
                    raise
            else:
                for path in shard_paths(index):
                    for revision in revision_candidates():
                        url = shard_url(path, revision)
                        try:
                            print(f"download shard={index:05d}, path={path}, revision={revision}, url={url}, target={target}")
                            with urllib.request.urlopen(request_for(url), timeout=120) as response:
                                with partial.open("wb") as out:
                                    while True:
                                        chunk = response.read(CHUNK_SIZE)
                                        if not chunk:
                                            break
                                        out.write(chunk)
                            break
                        except urllib.error.HTTPError as exc:
                            if partial.exists():
                                partial.unlink()
                            if exc.code == 404:
                                last_404 = exc
                                continue
                            raise
                    else:
                        continue
                    break
                else:
                    raise last_404 or RuntimeError(f"No downloadable shard URL found for shard {index:05d}")
            partial.replace(target)
            print(f"done shard={index:05d}, bytes={target.stat().st_size}")
            return
        except urllib.error.HTTPError as exc:
            if partial.exists():
                partial.unlink()
            if exc.code == 401:
                hint = " Set HF_TOKEN/HUGGINGFACE_TOKEN if the dataset requires authentication."
                raise RuntimeError(f"HF returned 401 for shard {index:05d}.{hint}") from exc
            if attempt >= MAX_RETRIES:
                raise
            wait = RETRY_BASE_SECONDS * min(attempt + 1, 6)
            print(f"retry shard={index:05d}, status={exc.code}, wait_s={wait}", file=sys.stderr)
            time.sleep(wait)
        except Exception as exc:
            if partial.exists():
                partial.unlink()
            if attempt >= MAX_RETRIES:
                raise
            wait = RETRY_BASE_SECONDS * min(attempt + 1, 6)
            print(f"retry shard={index:05d}, error={exc}, wait_s={wait}", file=sys.stderr)
            time.sleep(wait)


def main():
    end = min(SHARD_COUNT, SHARD_START + SHARD_LIMIT)
    print(f"cache_dir={CACHE_DIR}")
    print(f"dataset={PRIMARY_DATASET}, fallbacks={','.join(FALLBACK_DATASETS) or '-'}, config={CONFIG}, revision={REVISION}, shards={SHARD_START}-{end - 1}, token={'present' if TOKEN else 'missing'}")
    validate_token()
    global PARQUET_URLS
    PARQUET_URLS = fetch_parquet_urls()
    for index in range(SHARD_START, end):
        download_one(index)


PARQUET_URLS = []

if __name__ == "__main__":
    main()
