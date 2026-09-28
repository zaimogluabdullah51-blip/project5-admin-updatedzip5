"""Add ordered court browsing to an already validated serving copy."""
import json
from pathlib import Path
import sqlite3
import sys
import time

artifact = Path(sys.argv[1]).resolve()
db = sqlite3.connect(artifact.as_uri()+'?mode=rw', uri=True)
kind = db.execute("SELECT value FROM legal_index_meta WHERE key='storage_format'").fetchone()
if kind != ('normalized-citations-v1',):
    raise SystemExit('Only a compact serving artifact may be optimized')
started = time.monotonic()
print('Building ordered court index', flush=True)
with db:
    db.execute('CREATE INDEX IF NOT EXISTS idx_decisions_court_date ON legal_index_decisions(court, karar_tarihi DESC, hf_id DESC, citation_count)')
    db.execute('DROP INDEX IF EXISTS idx_legal_index_decisions_court')
    db.execute("INSERT OR REPLACE INTO legal_index_meta VALUES('court_browse_index','court-date-id-count-v1')")
print('Reclaiming superseded index pages', flush=True)
db.execute('VACUUM')
db.execute('ANALYZE')
db.commit()
check = db.execute('PRAGMA quick_check').fetchone()[0]
if check != 'ok':
    raise RuntimeError(check)
db.close()
report = dict(output=str(artifact), output_bytes=artifact.stat().st_size,
              quick_check=check, elapsed_seconds=round(time.monotonic()-started,2),
              archive_rebuild_required=True)
Path(str(artifact)+'.optimization.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report), flush=True)
