const BASE_URL = (process.env.INDEXER_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000').replace(/\/+$/, '');
const USERNAME = process.env.INDEXER_ADMIN_USER || process.env.ADMIN_USER || 'admin';
const PASSWORD = process.env.INDEXER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin135';
const CONFIGS = (process.env.INDEXER_CONFIGS || 'yargitay,emsal,aym_norm,aym_bb,danistay')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const BATCH_SIZE = Math.min(Math.max(Number(process.env.INDEXER_BATCH_SIZE || 100), 1), 100);
const BATCHES_PER_CONFIG = Math.max(Number(process.env.INDEXER_BATCHES || 10), 1);
const START_OFFSET = Math.max(Number(process.env.INDEXER_START_OFFSET || 0), 0);
const LEGAL_REF = process.env.INDEXER_LEGAL_REF || '';
const DRY_RUN = String(process.env.INDEXER_DRY_RUN || '').toLowerCase() === 'true';
const COMPACT = String(process.env.INDEXER_COMPACT || '').toLowerCase() === 'true';
const TAGS_ONLY = process.env.INDEXER_TAGS_ONLY
  ? String(process.env.INDEXER_TAGS_ONLY).toLowerCase() === 'true'
  : COMPACT;
const TARGET_CITATIONS = Math.max(Number(process.env.INDEXER_TARGET_CITATIONS || 0), 0);
const DELAY_MS = Math.max(Number(process.env.INDEXER_DELAY_MS || 250), 0);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login() {
  const response = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Login failed (${response.status}): ${text}`);
  }
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('Login did not return an auth cookie.');
  return cookie.split(';')[0];
}

async function scanBatch(cookie, config, offset) {
  const response = await fetch(`${BASE_URL}/api/legal-index/scan-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({
      config,
      offset,
      length: BATCH_SIZE,
      legalRef: LEGAL_REF,
      query: LEGAL_REF,
      dryRun: DRY_RUN,
      compact: COMPACT,
      tagsOnly: TAGS_ONLY
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Batch failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  }
  return payload;
}

console.log(`Index target: ${BASE_URL}`);
console.log(`Configs: ${CONFIGS.join(', ')}`);
console.log(`Batch size: ${BATCH_SIZE}, batches/config: ${BATCHES_PER_CONFIG}`);
if (LEGAL_REF) console.log(`Target legal ref: ${LEGAL_REF}`);
if (DRY_RUN) console.log('Dry run: enabled; no Supabase writes will be attempted.');
if (COMPACT) console.log('Compact mode: enabled; only lightweight decision metadata and citation tags are stored.');
if (TAGS_ONLY) console.log('Tags-only mode: enabled; only Hugging Face mevzuat_atif tags are indexed.');
if (TARGET_CITATIONS) console.log(`Citation target: ${TARGET_CITATIONS}`);

const cookie = await login();
let totalRows = 0;
let totalDecisions = 0;
let totalCitations = 0;
let batchNo = 0;
const startedAt = Date.now();

outer: for (const config of CONFIGS) {
  let offset = START_OFFSET;
  for (let batch = 0; batch < BATCHES_PER_CONFIG; batch += 1) {
    batchNo += 1;
    const result = await scanBatch(cookie, config, offset);
    totalRows += Number(result.rows_scanned || 0);
    totalDecisions += Number(result.decisions_indexed || 0);
    totalCitations += Number(result.citations_indexed || 0);
    const previewCount = Array.isArray(result.matched_preview) ? result.matched_preview.length : 0;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const citationRate = totalCitations / elapsedSeconds;
    const remainingCitations = Math.max(0, TARGET_CITATIONS - totalCitations);
    const etaMinutes = TARGET_CITATIONS && citationRate > 0 ? Math.ceil(remainingCitations / citationRate / 60) : 0;
    console.log(`[${new Date().toISOString()}] batch=${batchNo} [${config}] offset ${offset}: scanned=${result.rows_scanned}, matched=${result.rows_matched_target}, decisions=${result.decisions_indexed}, citations=${result.citations_indexed}, total_citations=${totalCitations}${TARGET_CITATIONS ? `/${TARGET_CITATIONS}, eta_min=${etaMinutes}` : ''}${DRY_RUN ? `, preview=${previewCount}` : ''}`);
    if (!result.rows_scanned) break;
    if (TARGET_CITATIONS && totalCitations >= TARGET_CITATIONS) break outer;
    offset = Number(result.next_offset || offset + BATCH_SIZE);
    if (DELAY_MS) await sleep(DELAY_MS);
  }
}

console.log(`Done. scanned=${totalRows}, decisions=${totalDecisions}, citations=${totalCitations}`);
