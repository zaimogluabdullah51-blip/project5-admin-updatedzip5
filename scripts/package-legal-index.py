"""Create verified gzip artifacts with separate archive and SQLite hashes."""
import gzip
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

parser = argparse.ArgumentParser()
parser.add_argument('output', type=Path)
parser.add_argument('sources', nargs='+', type=Path)
parser.add_argument('--reuse-manifest', type=Path)
parser.add_argument('--reuse-file', action='append', default=[])
args = parser.parse_args()
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
manifest = {'format': 'legal-index-release-v1', 'artifacts': []}
for filename in args.sources:
    source = Path(filename).resolve()
    before = source.stat()
    destination = output / (source.name + '.gz')
    partial = Path(str(destination) + '.partial')
    digest = hashlib.sha256()
    processed = 0
    last_log = time.monotonic()
    with source.open('rb') as reader, partial.open('xb') as raw:
        with gzip.GzipFile(filename='', fileobj=raw, mode='wb', compresslevel=1, mtime=0) as writer:
            while chunk := reader.read(4 * 1024 * 1024):
                digest.update(chunk)
                writer.write(chunk)
                processed += len(chunk)
                if time.monotonic() - last_log > 25:
                    print(f'{source.name}: {processed}/{before.st_size} bytes', flush=True)
                    last_log = time.monotonic()
    after = source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError(f'Source changed while packaging: {source}')
    print(f'Verifying decompressed checksum: {source.name}', flush=True)
    verified = hashlib.sha256()
    with gzip.open(partial, 'rb') as reader:
        while chunk := reader.read(4 * 1024 * 1024):
            verified.update(chunk)
    if verified.digest() != digest.digest():
        raise RuntimeError('Decompressed checksum mismatch')
    archive = hashlib.sha256()
    with partial.open('rb') as reader:
        while chunk := reader.read(4 * 1024 * 1024):
            archive.update(chunk)
    os.rename(partial, destination)
    manifest['artifacts'].append(dict(file=destination.name, source=str(source),
        uncompressed_bytes=before.st_size, compressed_bytes=destination.stat().st_size,
        sqlite_sha256=digest.hexdigest(), gzip_sha256=archive.hexdigest(), verified=True))
    print(json.dumps(manifest['artifacts'][-1]), flush=True)
if args.reuse_file:
    if not args.reuse_manifest:
        raise ValueError('--reuse-file requires --reuse-manifest')
    previous = json.loads(args.reuse_manifest.read_text())
    for name in args.reuse_file:
        if Path(name).name != name:
            raise ValueError('Reused artifact must be a filename')
        entry = next(item for item in previous['artifacts'] if item['file'] == name)
        archive_path = args.reuse_manifest.resolve().parent / name
        for file_path, key in [(Path(entry['source']), 'sqlite_sha256'), (archive_path, 'gzip_sha256')]:
            digest = hashlib.sha256()
            with file_path.open('rb') as reader:
                while chunk := reader.read(4 * 1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() != entry[key]:
                raise ValueError(f'Reused artifact changed: {file_path}')
        if not entry.get('verified'):
            raise ValueError('Reused artifact has not been verified')
        os.link(archive_path, output / name)
        manifest['artifacts'].append(entry)
        print(f'Reused verified artifact: {name}', flush=True)
with (output / 'manifest.json').open('x') as handle:
    json.dump(manifest, handle, indent=2)
