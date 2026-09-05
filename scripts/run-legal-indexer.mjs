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
const RULE_AUDIT = String(process.env.INDEXER_RULE_AUDIT || '').toLowerCase() === 'true';
const INSERT_RULE_ONLY = String(process.env.INDEXER_INSERT_RULE_ONLY || '').toLowerCase() === 'true';
const TARGET_CITATIONS = Math.max(Number(process.env.INDEXER_TARGET_CITATIONS || 0), 0);
const DELAY_MS = Math.max(Number(process.env.INDEXER_DELAY_MS || 250), 0);
const MAX_RETRIES = Math.max(Number(process.env.INDEXER_MAX_RETRIES || 8), 0);
const RETRY_BASE_MS = Math.max(Number(process.env.INDEXER_RETRY_BASE_MS || 30000), 1000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBatchError(error) {
  const message = String(error?.message || "");
  const causeCode = String(error?.cause?.code || "");
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
      tagsOnly: TAGS_ONLY,
      ruleAudit: RULE_AUDIT,
      insertRuleOnly: INSERT_RULE_ONLY
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Batch failed (${response.status}): ${payload.error || JSON.stringify(payload)}`);
  }
  return payload;
}

async function scanBatchWithRetry(cookie, config, offset) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await scanBatch(cookie, config, offset);
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryableBatchError(error)) throw error;
      const waitMs = RETRY_BASE_MS * Math.min(attempt + 1, 6);
      console.log(`[${new Date().toISOString()}] retry ${attempt + 1}/${MAX_RETRIES} for ${config}@${offset}: ${error.message}. waiting ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
  throw new Error(`Batch retry loop exhausted for ${config}@${offset}`);
}

console.log(`Index target: ${BASE_URL}`);
console.log(`Configs: ${CONFIGS.join(', ')}`);
console.log(`Batch size: ${BATCH_SIZE}, batches/config: ${BATCHES_PER_CONFIG}`);
if (LEGAL_REF) console.log(`Target legal ref: ${LEGAL_REF}`);
if (DRY_RUN) console.log('Dry run: enabled; no Supabase writes will be attempted.');
if (COMPACT) console.log('Compact mode: enabled; only lightweight decision metadata and citation tags are stored.');
if (TAGS_ONLY) console.log('Tags-only mode: enabled; only Hugging Face mevzuat_atif tags are indexed.');
if (RULE_AUDIT) console.log('Rule audit: enabled; Hugging Face tags are compared with the rule-based parser and differences are marked.');
if (RULE_AUDIT && !INSERT_RULE_ONLY) console.log('Safe audit: rule-only parser suggestions are counted, but not inserted into the public citation index.');
if (INSERT_RULE_ONLY) console.log('Rule-only insertion: enabled; parser-only citations will be written to the citation index.');
if (TARGET_CITATIONS) console.log(`Citation target: ${TARGET_CITATIONS}`);
console.log(`Delay: ${DELAY_MS}ms, retries: ${MAX_RETRIES}, retry base: ${Math.round(RETRY_BASE_MS / 1000)}s`);

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
    const result = await scanBatchWithRetry(cookie, config, offset);
    totalRows += Number(result.rows_scanned || 0);
    totalDecisions += Number(result.decisions_indexed || 0);
    totalCitations += Number(result.citations_indexed || 0);
    const previewCount = Array.isArray(result.matched_preview) ? result.matched_preview.length : 0;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const citationRate = totalCitations / elapsedSeconds;
    const remainingCitations = Math.max(0, TARGET_CITATIONS - totalCitations);
    const etaMinutes = TARGET_CITATIONS && citationRate > 0 ? Math.ceil(remainingCitations / citationRate / 60) : 0;
    const audit = result.audit_stats || {};
    const auditText = RULE_AUDIT
      ? `, confirmed=${audit.exact_matches || 0}, review=${audit.needs_review || 0}, conflicts=${audit.conflicts || 0}, hf_only=${audit.hf_only || 0}, rule_only=${audit.rule_only || 0}`
      : '';
    console.log(`[${new Date().toISOString()}] batch=${batchNo} [${config}] offset ${offset}: scanned=${result.rows_scanned}, matched=${result.rows_matched_target}, decisions=${result.decisions_indexed}, citations=${result.citations_indexed}, total_citations=${totalCitations}${TARGET_CITATIONS ? `/${TARGET_CITATIONS}, eta_min=${etaMinutes}` : ''}${auditText}${DRY_RUN ? `, preview=${previewCount}` : ''}`);
    if (!result.rows_scanned) break;
    if (TARGET_CITATIONS && totalCitations >= TARGET_CITATIONS) break outer;
    offset = Number(result.next_offset || offset + BATCH_SIZE);
    if (DELAY_MS) await sleep(DELAY_MS);
  }
}

console.log(`Done. scanned=${totalRows}, decisions=${totalDecisions}, citations=${totalCitations}`);
