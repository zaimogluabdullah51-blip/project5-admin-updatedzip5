import gzip
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-legal-release.py'))
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class ReleaseInstallationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.package = self.root / 'package'
        self.package.mkdir()
        self.target = self.root / 'installed'

    def make_package(self, fulltext_rows=1):
        entries = []
        for name in ['legal-index-production.sqlite', 'legal-index-fulltext.sqlite']:
            source = self.root / name
            with sqlite3.connect(source) as db:
                if 'production' in name:
                    db.executescript("CREATE TABLE legal_index_meta(key,value); INSERT INTO legal_index_meta VALUES('status','ready'); CREATE TABLE legal_index_decisions(hf_id); INSERT INTO legal_index_decisions VALUES('a');")
                else:
                    db.executescript("CREATE TABLE legal_index_fulltext_meta(key,value); CREATE TABLE legal_index_fulltext_map(hf_id); CREATE TABLE legal_index_fulltext_content(row_count);")
                    db.executemany('INSERT INTO legal_index_fulltext_meta VALUES(?,?)', [('status','ready'),('complete','1'),('content_status','ready'),('content_complete','1'),('rows_indexed',str(fulltext_rows))])
                    db.executemany('INSERT INTO legal_index_fulltext_map VALUES(?)', [('a',)] * fulltext_rows)
                    db.execute('INSERT INTO legal_index_fulltext_content VALUES(?)', (fulltext_rows,))
            db.close()
            raw = source.read_bytes()
            packed = gzip.compress(raw)
            (self.package / (name+'.gz')).write_bytes(packed)
            entries.append(dict(file=name+'.gz',uncompressed_bytes=len(raw),compressed_bytes=len(packed),sqlite_sha256=hashlib.sha256(raw).hexdigest(),gzip_sha256=hashlib.sha256(packed).hexdigest()))
        (self.package/'manifest.json').write_text(json.dumps({'format':'legal-index-release-v1','artifacts':entries}))

    def test_installs_verified_pair_and_refuses_overwrite(self):
        self.make_package()
        self.assertEqual(1, installer.install(self.package, self.target))
        paths = json.loads((self.target/'paths.json').read_text())
        self.assertTrue(Path(paths['LEGAL_INDEX_DB_PATH']).exists())
        self.assertTrue(Path(paths['LEGAL_FULLTEXT_DB_PATH']).exists())
        with self.assertRaisesRegex(ValueError, 'never overwritten'):
            installer.install(self.package, self.target)

    def test_bad_second_archive_does_not_publish_or_leave_partial(self):
        self.make_package()
        (self.package/'legal-index-fulltext.sqlite.gz').write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
            installer.install(self.package, self.target)
        self.assertFalse(self.target.exists())
        self.assertFalse(list(self.root.glob('.legal-release-*')))

    def test_population_mismatch_does_not_publish(self):
        self.make_package(fulltext_rows=2)
        with self.assertRaisesRegex(ValueError, 'population mismatch'):
            installer.install(self.package, self.target)
        self.assertFalse(self.target.exists())

    def test_missing_pair_is_rejected(self):
        self.make_package()
        manifest = json.loads((self.package/'manifest.json').read_text())
        manifest['artifacts'].pop()
        (self.package/'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'exactly'):
            installer.install(self.package, self.target)


if __name__ == '__main__':
    unittest.main()
