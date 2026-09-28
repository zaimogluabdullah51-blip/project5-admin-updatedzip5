"""Bounded real-corpus smoke test; source indexes are opened read-only."""
import argparse
from contextlib import closing
import importlib.util
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('delta', ROOT / 'scripts/sync-search-delta.py')
delta = importlib.util.module_from_spec(spec)
spec.loader.exec_module(delta)


def verify(source_main, source_full, destination):
    destination = destination.resolve()
    destination.mkdir(mode=0o700, parents=True, exist_ok=False)
    main, full = destination / 'main.sqlite', destination / 'fulltext.sqlite'
    rows = []
    with closing(sqlite3.connect(source_main.resolve().as_uri() + '?mode=ro', uri=True)) as source:
        source.row_factory = sqlite3.Row
        with closing(sqlite3.connect(source_full.resolve().as_uri() + '?mode=ro', uri=True)) as texts:
            meta = dict(texts.execute('SELECT key,value FROM legal_index_fulltext_meta'))
            lo, hi = texts.execute('SELECT min(rowid),max(rowid) FROM legal_index_fulltext_map').fetchone()
            for i in range(12):
                rowid = lo + (hi - lo) * i // 11
                hf_id = texts.execute('SELECT hf_id FROM legal_index_fulltext_map WHERE rowid=?', (rowid,)).fetchone()[0]
                row = dict(source.execute('SELECT * FROM legal_index_decisions WHERE hf_id=?', (hf_id,)).fetchone())
                chunk_id = (rowid - int(meta.get('start_offset', 0)) - 1) // int(meta['content_chunk_size'])
                first, count, payload = texts.execute('SELECT first_rowid,row_count,payload FROM legal_index_fulltext_content WHERE chunk_id=?', (chunk_id,)).fetchone()
                row['id'], row['text'] = hf_id, delta.unpack(payload, count)[rowid - first]
                rows.append(row)
    env = dict(os.environ, LEGAL_INDEX_DB_PATH=str(main), LEGAL_FULLTEXT_DB_PATH=str(full),
               HF_INDEX_START_OFFSET='0', HF_INDEX_MAX_CHUNK_RETRIES='0', HF_INDEX_TRACK_SEARCH_UPDATES='true')

    def command(args, custom_env=env):
        result = subprocess.run(args, cwd=destination, env=custom_env, text=True, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        return result.stdout

    def build(batch, name):
        file = destination / (name + '.jsonl')
        file.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in batch))
        command(['node', str(ROOT / 'scripts/build-local-legal-index.mjs')], dict(env,
                HF_INDEX_INPUT_JSONL=str(file), HF_INDEX_LIMIT=str(len(batch)),
                HF_INDEX_CHECKPOINT=str(destination / (name + '.checkpoint.json'))))

    build(rows, 'baseline')
    command(['node', str(ROOT / 'scripts/build-local-preview-fts.mjs')])
    with sqlite3.connect(full) as db:
        db.executescript("""
          CREATE TABLE legal_index_fulltext_meta(key TEXT PRIMARY KEY,value);
          CREATE TABLE legal_index_fulltext_map(rowid INTEGER PRIMARY KEY,hf_id TEXT NOT NULL);
          CREATE UNIQUE INDEX fulltext_id ON legal_index_fulltext_map(hf_id);
          CREATE VIRTUAL TABLE legal_index_fulltext_fts USING fts5(body,content='',detail=full,tokenize='unicode61 remove_diacritics 2');
          CREATE TABLE legal_index_fulltext_content(chunk_id INTEGER PRIMARY KEY,first_rowid INTEGER,row_count INTEGER,payload BLOB);
        """)
        local_meta = dict(status='ready',complete='1',content_status='ready',content_complete='1',
                          content_encoding='utf8_length_prefix_v1',content_compression='zlib',content_chunk_size='4',
                          start_offset='0',rows_indexed='12',source_rows='12',content_rows='12',content_chunks='3')
        db.executemany('INSERT INTO legal_index_fulltext_meta VALUES(?,?)', local_meta.items())
        for i, row in enumerate(rows, 1):
            db.execute('INSERT INTO legal_index_fulltext_map VALUES(?,?)', (i,row['id']))
            db.execute('INSERT INTO legal_index_fulltext_fts(rowid,body) VALUES(?,?)', (i,row['text']))
        for i in range(0, 12, 4):
            db.execute('INSERT INTO legal_index_fulltext_content VALUES(?,?,?,?)', (i//4,i+1,4,delta.pack([r['text'] for r in rows[i:i+4]])))
    assert delta.sync(main, full) == 12
    marker = 'zzdeltaverificationtoken'
    added = 'zzdeltaaddedtoken'
    assert all(marker not in row['text'] and added not in row['text'] for row in rows)
    changed = dict(rows[0], text=rows[0]['text'] + '\n' + marker)
    synthetic = dict(rows[1], id='test-only:delta-new', text=rows[1]['text'] + '\n' + added)
    build([changed, synthetic], 'delta')
    assert delta.sync(main, full) == 2
    assert delta.sync(main, full) == 0
    check = json.loads(command(['node', str(ROOT / 'scripts/check-local-fulltext-index.mjs')],
                              dict(env, LEGAL_FULLTEXT_CHECK_QUERIES=marker + ',' + added)))
    assert check['valid']
    with sqlite3.connect(main) as db:
        db.execute("INSERT INTO legal_index_decisions_fts(legal_index_decisions_fts,rank) VALUES('integrity-check',1)")
        assert db.execute('SELECT count(*) FROM legal_index_search_updates').fetchone()[0] == 0
    # Server case data is isolated by cwd; real application cases.db is not used.
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    log = (destination / 'server.log').open('w')
    process = subprocess.Popen(['node', str(ROOT / 'server.js')], cwd=destination,
                               env=dict(env, PORT=str(port), LEGAL_INDEX_ENABLED='true', LEGAL_INDEX_SUPABASE_FALLBACK='false'), stdout=log, stderr=log)
    def request(route, params=None):
        url = f'http://127.0.0.1:{port}' + route
        if params:
            url += '?' + urllib.parse.urlencode(params)
        with urllib.request.urlopen(url, timeout=10) as response:
            return json.load(response)
    try:
        for attempt in range(100):
            if process.poll() is not None:
                raise RuntimeError('Isolated server failed; inspect server.log')
            try:
                options = request('/api/legal-index/search-options')
                break
            except OSError:
                time.sleep(.1)
        else:
            raise RuntimeError('Isolated server did not become ready')
        assert options['ready']
        with sqlite3.connect(main) as db:
            db.execute("UPDATE legal_index_meta SET value='pending_search_sync' WHERE key='status'")
        try:
            assert request('/api/legal-index/search-options')['ready'] is False
            try:
                request('/api/legal-index/search', {'query': marker})
                raise AssertionError('Pending index was searchable')
            except urllib.error.HTTPError as error:
                assert error.code == 503
        finally:
            with sqlite3.connect(main) as db:
                db.execute("UPDATE legal_index_meta SET value='ready' WHERE key='status'")
        assert request('/api/legal-index/search-options')['ready']
        for term, expected in [(marker, rows[0]['id']), (added, synthetic['id'])]:
            response = request('/api/legal-index/search', {'query': term})
            assert response['text_search_scope'] == 'fulltext'
            assert [r['hf_id'] for r in response['results']] == [expected]
            assert term in response['results'][0]['match_preview']
        response = request('/api/legal-index/search', {'court': changed['court'], 'dateFrom': changed['karar_tarihi'], 'dateTo': changed['karar_tarihi']})
        assert changed['id'] in [r['hf_id'] for r in response['results']]
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
        log.close()
    report = dict(real_decisions=12, test_only_added_decisions=1, changed_real_copies=1,
                  valid=True, api_fulltext_and_snippets=True, api_court_date=True, pending_index_rejected=True,
                  replay_pending=0, counts=check['counts'], source_mode='read-only',
                  note='Synthetic marker changes exist only in this test copy. Not a corpus accuracy or scale test.')
    (destination / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_main', type=Path)
    parser.add_argument('source_full', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.source_main, args.source_full, args.destination), indent=2))
