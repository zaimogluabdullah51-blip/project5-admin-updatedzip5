import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


class CompactArtifactTest(unittest.TestCase):
    def test_null_attributes_and_duplicate_references_survive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source, output = root/'source.sqlite', root/'compact.sqlite'
            db = sqlite3.connect(source)
            db.executescript('''
              CREATE TABLE legal_index_meta(key TEXT PRIMARY KEY, value TEXT);
              CREATE TABLE legal_index_decisions(hf_id TEXT PRIMARY KEY, short_preview TEXT, court TEXT, karar_tarihi TEXT, citation_count INTEGER);
              INSERT INTO legal_index_decisions(rowid,hf_id,short_preview) VALUES(7,'a','sample');
              CREATE TABLE legal_index_citations(id INTEGER PRIMARY KEY,hf_id TEXT,
                law_no TEXT,law_code TEXT,law_name TEXT,source_method TEXT,confidence TEXT,
                quality_status TEXT,article TEXT,canonical_ref TEXT,raw_reference TEXT,
                context TEXT,position INTEGER,indexed_at TEXT);
            ''')
            values = [('5237','TCK','law','rule','medium','detected'), (None,)*6, ('',)*6, (None,)*6]
            for i, attrs in enumerate(values, 1):
                db.execute('INSERT INTO legal_index_citations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                           (i,'a',*attrs,'125','5237:TCK:125','same',None,i,None))
            db.commit()
            expected = db.execute('SELECT * FROM legal_index_citations ORDER BY id').fetchall()
            db.close()
            script = Path(__file__).with_name('build-compact-legal-index.py')
            subprocess.run([sys.executable, str(script), str(source), str(output)], check=True, capture_output=True)
            compact = sqlite3.connect(output)
            self.assertEqual(expected, compact.execute('SELECT * FROM legal_index_citations ORDER BY id').fetchall())
            self.assertEqual([(7,'a','sample',None,None,None)], compact.execute('SELECT rowid,* FROM legal_index_decisions').fetchall())
            self.assertEqual(3, compact.execute('SELECT count(*) FROM citation_attributes').fetchone()[0])
            compact.close()
            retry = subprocess.run([sys.executable, str(script), str(source), str(output)], capture_output=True)
            self.assertNotEqual(0, retry.returncode)
            manifest = json.loads(Path(str(output)+'.manifest.json').read_text())
            self.assertTrue(manifest['all_citation_fields_equal'])


if __name__ == '__main__':
    unittest.main()
