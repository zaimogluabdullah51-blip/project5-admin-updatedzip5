"""Apply a bounded search delta to an OFFLINE writable pair, never a serving pair."""
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3
import struct
import zlib


def unpack(payload, count):
    raw = zlib.decompress(payload)
    texts, offset = [], 0
    for _ in range(count):
        size = struct.unpack_from('<I', raw, offset)[0]
        offset += 4
        if offset + size > len(raw):
            raise ValueError('Truncated content chunk')
        texts.append(raw[offset:offset + size].decode('utf-8'))
        offset += size
    if offset != len(raw):
        raise ValueError('Content chunk length mismatch')
    return texts


def pack(texts):
    raw = bytearray()
    for text in texts:
        encoded = text.encode('utf-8')
        raw.extend(struct.pack('<I', len(encoded)))
        raw.extend(encoded)
    return zlib.compress(raw, 6)


def sync(main, fulltext, limit=1000):
    main, fulltext = main.resolve(), fulltext.resolve()
    if main == fulltext or not main.is_file() or not fulltext.is_file():
        raise ValueError('Two existing, distinct offline databases are required')
    with closing(sqlite3.connect(main.as_uri() + '?mode=rw', uri=True)) as db:
        if db.execute("SELECT type FROM sqlite_master WHERE name='legal_index_citations'").fetchone() != ('table',):
            raise ValueError('Use a writable build copy, not a compact serving artifact')
        status = db.execute("SELECT value FROM legal_index_meta WHERE key='status'").fetchone()
        if status not in [('pending_search_sync',), ('ready',)]:
            raise ValueError('Main build must finish before search synchronization')
        db.execute('ATTACH DATABASE ? AS ft', (fulltext.as_uri() + '?mode=rw',))
        meta = dict(db.execute('SELECT key,value FROM ft.legal_index_fulltext_meta'))
        if meta.get('status') != 'ready' or meta.get('complete') != '1' or meta.get('content_complete') != '1':
            raise ValueError('Full-text base must be complete')
        if meta.get('content_encoding') != 'utf8_length_prefix_v1' or meta.get('content_compression') != 'zlib':
            raise ValueError('Unsupported content encoding')
        chunk_size, start = int(meta['content_chunk_size']), int(meta.get('start_offset', 0))
        if chunk_size < 1 or limit < 1:
            raise ValueError('Invalid limits')
        # DELETE journals enable SQLite's atomic commit across attached disk databases.
        for schema in ('main', 'ft'):
            if db.execute(f'PRAGMA {schema}.journal_mode=DELETE').fetchone()[0] != 'delete':
                raise ValueError('Offline rollback journals are required')
            db.execute(f'PRAGMA {schema}.synchronous=FULL')
        try:
            db.execute('BEGIN IMMEDIATE')
            updates = db.execute('SELECT hf_id,body FROM legal_index_search_updates ORDER BY hf_id LIMIT ?', (limit + 1,)).fetchall()
            if len(updates) > limit:
                raise ValueError('Delta exceeds limit; split the source delta before building')
            for hf_id, body in updates:
                if not db.execute('SELECT 1 FROM legal_index_decisions WHERE hf_id=?', (hf_id,)).fetchone():
                    raise ValueError('Queued decision is missing')
                mapped = db.execute('SELECT rowid FROM ft.legal_index_fulltext_map WHERE hf_id=? LIMIT 2', (hf_id,)).fetchall()
                if len(mapped) > 1:
                    raise ValueError('Duplicate full-text decision id')
                existing = bool(mapped)
                rowid = mapped[0][0] if existing else db.execute('SELECT coalesce(max(rowid), ?) + 1 FROM ft.legal_index_fulltext_map', (start,)).fetchone()[0]
                chunk_id = (rowid - start - 1) // chunk_size
                chunk = db.execute('SELECT first_rowid,row_count,payload FROM ft.legal_index_fulltext_content WHERE chunk_id=?', (chunk_id,)).fetchone()
                first = start + chunk_id * chunk_size + 1
                if chunk and chunk[0] != first:
                    raise ValueError('Unexpected content row mapping')
                texts = unpack(chunk[2], chunk[1]) if chunk else []
                position = rowid - first
                if existing:
                    if position < 0 or position >= len(texts):
                        raise ValueError('Missing original content for FTS deletion')
                    db.execute("INSERT INTO ft.legal_index_fulltext_fts(legal_index_fulltext_fts,rowid,body) VALUES('delete',?,?)", (rowid, texts[position]))
                    texts[position] = body
                else:
                    if position != len(texts):
                        raise ValueError('Non-contiguous full-text append')
                    texts.append(body)
                    db.execute('INSERT INTO ft.legal_index_fulltext_map(rowid,hf_id) VALUES(?,?)', (rowid, hf_id))
                db.execute('INSERT INTO ft.legal_index_fulltext_fts(rowid,body) VALUES(?,?)', (rowid, body))
                db.execute('INSERT OR REPLACE INTO ft.legal_index_fulltext_content VALUES(?,?,?,?)', (chunk_id, first, len(texts), pack(texts)))
            mismatch = db.execute('SELECT hf_id FROM legal_index_decisions EXCEPT SELECT hf_id FROM ft.legal_index_fulltext_map LIMIT 1').fetchone()
            reverse = db.execute('SELECT hf_id FROM ft.legal_index_fulltext_map EXCEPT SELECT hf_id FROM legal_index_decisions LIMIT 1').fetchone()
            if mismatch or reverse:
                raise ValueError('Main/full-text ID populations differ')
            # Rebuild once if preview FTS did not exist; otherwise builder triggers maintained it.
            if not db.execute("SELECT 1 FROM sqlite_master WHERE name='legal_index_decisions_fts'").fetchone():
                db.execute("CREATE VIRTUAL TABLE legal_index_decisions_fts USING fts5(short_preview,content='legal_index_decisions',content_rowid='rowid',tokenize='unicode61 remove_diacritics 2')")
                db.execute("INSERT INTO legal_index_decisions_fts(legal_index_decisions_fts) VALUES('rebuild')")
            db.execute("INSERT INTO legal_index_decisions_fts(legal_index_decisions_fts,rank) VALUES('integrity-check',1)")
            db.execute("INSERT INTO ft.legal_index_fulltext_fts(legal_index_fulltext_fts) VALUES('integrity-check')")
            count = db.execute('SELECT count(*) FROM legal_index_decisions').fetchone()[0]
            mapped_count = db.execute('SELECT count(*) FROM ft.legal_index_fulltext_map').fetchone()[0]
            content_count = db.execute('SELECT coalesce(sum(row_count),0) FROM ft.legal_index_fulltext_content').fetchone()[0]
            if mapped_count != count or content_count != count:
                raise ValueError('Content/map population mismatch')
            for key in ('rows_indexed', 'source_rows', 'content_rows'):
                db.execute('INSERT OR REPLACE INTO ft.legal_index_fulltext_meta VALUES(?,?)', (key, str(count)))
            chunks = db.execute('SELECT count(*) FROM ft.legal_index_fulltext_content').fetchone()[0]
            db.execute("INSERT OR REPLACE INTO ft.legal_index_fulltext_meta VALUES('content_chunks',?)", (str(chunks),))
            db.execute('CREATE TABLE IF NOT EXISTS legal_index_court_counts(court TEXT PRIMARY KEY,decision_count INTEGER NOT NULL)')
            db.execute('DELETE FROM legal_index_court_counts')
            db.execute("INSERT INTO legal_index_court_counts SELECT court,count(*) FROM legal_index_decisions WHERE court<>'' GROUP BY court")
            dates = db.execute("SELECT min(karar_tarihi),max(karar_tarihi) FROM legal_index_decisions WHERE karar_tarihi<>''").fetchone()
            for key, value in [('min_date', dates[0] or ''), ('max_date', dates[1] or ''), ('preview_fts_rows', str(count)), ('status', 'ready')]:
                db.execute('INSERT OR REPLACE INTO legal_index_meta VALUES(?,?)', (key, value))
            db.execute('DELETE FROM legal_index_search_updates')
            db.commit()
            return len(updates)
        except Exception:
            db.rollback()
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('main', type=Path)
    parser.add_argument('fulltext', type=Path)
    parser.add_argument('--offline-copy', action='store_true', required=True)
    parser.add_argument('--limit', type=int, default=1000)
    args = parser.parse_args()
    print({'synced': sync(args.main, args.fulltext, args.limit)})
