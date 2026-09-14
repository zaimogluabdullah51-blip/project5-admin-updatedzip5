import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const DB_PATH = process.env.LEGAL_INDEX_DB_PATH || path.join(rootDir, "data", "legal-index.sqlite");
const SOURCE_URL = process.env.LEGAL_INDEX_DB_URL || process.env.LEGAL_INDEX_ARCHIVE_URL || "";
const EXPECTED_SHA256 = process.env.LEGAL_INDEX_DB_SHA256 || "";
const AUTH_HEADER = process.env.LEGAL_INDEX_DB_AUTH_HEADER || "";
const BEARER_TOKEN = process.env.LEGAL_INDEX_DB_BEARER_TOKEN || "";
const REQUIRED = String(process.env.LEGAL_INDEX_REQUIRED || "").toLowerCase() === "true";
const FORCE = String(process.env.LEGAL_INDEX_DB_PREPARE_FORCE || "").toLowerCase() === "true";
const MAX_RETRIES = Math.max(Number(process.env.LEGAL_INDEX_DB_DOWNLOAD_RETRIES || 4), 0);
const RETRY_BASE_MS = Math.max(Number(process.env.LEGAL_INDEX_DB_DOWNLOAD_RETRY_BASE_MS || 10000), 1000);
const GZIP = process.env.LEGAL_INDEX_DB_GZIP
  ? String(process.env.LEGAL_INDEX_DB_GZIP).toLowerCase() === "true"
  : /\.gz($|\?)/i.test(SOURCE_URL);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function verifyFile(filePath) {
  if (!EXPECTED_SHA256) return;
  const actual = await sha256File(filePath);
  if (actual !== EXPECTED_SHA256) {
    throw new Error(`Legal index checksum mismatch for ${filePath}: expected ${EXPECTED_SHA256}, got ${actual}`);
  }
}

function authHeaders() {
  if (AUTH_HEADER) return { Authorization: AUTH_HEADER };
  if (BEARER_TOKEN) return { Authorization: `Bearer ${BEARER_TOKEN}` };
  return {};
}

function sourceLocalPath() {
  if (!SOURCE_URL) return "";
  if (SOURCE_URL.startsWith("file://")) return fileURLToPath(SOURCE_URL);
  if (!/^[a-z][a-z0-9+.-]*:/i.test(SOURCE_URL)) return path.resolve(SOURCE_URL);
  return "";
}

async function downloadOnce() {
  if (!SOURCE_URL) {
    if (REQUIRED) throw new Error("LEGAL_INDEX_REQUIRED=true but LEGAL_INDEX_DB_URL is not set.");
    console.log("Local legal index prepare skipped: no LEGAL_INDEX_DB_URL set.");
    return false;
  }

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const partialPath = `${DB_PATH}.partial`;
  const downloadPath = `${DB_PATH}.download`;
  fs.rmSync(partialPath, { force: true });
  fs.rmSync(downloadPath, { force: true });

  console.log(`Preparing local legal index at ${DB_PATH}`);
  const localPath = sourceLocalPath();
  let body;
  let totalBytes = 0;
  if (localPath) {
    if (!fs.existsSync(localPath)) throw new Error(`Legal index source file not found: ${localPath}`);
    totalBytes = fs.statSync(localPath).size;
    body = fs.createReadStream(localPath);
  } else {
    const response = await fetch(SOURCE_URL, { headers: authHeaders() });
    if (!response.ok) {
      throw new Error(`Legal index download failed (${response.status}): ${await response.text().catch(() => "")}`);
    }
    if (!response.body) throw new Error("Legal index download returned an empty response body.");
    body = Readable.fromWeb(response.body);
    totalBytes = Number(response.headers.get("content-length") || 0);
  }
  let downloaded = 0;
  let lastLogged = Date.now();

  body.on("data", chunk => {
    downloaded += chunk.length;
    const now = Date.now();
    if (now - lastLogged > 15000) {
      const mb = Math.round(downloaded / 1024 / 1024);
      const suffix = totalBytes ? `/${Math.round(totalBytes / 1024 / 1024)} MB` : " MB";
      console.log(`Legal index download progress: ${mb}${suffix}`);
      lastLogged = now;
    }
  });

  if (GZIP) {
    await pipeline(body, zlib.createGunzip(), fs.createWriteStream(partialPath));
  } else {
    await pipeline(body, fs.createWriteStream(downloadPath));
    fs.renameSync(downloadPath, partialPath);
  }

  await verifyFile(partialPath);
  fs.renameSync(partialPath, DB_PATH);
  console.log(`Local legal index ready: ${DB_PATH}`);
  return true;
}

if (fs.existsSync(DB_PATH) && !FORCE) {
  await verifyFile(DB_PATH);
  console.log(`Local legal index already exists: ${DB_PATH}`);
} else {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      await downloadOnce();
      break;
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;
      const waitMs = RETRY_BASE_MS * Math.min(attempt + 1, 6);
      console.log(`Legal index prepare retry ${attempt + 1}/${MAX_RETRIES}: ${error.message}. waiting ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }
}
