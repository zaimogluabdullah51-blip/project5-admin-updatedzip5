"""Validate and stage both SQLite artifacts before publishing a release directory."""
import argparse
from contextlib import closing
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile

FILES = {'legal-index-production.sqlite.gz', 'legal-index-fulltext.sqlite.gz'}


def checksum(file):
    digest = hashlib.sha256()
    with file.open('rb') as reader:
        while chunk := reader.read(4 * 1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def validate_pair(folder):
    counts = []
    for filename in sorted(FILES):
        with closing(sqlite3.connect((folder / filename[:-3]).as_uri() + '?mode=ro', uri=True)) as db:
            if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError(f'Integrity check failed: {filename}')
            if 'fulltext' in filename:
                meta = dict(db.execute('SELECT key,value FROM legal_index_fulltext_meta'))
                if any(meta.get(k) != v for k, v in {'status':'ready', 'complete':'1', 'content_status':'ready', 'content_complete':'1'}.items()):
                    raise ValueError('Full-text artifact is incomplete')
                count = db.execute('SELECT count(*) FROM legal_index_fulltext_map').fetchone()[0]
                content = db.execute('SELECT sum(row_count) FROM legal_index_fulltext_content').fetchone()[0]
                if content != count or int(meta.get('rows_indexed', -1)) != count:
                    raise ValueError('Full-text row counts differ')
            else:
                meta = dict(db.execute('SELECT key,value FROM legal_index_meta'))
                if meta.get('status') != 'ready':
                    raise ValueError('Main artifact is incomplete')
                count = db.execute('SELECT count(*) FROM legal_index_decisions').fetchone()[0]
            counts.append(count)
    if not counts[0] or counts[0] != counts[1]:
        raise ValueError('Main/full-text population mismatch')
    return counts[0]


def install(package, destination):
    package, destination = package.resolve(), destination.resolve()
    if destination.exists():
        raise ValueError('Choose a new release directory; existing releases are never overwritten')
    manifest = json.loads((package / 'manifest.json').read_text())
    entries = manifest.get('artifacts', [])
    if manifest.get('format') != 'legal-index-release-v1' or len(entries) != 2 or {e['file'] for e in entries} != FILES:
        raise ValueError('Manifest must contain exactly the main and full-text artifacts')
    destination.parent.mkdir(parents=True, exist_ok=True)
    needed = sum(int(e['uncompressed_bytes']) for e in entries)
    if needed <= 0 or shutil.disk_usage(destination.parent).free < needed + 64 * 1024 * 1024:
        raise ValueError('Insufficient space to stage the release')
    with tempfile.TemporaryDirectory(prefix='.legal-release-', dir=destination.parent) as temp:
        stage = Path(temp)
        for entry in entries:
            archive = package / entry['file']
            if archive.stat().st_size != entry['compressed_bytes'] or checksum(archive) != entry['gzip_sha256']:
                raise ValueError(f'Archive checksum mismatch: {archive.name}')
            digest, size = hashlib.sha256(), 0
            print(f'Extracting and verifying {archive.name}', flush=True)
            with gzip.open(archive, 'rb') as reader, (stage / archive.name[:-3]).open('xb') as writer:
                while chunk := reader.read(4 * 1024 * 1024):
                    size += len(chunk)
                    if size > entry['uncompressed_bytes']:
                        raise ValueError('Archive exceeds declared size')
                    writer.write(chunk)
                    digest.update(chunk)
                writer.flush()
                os.fsync(writer.fileno())
            if size != entry['uncompressed_bytes'] or digest.hexdigest() != entry['sqlite_sha256']:
                raise ValueError(f'SQLite checksum mismatch: {archive.name}')
        rows = validate_pair(stage)
        (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (stage / 'paths.json').write_text(json.dumps({
            'LEGAL_INDEX_DB_PATH': str(destination / 'legal-index-production.sqlite'),
            'LEGAL_FULLTEXT_DB_PATH': str(destination / 'legal-index-fulltext.sqlite'),
        }, indent=2) + '\n')
        if destination.exists():
            raise ValueError('Destination appeared during installation')
        stage.rename(destination)
    return rows


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('package', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps({'installed_rows': install(args.package, args.destination), 'release': str(args.destination.resolve())}))
