"""Build a lossless, read-only serving artifact; never modify the source DB."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import time

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
source, output = args.source.resolve(), args.output.resolve()
partial = Path(str(output) + '.partial')
if source == output or output.exists() or partial.exists():
    raise SystemExit('Output and partial paths must be new and distinct from source')
output.parent.mkdir(parents=True, exist_ok=True)
started = time.monotonic()

def log(message):
    print(f'[{time.monotonic()-started:.1f}s] {message}', flush=True)

src = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
db = sqlite3.connect(partial)
try:
    log('Copying source snapshot')
    src.backup(db, pages=8192)
    src.close()
    db.execute('PRAGMA journal_mode=DELETE')
    db.execute('PRAGMA cache_size=-65536')
    db.execute('PRAGMA temp_store=FILE')
    attrs = ['law_no', 'law_code', 'law_name', 'source_method', 'confidence', 'quality_status']
    columns = [r[1] for r in db.execute('PRAGMA table_info(legal_index_citations)')]
    records = [c for c in columns if c not in attrs]
    original_count = db.execute('SELECT count(*) FROM legal_index_citations').fetchone()[0]
    log(f'Normalizing {original_count} citations')
    with db:
        db.execute('CREATE TABLE citation_attributes (attribute_id INTEGER PRIMARY KEY, ' + ', '.join(c+' TEXT' for c in attrs) + ')')
        db.execute('INSERT INTO citation_attributes (' + ','.join(attrs) + ') SELECT DISTINCT ' + ','.join(attrs) + ' FROM legal_index_citations')
        db.execute('CREATE UNIQUE INDEX citation_attributes_values ON citation_attributes (' + ','.join(attrs) + ')')
        declarations = [c + (' INTEGER PRIMARY KEY' if c == 'id' else ' INTEGER' if c == 'position' else ' TEXT') for c in records]
        db.execute('CREATE TABLE citation_records (' + ','.join(declarations) + ', attribute_id INTEGER NOT NULL)')
        join = ' AND '.join('a.'+c+' IS c.'+c for c in attrs)
        db.execute('INSERT INTO citation_records SELECT '+','.join('c.'+c for c in records)+', a.attribute_id FROM legal_index_citations c JOIN citation_attributes a ON '+join)
        projection = ','.join(('a.' if c in attrs else 'r.')+c+' AS '+c for c in columns)
        db.execute('CREATE VIEW compact_citations_check AS SELECT '+projection+' FROM citation_records r JOIN citation_attributes a USING(attribute_id)')
        copied = db.execute('SELECT count(*) FROM compact_citations_check').fetchone()[0]
        if copied != original_count:
            raise ValueError(f'Citation count mismatch: {copied} != {original_count}')
        log('Checking every citation field against snapshot')
        differences = ' OR '.join('c.'+c+' IS NOT p.'+c for c in columns)
        mismatch = db.execute('SELECT c.id FROM legal_index_citations c JOIN compact_citations_check p ON p.id=c.id WHERE '+differences+' LIMIT 1').fetchone()
        if mismatch:
            raise ValueError(f'Citation differs: {mismatch[0]}')
        db.execute('DROP VIEW compact_citations_check')
        db.execute('DROP TABLE legal_index_citations')
        db.execute('CREATE VIEW legal_index_citations AS SELECT '+projection+' FROM citation_records r JOIN citation_attributes a USING(attribute_id)')
        log('Creating serving indexes')
        db.execute('CREATE INDEX idx_citation_records_hf_id ON citation_records(hf_id)')
        db.execute('CREATE INDEX idx_citation_records_canonical ON citation_records(canonical_ref)')
        db.execute('CREATE INDEX idx_citation_records_law_article ON citation_records(attribute_id, article)')
        db.execute('CREATE INDEX idx_decisions_court_date ON legal_index_decisions(court, karar_tarihi DESC, hf_id DESC, citation_count)')
        db.execute('DROP INDEX IF EXISTS idx_legal_index_decisions_court')
        db.executemany('INSERT OR REPLACE INTO legal_index_meta(key,value) VALUES (?,?)', [
            ('storage_format', 'normalized-citations-v1'), ('artifact_read_only', 'true'),
            ('court_browse_index', 'court-date-id-count-v1'),
        ])
    log('Reclaiming free pages')
    db.execute('VACUUM')
    db.execute('ANALYZE')
    db.commit()
    log('Checking database integrity')
    check = db.execute('PRAGMA quick_check').fetchone()[0]
    if check != 'ok':
        raise ValueError(check)
    report = dict(source=str(source), output=str(output), source_bytes=source.stat().st_size,
                  output_bytes=partial.stat().st_size, citations=original_count,
                  decisions=db.execute('SELECT count(*) FROM legal_index_decisions').fetchone()[0],
                  attribute_groups=db.execute('SELECT count(*) FROM citation_attributes').fetchone()[0],
                  all_citation_fields_equal=True, quick_check=check,
                  elapsed_seconds=round(time.monotonic()-started, 2), read_only_artifact=True)
    db.close()
    os.rename(partial, output)
    with open(str(output)+'.manifest.json', 'x') as handle:
        json.dump(report, handle, indent=2)
    log(json.dumps(report))
except BaseException:
    db.close()
    src.close()
    raise
