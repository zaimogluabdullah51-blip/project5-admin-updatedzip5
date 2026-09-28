"""Create a private, verified SQLite snapshot without copying a live WAL file."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile


def backup(source, destination):
    source, destination = source.resolve(), destination.resolve()
    if not source.is_file():
        raise ValueError('Source database does not exist')
    if destination.exists():
        raise ValueError('Backup destination already exists; choose a new directory')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.sqlite-backup-', dir=destination.parent) as temp:
        stage = Path(temp)
        snapshot = stage / 'snapshot.sqlite'
        with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as reader:
            with closing(sqlite3.connect(snapshot)) as writer:
                reader.backup(writer, pages=256, sleep=0.05)
                writer.execute('PRAGMA journal_mode=DELETE')
                checks = writer.execute('PRAGMA integrity_check').fetchall()
                if checks != [('ok',)]:
                    raise ValueError('Snapshot integrity check failed')
        os.chmod(snapshot, 0o600)
        digest = hashlib.sha256()
        with snapshot.open('rb') as handle:
            while chunk := handle.read(4 * 1024 * 1024):
                digest.update(chunk)
            os.fsync(handle.fileno())
        manifest = {
            'format': 'sqlite-backup-v1',
            'created_at': datetime.now(timezone.utc).isoformat(),
            'source': str(source),
            'file': snapshot.name,
            'bytes': snapshot.stat().st_size,
            'sha256': digest.hexdigest(),
            'integrity_check': 'ok',
        }
        with (stage / 'manifest.json').open('x') as handle:
            json.dump(manifest, handle, indent=2)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        if destination.exists():
            raise ValueError('Backup destination appeared during backup')
        stage.rename(destination)
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path, help='New backup directory')
    args = parser.parse_args()
    print(json.dumps(backup(args.source, args.destination), indent=2))
