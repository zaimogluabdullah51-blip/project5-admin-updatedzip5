import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('delta', Path(__file__).with_name('sync-search-delta.py'))
delta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delta)


class SearchDeltaTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.main, self.full = Path(self.temp.name) / 'main.sqlite', Path(self.temp.name) / 'full.sqlite'
        with sqlite3.connect(self.main) as db:
            db.executescript("""
              CREATE TABLE legal_index_citations(id);
              CREATE TABLE legal_index_decisions(hf_id TEXT PRIMARY KEY,short_preview,court,karar_tarihi);
              INSERT INTO legal_index_decisions VALUES('a','newword','court','2025-01-01'),('b','neighbor','court','2025-01-02'),('c','addedword','newcourt','2026-01-01');
              CREATE TABLE legal_index_search_updates(hf_id TEXT PRIMARY KEY,body);
              INSERT INTO legal_index_search_updates VALUES('a','newword'),('c','addedword');
              CREATE TABLE legal_index_meta(key TEXT PRIMARY KEY,value);
              INSERT INTO legal_index_meta VALUES('status','pending_search_sync');
            """)
        with sqlite3.connect(self.full) as db:
            db.executescript("""
              CREATE TABLE legal_index_fulltext_meta(key TEXT PRIMARY KEY,value);
              CREATE TABLE legal_index_fulltext_map(rowid INTEGER PRIMARY KEY,hf_id);
              INSERT INTO legal_index_fulltext_map VALUES(1,'a'),(2,'b');
              CREATE VIRTUAL TABLE legal_index_fulltext_fts USING fts5(body,content='',tokenize='unicode61 remove_diacritics 2');
              INSERT INTO legal_index_fulltext_fts(rowid,body) VALUES(1,'oldword'),(2,'neighbor');
              CREATE TABLE legal_index_fulltext_content(chunk_id INTEGER PRIMARY KEY,first_rowid,row_count,payload);
            """)
            meta = dict(status='ready',complete='1',content_complete='1',content_encoding='utf8_length_prefix_v1',content_compression='zlib',content_chunk_size='2',start_offset='0')
            db.executemany('INSERT INTO legal_index_fulltext_meta VALUES(?,?)', meta.items())
            db.execute('INSERT INTO legal_index_fulltext_content VALUES(0,1,2,?)', (delta.pack(['oldword','neighbor']),))

    def test_update_append_replay_and_chunk_neighbor(self):
        self.assertEqual(2, delta.sync(self.main, self.full))
        with sqlite3.connect(self.full) as db:
            for word, expected in [('oldword', []), ('newword', [(1,)]), ('neighbor', [(2,)]), ('addedword', [(3,)])]:
                self.assertEqual(expected, db.execute('SELECT rowid FROM legal_index_fulltext_fts WHERE legal_index_fulltext_fts MATCH ?', (word,)).fetchall())
            texts = [delta.unpack(payload, count) for count, payload in db.execute('SELECT row_count,payload FROM legal_index_fulltext_content ORDER BY chunk_id')]
            self.assertEqual([['newword','neighbor'],['addedword']], texts)
            self.assertEqual(('2',), db.execute("SELECT value FROM legal_index_fulltext_meta WHERE key='content_chunks'").fetchone())
        self.assertEqual(0, delta.sync(self.main, self.full))
        with sqlite3.connect(self.main) as db:
            self.assertEqual(('ready',), db.execute("SELECT value FROM legal_index_meta WHERE key='status'").fetchone())
            self.assertEqual([(1,)], db.execute("SELECT rowid FROM legal_index_decisions_fts WHERE legal_index_decisions_fts MATCH 'newword'").fetchall())

    def test_failure_rolls_back_both_files_and_preserves_queue(self):
        with sqlite3.connect(self.full) as db:
            db.execute("CREATE TRIGGER fail_append BEFORE INSERT ON legal_index_fulltext_map BEGIN SELECT RAISE(ABORT,'forced failure'); END")
        with self.assertRaisesRegex(sqlite3.DatabaseError, 'forced failure'):
            delta.sync(self.main, self.full)
        with sqlite3.connect(self.full) as db:
            self.assertEqual([(1,)], db.execute("SELECT rowid FROM legal_index_fulltext_fts WHERE legal_index_fulltext_fts MATCH 'oldword'").fetchall())
        with sqlite3.connect(self.main) as db:
            self.assertEqual(2, db.execute('SELECT count(*) FROM legal_index_search_updates').fetchone()[0])
            self.assertEqual(('pending_search_sync',), db.execute("SELECT value FROM legal_index_meta WHERE key='status'").fetchone())

    def test_limit_rejected_without_consuming_queue(self):
        with self.assertRaisesRegex(ValueError, 'exceeds limit'):
            delta.sync(self.main, self.full, limit=1)
        with sqlite3.connect(self.main) as db:
            self.assertEqual(2, db.execute('SELECT count(*) FROM legal_index_search_updates').fetchone()[0])

    def test_append_into_partial_chunk(self):
        with sqlite3.connect(self.full) as db:
            db.execute("UPDATE legal_index_fulltext_meta SET value='4' WHERE key='content_chunk_size'")
        delta.sync(self.main, self.full)
        with sqlite3.connect(self.full) as db:
            count, payload = db.execute('SELECT row_count,payload FROM legal_index_fulltext_content WHERE chunk_id=0').fetchone()
            self.assertEqual(['newword','neighbor','addedword'], delta.unpack(payload, count))

    def test_failed_main_build_is_not_promoted(self):
        with sqlite3.connect(self.main) as db:
            db.execute("UPDATE legal_index_meta SET value='failed' WHERE key='status'")
        with self.assertRaisesRegex(ValueError, 'must finish'):
            delta.sync(self.main, self.full)


if __name__ == '__main__':
    unittest.main()
