"""Compare serving queries and full-text ranking against the source snapshot."""
import json
from pathlib import Path
import sqlite3
import sys
import time

source, compact, fulltext = map(lambda p: Path(p).resolve(), sys.argv[1:4])
report_path = sys.argv[4] if len(sys.argv) > 4 else str(compact)+'.search-check.json'
connections = [sqlite3.connect(p.as_uri()+'?mode=ro', uri=True) for p in [source, compact]]
for db in connections:
    db.execute('ATTACH DATABASE ? AS legal_fulltext', (fulltext.as_uri()+'?mode=ro',))

queries = [
    ('court/date', "SELECT * FROM legal_index_decisions WHERE court=? AND karar_tarihi>=? AND karar_tarihi<=? ORDER BY karar_tarihi DESC,hf_id DESC LIMIT 20", ('2. Hukuk Dairesi','2025-01-01','2025-12-31')),
    ('untagged', "SELECT * FROM legal_index_decisions WHERE court=? AND citation_count=0 ORDER BY karar_tarihi DESC,hf_id DESC LIMIT 20", ('2. Hukuk Dairesi',)),
    ('tagged', "SELECT * FROM legal_index_decisions WHERE court=? AND citation_count>0 ORDER BY karar_tarihi DESC,hf_id DESC LIMIT 20", ('2. Hukuk Dairesi',)),
    ('citation detail', "SELECT c.*,d.short_preview FROM legal_index_citations c JOIN legal_index_decisions d USING(hf_id) WHERE c.canonical_ref=? ORDER BY c.id DESC LIMIT 20", ('743:MK:639:2',)),
    ('law/article', "SELECT * FROM legal_index_citations WHERE law_no=? AND article=? ORDER BY id DESC LIMIT 20", ('5237','125')),
    ('combined citation filter', "SELECT d.* FROM legal_index_decisions d WHERE d.court=? AND d.karar_tarihi>=? AND EXISTS(SELECT 1 FROM legal_index_citations c WHERE c.hf_id=d.hf_id AND c.law_no=? AND c.article=?) ORDER BY d.karar_tarihi DESC,d.hf_id DESC LIMIT 20", ('4. Ceza Dairesi','2025-01-01','5237','125')),
    ('court options', 'SELECT * FROM legal_index_court_counts ORDER BY court', ()),
]
for term in ['"tarım" AND "sigortalılığı"', '"boşanma"', '"kamulaştırma" AND "bedeli"']:
    queries.append(('fulltext '+term, '''SELECT d.*,f.rank FROM legal_fulltext.legal_index_fulltext_fts f
      JOIN legal_fulltext.legal_index_fulltext_map m ON m.rowid=f.rowid
      JOIN legal_index_decisions d ON d.hf_id=m.hf_id
      WHERE legal_index_fulltext_fts MATCH ? ORDER BY f.rank LIMIT 20''', (term,)))
queries.append(('preview fallback', '''SELECT d.*, f.rank FROM legal_index_decisions_fts f
    JOIN legal_index_decisions d ON d.rowid=f.rowid
    WHERE legal_index_decisions_fts MATCH ? ORDER BY f.rank LIMIT 20''', ('"boşanma"',)))
results = []
for name, sql, params in queries:
    rows, timings = [], []
    for db in connections:
        start = time.monotonic()
        rows.append(db.execute(sql, params).fetchall())
        timings.append(round((time.monotonic()-start)*1000, 2))
    if rows[0] != rows[1]:
        raise AssertionError(f'Result mismatch: {name}')
    if not rows[0]:
        raise AssertionError(f'Empty verification query: {name}')
    result = dict(query=name, rows=len(rows[0]), equal=True, source_ms=timings[0], compact_ms=timings[1])
    results.append(result)
    print(json.dumps(result, ensure_ascii=False), flush=True)
with open(report_path, 'x') as handle:
    json.dump(results, handle, ensure_ascii=False, indent=2)
