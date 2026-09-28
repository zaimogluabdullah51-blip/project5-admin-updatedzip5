import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('backup_tool', Path(__file__).with_name('backup-sqlite.py'))
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class BackupTest(unittest.TestCase):
    def test_live_wal_snapshot_is_independent_and_restorable(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'cases.sqlite'
            live = sqlite3.connect(source)
            self.addCleanup(live.close)
            live.execute('PRAGMA journal_mode=WAL')
            live.execute('CREATE TABLE cases(value)')
            live.execute('INSERT INTO cases VALUES(42)')
            live.commit()
            destination = root / 'backup'
            manifest = tool.backup(source, destination)
            snapshot = destination / 'snapshot.sqlite'
            self.assertEqual(hashlib.sha256(snapshot.read_bytes()).hexdigest(), manifest['sha256'])
            self.assertEqual(manifest, json.loads((destination / 'manifest.json').read_text()))
            restored = sqlite3.connect(snapshot)
            try:
                self.assertEqual([(42,)], restored.execute('SELECT value FROM cases').fetchall())
                self.assertEqual('ok', restored.execute('PRAGMA integrity_check').fetchone()[0])
            finally:
                restored.close()
            self.assertEqual(0o600, snapshot.stat().st_mode & 0o777)
            self.assertFalse((destination / 'snapshot.sqlite-wal').exists())
            with self.assertRaisesRegex(ValueError, 'already exists'):
                tool.backup(source, destination)
            self.assertEqual([(42,)], live.execute('SELECT value FROM cases').fetchall())
            live.close()

    def test_bad_source_never_publishes_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source, destination = root / 'bad.sqlite', root / 'backup'
            with self.assertRaisesRegex(ValueError, 'does not exist'):
                tool.backup(source, destination)
            source.write_bytes(b'not a database')
            with self.assertRaises(sqlite3.DatabaseError):
                tool.backup(source, destination)
            self.assertFalse(destination.exists())
            self.assertFalse(list(root.glob('.sqlite-backup-*')))


if __name__ == '__main__':
    unittest.main()
