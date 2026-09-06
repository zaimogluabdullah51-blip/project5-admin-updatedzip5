const BASE_URL = (process.env.INDEXER_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://davatakibi.onrender.com').replace(/\/+$/, '');
const USERNAME = process.env.INDEXER_ADMIN_USER || process.env.ADMIN_USER || 'admin';
const PASSWORD = process.env.INDEXER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin135';
const CONFIGS = (process.env.PROBLEM_AUDIT_CONFIGS || process.env.INDEXER_CONFIGS || 'yargitay')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const BATCH_SIZE = Math.min(Math.max(Number(process.env.PROBLEM_AUDIT_BATCH_SIZE || process.env.INDEXER_BATCH_SIZE || 100), 1), 100);
const BATCHES_PER_CONFIG = Math.max(Number(process.env.PROBLEM_AUDIT_BATCHES || process.env.INDEXER_BATCHES || 1300), 1);
const START_OFFSET = Math.max(Number(process.env.PROBLEM_AUDIT_START_OFFSET || process.env.INDEXER_START_OFFSET || 0), 0);
const PROBLEM_LIMIT = Math.min(Math.max(Number(process.env.PROBLEM_AUDIT_LIMIT || 5000), 1), 20000);
const PROBLEM_FLAG = process.env.PROBLEM_AUDIT_FLAG || '';
const DELAY_MS = Math.max(Number(process.env.PROBLEM_AUDIT_DELAY_MS || process.env.INDEXER_DELAY_MS || 250), 0);
const MAX_RETRIES = Math.max(Number(process.env.PROBLEM_AUDIT_MAX_RETRIES || process.env.INDEXER_MAX_RETRIES || 8), 0);
const RETRY_BASE_MS = Math.max(Number(process.env.PROBLEM_AUDIT_RETRY_BASE_MS || process.env.INDEXER_RETRY_BASE_MS || 30000), 1000);
const INSERT_RULE_ONLY = String(process.env.INDEXER_INSERT_RULE_ONLY || '').toLowerCase() === 'true';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBatchError(error) {
  const message = String(error?.message || '');
  const causeCode = String(error?.cause?.code || '');
  return /429|502|503|504|rate limit|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|zaman aşımı|timeout|Hugging Face rows servisi yanıt vermedi/i.test(`${message} ${causeCode}`);
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

async function loadProblemIds(cookie) {
  const url = new URL(`${BASE_URL}/api/legal-index/problem-hf-ids`);
  url.searchParams.set('limit', String(PROBLEM_LIMIT));
  if (PROBLEM_FLAG) url.searchParams.set('flag', PROBLEM_FLAG);
  const response = await fetch(url, { headers: { Cookie: cookie } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Problem ID lookup failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  }
  const ids = Array.isArray(payload.hf_ids) ? payload.hf_ids.filter(Boolean) : [];
  return { ids, payload };
}

async function scanBatch(cookie, config, offset, onlyHfIds) {
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
      compact: true,
      tagsOnly: false,
      ruleAudit: true,
      insertRuleOnly: INSERT_RULE_ONLY,
      onlyHfIds
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Batch failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  }
  return payload;
}

async function scanBatchWithRetry(cookie, config, offset, onlyHfIds) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await scanBatch(cookie, config, offset, onlyHfIds);
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableBatchError(error)) throw error;
      const waitMs = RETRY_BASE_MS * Math.min(attempt + 1, 6);
      console.log(`[${new Date().toISOString()}] retry ${attempt + 1}/${MAX_RETRIES} for ${config}@${offset}: ${error.message}. waiting ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
  throw new Error(`Batch retry loop exhausted for ${config}@${offset}`);
}

console.log(`Problem audit target: ${BASE_URL}`);
console.log(`Configs: ${CONFIGS.join(', ')}`);
console.log(`Problem ID limit: ${PROBLEM_LIMIT}${PROBLEM_FLAG ? `, flag=${PROBLEM_FLAG}` : ''}`);
console.log(`Batch size: ${BATCH_SIZE}, batches/config: ${BATCHES_PER_CONFIG}, start offset: ${START_OFFSET}`);
console.log(`Delay: ${DELAY_MS}ms, retries: ${MAX_RETRIES}`);
if (INSERT_RULE_ONLY) console.log('Rule-only insertion: enabled; parser-only citations will also be inserted.');

const cookie = await login();
const { ids, payload } = await loadProblemIds(cookie);
const pending = new Set(ids);
console.log(`Loaded problem citations: ${payload.citation_rows_scanned || 0}, distinct hf_ids: ${ids.length}`);
if (payload.flag_counts) console.log(`Current flag counts: ${JSON.stringify(payload.flag_counts)}`);
if (!pending.size) {
  console.log('No problem hf_ids found. Nothing to re-audit.');
  process.exit(0);
}

let totalRows = 0;
let totalDecisions = 0;
let totalCitations = 0;
let totalFound = 0;
let batchNo = 0;

outer: for (const config of CONFIGS) {
  let offset = START_OFFSET;
  for (let batch = 0; batch < BATCHES_PER_CONFIG; batch += 1) {
    batchNo += 1;
    const result = await scanBatchWithRetry(cookie, config, offset, Array.from(pending));
    totalRows += Number(result.rows_scanned || 0);
    totalDecisions += Number(result.decisions_indexed || 0);
    totalCitations += Number(result.citations_indexed || 0);
    const found = Array.isArray(result.matched_hf_ids) ? result.matched_hf_ids : [];
    found.forEach((id) => pending.delete(id));
    totalFound += found.length;
    const audit = result.audit_stats || {};
    console.log(`[${new Date().toISOString()}] batch=${batchNo} [${config}] offset ${offset}: scanned=${result.rows_scanned}, found=${found.length}, remaining=${pending.size}, decisions=${result.decisions_indexed}, citations=${result.citations_indexed}, confirmed=${audit.exact_matches || 0}, review=${audit.needs_review || 0}, hf_only=${audit.hf_only || 0}, rule_only=${audit.rule_only || 0}`);
    if (!result.rows_scanned) break;
    if (!pending.size) break outer;
    offset = Number(result.next_offset || offset + BATCH_SIZE);
    if (DELAY_MS) await sleep(DELAY_MS);
  }
}

console.log(`Done. scanned=${totalRows}, found=${totalFound}, unresolved_hf_ids=${pending.size}, decisions=${totalDecisions}, citations=${totalCitations}`);
if (pending.size) {
  console.log(`First unresolved ids: ${Array.from(pending).slice(0, 20).join(', ')}`);
}
