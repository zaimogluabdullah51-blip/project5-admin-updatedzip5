import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { all, get, run, init, createCase, updateCase, createPerson, linkPerson, createAction, createOfficial, linkOfficial, upsertEylemSummary, getEylemSummaries } from "./db.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));

const AUTH_COOKIE = "cc_admin";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin135";
const AUTH_SECRET = process.env.AUTH_SECRET || "change-this-secret";
const HF_DATASET = "hamzabagirsakci/turkish-court-decisions";
const HF_CONFIG = process.env.HF_DATASET_CONFIG || "all";
const HF_SPLIT = process.env.HF_DATASET_SPLIT || "train";
const DEEP_SEARCH_PAGE_SIZE = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_PAGE_SIZE, 10) || 25, 1), 100);
const DEEP_SEARCH_MAX_PAGES = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_MAX_PAGES, 10) || 3, 1), 20);
const DEEP_SEARCH_MAX_RETRIES = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_MAX_RETRIES, 10) || 8, 1), 50);
const DEEP_SEARCH_RETRY_SECONDS = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_RETRY_SECONDS, 10) || 300, 30), 3600);
const DEEP_SEARCH_WORKER_ENABLED = process.env.DEEP_SEARCH_WORKER_ENABLED !== "false";
let deepSearchWorkerRunning = false;

function parseCookies(header) {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function signToken(value) {
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(value)
    .digest("hex");
  return `${value}.${signature}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [value, signature] = token.split(".");
  if (!value || !signature) return false;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(value)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function isAuthed(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return verifyToken(cookies[AUTH_COOKIE]);
}

function requireAuthApi(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function requireAuthPage(req, res, next) {
  const publicAdmin = new Set(["/login.html", "/login.js", "/admin.css"]);
  if (publicAdmin.has(req.path)) return next();
  if (isAuthed(req)) return next();
  res.redirect("/admin/login.html");
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

function normalizeTckCode(value) {
  return String(value || "")
    .trim()
    .replace(/^TCK\s*/i, "")
    .replace(/\/(\d+)\./g, "/$1-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function rootTckCode(value) {
  const normalized = normalizeTckCode(value);
  const match = normalized.match(/^(\d+)/);
  return match ? match[1] : normalized;
}

async function getDefinedTckCodeSet() {
  const rows = await all("SELECT code FROM tck_definitions");
  return new Set(rows.map((row) => normalizeTckCode(row.code)).filter(Boolean));
}

function filterKnownTckCodes(values, definedSet) {
  if (!Array.isArray(values) || !definedSet || definedSet.size === 0) return [];
  const seen = new Set();
  const out = [];
  for (const raw of values) {
    const code = normalizeTckCode(raw);
    if (!code || (!definedSet.has(code) && !definedSet.has(rootTckCode(code))) || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function mapLegalReference(row) {
  return {
    ...row,
    detected_law_refs: parseJsonField(row.detected_law_refs, []),
    detected_tck_codes: parseJsonField(row.detected_tck_codes, [])
  };
}

function likeNeedle(value) {
  return `%${String(value || "").replace(/[%_]/g, "").trim()}%`;
}

function mapDeepSearchJob(row) {
  if (!row) return null;
  return {
    ...row,
    progress_percent: Number(row.progress_percent || 0),
    estimated_seconds: Number(row.estimated_seconds || 0),
    matched_count: Number(row.matched_count || 0),
    retry_count: Number(row.retry_count || 0)
  };
}

function extractTckCodes(text) {
  const codes = new Set();
  const regex = /TCK\s*(\d{2,3})(?:\/([0-9a-zA-Z.-]+))?/gi;
  let match;
  while ((match = regex.exec(String(text || ""))) !== null) {
    const base = match[1];
    const suffix = match[2];
    codes.add(suffix ? `${base}/${suffix}` : base);
  }
  return Array.from(codes);
}

function makeExcerpt(text, query, maxLength = 520) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const q = String(query || "").replace(/^TCK\s*/i, "").trim();
  const lower = clean.toLowerCase();
  const idx = q ? lower.indexOf(q.toLowerCase()) : -1;
  const start = Math.max(0, (idx >= 0 ? idx : 0) - 120);
  const excerpt = clean.slice(start, start + maxLength);
  return `${start > 0 ? "..." : ""}${excerpt}${start + maxLength < clean.length ? "..." : ""}`;
}

async function getTckTitleForSearch(tckCode) {
  const normalized = normalizeTckCode(tckCode);
  if (!normalized) return "";
  const exact = await get("SELECT short_desc FROM tck_definitions WHERE code = ?", [normalized]);
  if (exact?.short_desc) return exact.short_desc;
  const root = rootTckCode(normalized);
  const rootRow = await get("SELECT short_desc FROM tck_definitions WHERE code = ?", [root]);
  return rootRow?.short_desc || "";
}

function buildDeepSearchQueries(query, tckCode, tckTitle) {
  const normalized = normalizeTckCode(tckCode);
  const root = rootTckCode(normalized);
  const title = String(tckTitle || "").trim();
  return Array.from(new Set([
    query,
    normalized ? `TCK ${normalized}` : "",
    root && root !== normalized ? `TCK ${root}` : "",
    root ? `TCK'nın ${root}. maddesi` : "",
    root ? `TCK ${root}. madde` : "",
    root ? `Türk Ceza Kanunu'nun ${root}. maddesi` : "",
    root ? `5237 sayılı Türk Ceza Kanunu ${root}. madde` : "",
    root ? `5237 sayılı Kanun ${root}. madde` : "",
    title ? `${title}` : "",
    root && title ? `${root}. madde ${title}` : "",
    root && title ? `TCK ${root} ${title}` : ""
  ].map((item) => String(item || "").trim()).filter(Boolean)));
}

async function hfErrorText(response) {
  try {
    const payload = await response.clone().json();
    return payload?.error || JSON.stringify(payload);
  } catch {
    try {
      return await response.clone().text();
    } catch {
      return "";
    }
  }
}

function isTransientHfError(status, detail) {
  const text = String(detail || "").toLowerCase();
  return status >= 500 || text.includes("loading") || text.includes("rebuilt") || text.includes("corrupted");
}

class TransientDeepSearchError extends Error {
  constructor(message) {
    super(message);
    this.name = "TransientDeepSearchError";
    this.isTransient = true;
  }
}

async function upsertLegalReferenceFromHfRow(rowWrapper, query, tckCode) {
  const row = rowWrapper?.row || {};
  const text = row.text || "";
  const hfId = row.id || `${row.source || "hf"}:${row.document_id || rowWrapper?.row_idx || crypto.randomUUID()}`;
  const detectedCodes = Array.from(new Set([
    ...extractTckCodes(text),
    ...(tckCode ? [tckCode] : [])
  ].map(normalizeTckCode).filter(Boolean)));
  const lawRefs = detectedCodes.map((code) => `TCK ${code}`);
  const now = new Date().toISOString();

  await run(
    `INSERT INTO legal_references
      (id, hf_id, source, document_id, court, esas_no, karar_no, karar_tarihi, year, month, text_len, masked_count, raw_sha256, detected_law_refs, detected_tck_codes, short_preview, indexed_level, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(hf_id) DO UPDATE SET
      source = excluded.source,
      document_id = excluded.document_id,
      court = excluded.court,
      esas_no = excluded.esas_no,
      karar_no = excluded.karar_no,
      karar_tarihi = excluded.karar_tarihi,
      year = excluded.year,
      month = excluded.month,
      text_len = excluded.text_len,
      masked_count = excluded.masked_count,
      raw_sha256 = excluded.raw_sha256,
      detected_law_refs = excluded.detected_law_refs,
      detected_tck_codes = excluded.detected_tck_codes,
      short_preview = excluded.short_preview,
      indexed_level = excluded.indexed_level`,
    [
      crypto.randomUUID(),
      hfId,
      row.source || "",
      row.document_id || "",
      row.court || "",
      row.esas_no || "",
      row.karar_no || "",
      row.karar_tarihi || "",
      Number(row.year || 0),
      Number(row.month || 0),
      Number(row.text_len || String(text).length || 0),
      Number(row.masked_count || 0),
      row.raw_sha256 || "",
      JSON.stringify(lawRefs),
      JSON.stringify(detectedCodes),
      makeExcerpt(text, query || tckCode),
      "deep_search",
      now
    ]
  );

  return await get("SELECT id FROM legal_references WHERE hf_id = ?", [hfId]);
}

async function processDeepSearchJob(job) {
  const query = job.query || (job.tck_code ? `TCK ${job.tck_code}` : "");
  const tckCode = normalizeTckCode(job.tck_code || "");
  const rootCode = rootTckCode(tckCode);
  const tckTitle = await getTckTitleForSearch(tckCode);
  const queryCandidates = buildDeepSearchQueries(query, tckCode, tckTitle);
  let activeQuery = query;
  const startedAt = new Date().toISOString();
  await run(
    "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, status_message = ?, started_at = ?, last_attempt_at = ?, error = ? WHERE id = ?",
    ["running", 2, "Hugging Face arama indeksi sorgulanıyor.", startedAt, startedAt, "", job.id]
  );

  let matchedCount = 0;
  let totalRows = null;
  let totalPages = DEEP_SEARCH_MAX_PAGES;

  for (let page = 0; page < totalPages; page += 1) {
    const offset = page * DEEP_SEARCH_PAGE_SIZE;
    let response = await fetchHfSearchPage(activeQuery, offset, DEEP_SEARCH_PAGE_SIZE);
    let lastErrorDetail = "";
    if (!response.ok) lastErrorDetail = await hfErrorText(response);

    if (!response.ok && page === 0) {
      let fallbackWorked = false;
      for (const candidate of queryCandidates) {
        if (candidate === activeQuery) continue;
        activeQuery = candidate;
        const fallbackMessage = tckTitle
          ? `İlk sorgu yanıt vermedi. Alternatif sorgu deneniyor: ${activeQuery}`
          : `İlk sorgu yanıt vermedi. Kök madde ile deneniyor: ${activeQuery}`;
        await run(
          "UPDATE deep_search_jobs SET progress_percent = ?, status_message = ? WHERE id = ?",
          [5, fallbackMessage, job.id]
        );
        response = await fetchHfSearchPage(activeQuery, offset, DEEP_SEARCH_PAGE_SIZE);
        if (response.ok) {
          fallbackWorked = true;
          break;
        }
        lastErrorDetail = await hfErrorText(response);
      }
      if (!fallbackWorked && rootCode && activeQuery !== `TCK ${rootCode}`) {
        activeQuery = `TCK ${rootCode}`;
      }
    }

    if (!response.ok && isTransientHfError(response.status, lastErrorDetail)) {
      await run(
        "UPDATE deep_search_jobs SET progress_percent = ?, estimated_seconds = ?, status_message = ? WHERE id = ?",
        [
          8,
          600,
          "Hugging Face arama indeksi şu an hazırlanıyor veya geçici hata veriyor. Birkaç dakika sonra yeniden deneyebilirsiniz.",
          job.id
        ]
      );
    }
    if (!response.ok) {
      const message = `Hugging Face arama servisi yanıt vermedi (${response.status}${lastErrorDetail ? `: ${lastErrorDetail}` : ""}).`;
      if (isTransientHfError(response.status, lastErrorDetail)) {
        throw new TransientDeepSearchError(message);
      }
      throw new Error(message);
    }
    const payload = await response.json();
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    if (totalRows === null) {
      totalRows = Number(payload.num_rows_total || rows.length || 0);
      totalPages = Math.min(DEEP_SEARCH_MAX_PAGES, Math.max(1, Math.ceil(totalRows / DEEP_SEARCH_PAGE_SIZE)));
    }

    for (const resultRow of rows) {
      const ref = await upsertLegalReferenceFromHfRow(resultRow, activeQuery, tckCode);
      if (!ref?.id) continue;
      matchedCount += 1;
      await run(
        `INSERT INTO deep_search_matches
          (id, job_id, legal_reference_id, matched_terms, score, excerpt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          job.id,
          ref.id,
          JSON.stringify([activeQuery, query, tckCode].filter(Boolean)),
          0,
          makeExcerpt(resultRow?.row?.text || "", activeQuery || tckCode, 360)
        ]
      );
    }

    const progress = Math.min(95, Math.round(((page + 1) / totalPages) * 90) + 5);
    const remainingPages = Math.max(0, totalPages - page - 1);
    await run(
      "UPDATE deep_search_jobs SET progress_percent = ?, estimated_seconds = ?, matched_count = ?, status_message = ? WHERE id = ?",
      [
        progress,
        remainingPages * 8,
        matchedCount,
        `${page + 1}/${totalPages} sayfa tarandı (${activeQuery}). Hugging Face toplam ${totalRows || 0} olası eşleşme bildirdi.`,
        job.id
      ]
    );

    if (!rows.length) break;
  }

  await run(
    "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, matched_count = ?, finished_at = ?, status_message = ? WHERE id = ?",
    [
      "completed",
      100,
      0,
      matchedCount,
      new Date().toISOString(),
      `${matchedCount} karar indekse eklendi. İlk aşamada ${DEEP_SEARCH_MAX_PAGES} sayfa sınırı uygulanır.`,
      job.id
    ]
  );
}

function fetchHfSearchPage(query, offset, length) {
  const url = new URL("https://datasets-server.huggingface.co/search");
  url.searchParams.set("dataset", HF_DATASET);
  url.searchParams.set("config", HF_CONFIG);
  url.searchParams.set("split", HF_SPLIT);
  url.searchParams.set("query", query);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("length", String(length));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  return fetch(url, { signal: controller.signal })
    .catch((err) => {
      if (err?.name === "AbortError") {
        throw new TransientDeepSearchError("Hugging Face arama servisi zaman aşımına uğradı. Dış indeks hazırlanıyor olabilir.");
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

async function runDeepSearchWorkerOnce() {
  if (!DEEP_SEARCH_WORKER_ENABLED || deepSearchWorkerRunning) return;
  deepSearchWorkerRunning = true;
  try {
    const queuedJobs = await all(
      "SELECT * FROM deep_search_jobs WHERE status = ? ORDER BY started_at ASC LIMIT 10",
      ["queued"]
    );
    const nowMs = Date.now();
    const job = queuedJobs.find((candidate) => {
      const retryCount = Number(candidate.retry_count || 0);
      if (retryCount >= DEEP_SEARCH_MAX_RETRIES) return true;
      const lastAttempt = candidate.last_attempt_at ? Date.parse(candidate.last_attempt_at) : 0;
      return !lastAttempt || nowMs - lastAttempt >= DEEP_SEARCH_RETRY_SECONDS * 1000;
    });
    if (job) {
      await processDeepSearchJob(job);
    }
  } catch (err) {
    console.error("Deep search worker error:", err);
    const running = await get("SELECT * FROM deep_search_jobs WHERE status = ? ORDER BY started_at DESC LIMIT 1", ["running"]);
    if (running) {
      const matchedCount = Number(running.matched_count || 0);
      if (matchedCount > 0) {
        await run(
          "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, status_message = ?, error = ?, finished_at = ? WHERE id = ?",
          [
            "completed",
            100,
            0,
            `${matchedCount} karar indekse eklendi. Hugging Face sonraki sayfada yanıt vermedi; kayıtlı sonuçlar kullanılabilir.`,
            err.message || String(err),
            new Date().toISOString(),
            running.id
          ]
        );
      } else {
        const retryCount = Number(running.retry_count || 0) + 1;
        const canRetry = err.isTransient && retryCount < DEEP_SEARCH_MAX_RETRIES;
        if (canRetry) {
          await run(
            "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, retry_count = ?, status_message = ?, error = ? WHERE id = ?",
            [
              "queued",
              Math.max(Number(running.progress_percent || 0), 8),
              DEEP_SEARCH_RETRY_SECONDS,
              retryCount,
              "Hugging Face arama indeksi şu an yanıt vermiyor. İş kuyrukta tutuldu; otomatik olarak tekrar denenecek.",
              err.message || String(err),
              running.id
            ]
          );
        } else {
          const message = err.message && err.message.includes("Hugging Face")
            ? err.message
            : "Derin arama hata verdi.";
          await run(
            "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, retry_count = ?, status_message = ?, error = ?, finished_at = ? WHERE id = ?",
            [
              "failed",
              Math.max(Number(running.progress_percent || 0), 8),
              0,
              retryCount,
              message,
              err.message || String(err),
              new Date().toISOString(),
              running.id
            ]
          );
        }
      }
    }
  } finally {
    deepSearchWorkerRunning = false;
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signToken("admin");
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
  );
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  res.json({ authed: isAuthed(req) });
});

app.get("/api/cases", async (req, res) => {
  try {
    const definedTckCodes = await getDefinedTckCodeSet();
    const rows = await all(
      `SELECT c.*,
              SUM(CASE WHEN p.is_external IS NULL OR p.is_external = 0 THEN 1 ELSE 0 END) as defendantCount
       FROM cases c
       LEFT JOIN case_people cp ON cp.case_id = c.id
       LEFT JOIN people p ON p.id = cp.person_id
       GROUP BY c.id
       ORDER BY date DESC, title ASC`
    );
    const mapped = rows.map((row) => ({
      ...row,
      tck_articles: filterKnownTckCodes(parseJsonField(row.tck_articles, []), definedTckCodes),
      timeline_data: parseJsonField(row.timeline_data, { enabled: false, transitionYear: 2016, events: [] }),
      hearing_count: row.hearing_count || 0
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Failed to load cases." });
  }
});

app.get("/api/cases/:id", async (req, res) => {
  try {
    const definedTckCodes = await getDefinedTckCodeSet();
    const caseRow = await get("SELECT * FROM cases WHERE id = ?", [req.params.id]);
    if (!caseRow) return res.status(404).json({ error: "Case not found." });

    const people = await all(
      `SELECT p.*, cp.relationship
       FROM case_people cp
       JOIN people p ON p.id = cp.person_id
       WHERE cp.case_id = ?
       ORDER BY p.name ASC`,
      [req.params.id]
    );

    const mappedPeople = people.map((person) => ({
      ...person,
      tck_articles: filterKnownTckCodes(parseJsonField(person.tck_articles, []), definedTckCodes),
      accusations: parseJsonField(person.accusations, []).map((acc) => ({
        ...acc,
        tckCodes: filterKnownTckCodes(acc?.tckCodes, definedTckCodes)
      })),
      evidence_items: parseJsonField(person.evidence_items, []),
      defense: parseJsonField(person.defense, []),
      related_profiles: parseJsonField(person.related_profiles, []),
      hierarchy: parseJsonField(person.hierarchy, {}),
      action_numbers: parseJsonField(person.action_numbers, []),
      is_external: !!person.is_external
    }));

    const actions = await all(
      "SELECT * FROM actions WHERE case_id = ? ORDER BY action_num ASC",
      [req.params.id]
    );
    const mappedActions = actions.map((a) => ({
      ...a,
      tck_codes: filterKnownTckCodes(parseJsonField(a.tck_codes, []), definedTckCodes),
      mentioned_names: parseJsonField(a.mentioned_names, [])
    }));

    res.json({
      ...caseRow,
      tck_articles: filterKnownTckCodes(parseJsonField(caseRow.tck_articles, []), definedTckCodes),
      timeline_data: parseJsonField(caseRow.timeline_data, { enabled: false, transitionYear: 2016, events: [] }),
      hearing_count: caseRow.hearing_count || 0,
      people: mappedPeople,
      actions: mappedActions
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load case." });
  }
});

app.get("/api/people", async (req, res) => {
  try {
    const definedTckCodes = await getDefinedTckCodeSet();
    const rows = await all("SELECT * FROM people ORDER BY name ASC");
    const mapped = rows.map((person) => ({
      ...person,
      tck_articles: filterKnownTckCodes(parseJsonField(person.tck_articles, []), definedTckCodes),
      accusations: parseJsonField(person.accusations, []).map((acc) => ({
        ...acc,
        tckCodes: filterKnownTckCodes(acc?.tckCodes, definedTckCodes)
      })),
      evidence_items: parseJsonField(person.evidence_items, []),
      defense: parseJsonField(person.defense, []),
      related_profiles: parseJsonField(person.related_profiles, []),
      hierarchy: parseJsonField(person.hierarchy, {}),
      action_numbers: parseJsonField(person.action_numbers, []),
      is_external: !!person.is_external
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Failed to load people." });
  }
});

app.post("/api/people/find-or-create", requireAuthApi, async (req, res) => {
  try {
    const definedTckCodes = await getDefinedTckCodeSet();
    const { name, role, caseId } = req.body;
    if (!name) return res.status(400).json({ error: "İsim gerekli." });
    const existing = await get("SELECT * FROM people WHERE LOWER(name) = LOWER(?)", [name.trim()]);
    if (existing) {
      if (caseId) {
        await run("INSERT OR REPLACE INTO case_people (case_id, person_id, relationship) VALUES (?, ?, '')", [caseId, existing.id]);
      }
      res.json({
        ...existing,
        tck_articles: filterKnownTckCodes(parseJsonField(existing.tck_articles, []), definedTckCodes),
        action_numbers: parseJsonField(existing.action_numbers, []),
        created: false
      });
    } else {
      const person = await createPerson({ name: name.trim(), role: role || "unknown" });
      if (caseId) {
        await linkPerson(caseId, person.id);
      }
      res.status(201).json({ ...person, created: true });
    }
  } catch (err) {
    res.status(500).json({ error: "Kişi oluşturulamadı." });
  }
});

app.post("/api/cases", requireAuthApi, async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: "Title is required." });
    const record = await createCase(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Failed to create case." });
  }
});

app.put("/api/cases/:id", requireAuthApi, async (req, res) => {
  try {
    const updated = await updateCase(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Case not found." });
    res.json({
      ...updated,
      tck_articles: parseJsonField(updated.tck_articles, []),
      timeline_data: parseJsonField(updated.timeline_data, { enabled: false, transitionYear: 2016, events: [] })
    });
  } catch (err) {
    res.status(500).json({ error: "Dava güncellenemedi." });
  }
});

app.post("/api/people", requireAuthApi, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: "Name is required." });
    const definedTckCodes = await getDefinedTckCodeSet();
    const payload = {
      ...req.body,
      tck_articles: filterKnownTckCodes(req.body.tck_articles, definedTckCodes)
    };
    const record = await createPerson(payload);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Failed to create person." });
  }
});

app.put("/api/people/:id", requireAuthApi, async (req, res) => {
  try {
    const existing = await get("SELECT * FROM people WHERE id = ?", [req.params.id]);
    if (!existing) return res.status(404).json({ error: "Person not found." });

    const b = req.body;
    const definedTckCodes = await getDefinedTckCodeSet();
    const sanitizedTckArticles = b.tck_articles !== undefined
      ? filterKnownTckCodes(b.tck_articles, definedTckCodes)
      : parseJsonField(existing.tck_articles, []);
    const sanitizedAccusations = b.accusations !== undefined
      ? (Array.isArray(b.accusations) ? b.accusations : []).map((acc) => ({
          ...acc,
          tckCodes: filterKnownTckCodes(acc?.tckCodes, definedTckCodes)
        }))
      : parseJsonField(existing.accusations, []);

    await run(
      `UPDATE people SET
        name = ?, role = ?, charge = ?, claim = ?, evidence = ?, photo_url = ?,
        tck_articles = ?, accusations = ?, evidence_items = ?, defense = ?,
        related_profiles = ?, hierarchy = ?, is_external = ?,
        organization = ?, title = ?, sentence_demand = ?, action_numbers = ?
       WHERE id = ?`,
      [
        b.name ?? existing.name,
        b.role ?? existing.role,
        b.charge ?? existing.charge,
        b.claim ?? existing.claim,
        b.evidence ?? existing.evidence,
        b.photo_url ?? existing.photo_url,
        JSON.stringify(sanitizedTckArticles),
        JSON.stringify(sanitizedAccusations),
        JSON.stringify(b.evidence_items ?? parseJsonField(existing.evidence_items, [])),
        JSON.stringify(b.defense ?? parseJsonField(existing.defense, [])),
        JSON.stringify(b.related_profiles ?? parseJsonField(existing.related_profiles, [])),
        JSON.stringify(b.hierarchy ?? parseJsonField(existing.hierarchy, {})),
        b.is_external ?? existing.is_external,
        b.organization ?? existing.organization,
        b.title ?? existing.title,
        b.sentence_demand ?? existing.sentence_demand,
        JSON.stringify(b.action_numbers ?? parseJsonField(existing.action_numbers, [])),
        req.params.id
      ]
    );

    const updated = await get("SELECT * FROM people WHERE id = ?", [req.params.id]);
    res.json({
      ...updated,
      tck_articles: filterKnownTckCodes(parseJsonField(updated.tck_articles, []), definedTckCodes),
      action_numbers: parseJsonField(updated.action_numbers, []),
      accusations: parseJsonField(updated.accusations, []).map((acc) => ({
        ...acc,
        tckCodes: filterKnownTckCodes(acc?.tckCodes, definedTckCodes)
      })),
      evidence_items: parseJsonField(updated.evidence_items, []),
      defense: parseJsonField(updated.defense, []),
      related_profiles: parseJsonField(updated.related_profiles, []),
      hierarchy: parseJsonField(updated.hierarchy, {})
    });
  } catch (err) {
    res.status(500).json({ error: "Profil güncellenemedi." });
  }
});

app.post("/api/case-people", requireAuthApi, async (req, res) => {
  try {
    const { caseId, personId, relationship } = req.body;
    if (!caseId || !personId) {
      return res.status(400).json({ error: "caseId and personId are required." });
    }
    await linkPerson(caseId, personId, relationship || "");
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to link person." });
  }
});

app.post("/api/actions", requireAuthApi, async (req, res) => {
  try {
    const definedTckCodes = await getDefinedTckCodeSet();
    const payload = {
      ...req.body,
      tckCodes: filterKnownTckCodes(req.body.tckCodes, definedTckCodes)
    };
    const record = await createAction(payload);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Eylem kaydedilemedi." });
  }
});

app.delete("/api/actions", requireAuthApi, async (req, res) => {
  try {
    const { caseId, personId } = req.query;
    if (caseId && personId) {
      await run("DELETE FROM actions WHERE case_id = ? AND person_id = ?", [caseId, personId]);
    } else if (personId) {
      await run("DELETE FROM actions WHERE person_id = ?", [personId]);
    } else {
      return res.status(400).json({ error: "personId gerekli." });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Eylemler silinemedi." });
  }
});

app.delete("/api/actions/by-eylem", requireAuthApi, async (req, res) => {
  try {
    const { caseId, actionNum } = req.query;
    if (!caseId || !actionNum) {
      return res.status(400).json({ error: "caseId ve actionNum gerekli." });
    }
    await run("DELETE FROM actions WHERE case_id = ? AND action_num = ?", [caseId, actionNum]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Eylem kayıtları silinemedi." });
  }
});

app.get("/api/actions", async (req, res) => {
  try {
    const definedTckCodes = await getDefinedTckCodeSet();
    let rows;
    if (req.query.caseId && req.query.personId) {
      rows = await all(
        "SELECT * FROM actions WHERE case_id = ? AND person_id = ? ORDER BY action_num ASC",
        [req.query.caseId, req.query.personId]
      );
    } else if (req.query.caseId) {
      rows = await all(
        "SELECT * FROM actions WHERE case_id = ? ORDER BY action_num ASC",
        [req.query.caseId]
      );
    } else if (req.query.personId) {
      rows = await all(
        "SELECT * FROM actions WHERE person_id = ? ORDER BY action_num ASC",
        [req.query.personId]
      );
    } else {
      rows = await all("SELECT * FROM actions ORDER BY action_num ASC");
    }
    const mapped = rows.map((r) => ({
      ...r,
      tck_codes: filterKnownTckCodes(parseJsonField(r.tck_codes, []), definedTckCodes),
      mentioned_names: parseJsonField(r.mentioned_names, [])
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Eylemler yüklenemedi." });
  }
});

app.get("/api/eylem-summaries", async (req, res) => {
  try {
    const { caseId } = req.query;
    if (!caseId) return res.status(400).json({ error: "caseId gerekli." });
    const rows = await getEylemSummaries(caseId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Eylem özetleri yüklenemedi." });
  }
});

app.post("/api/eylem-summaries", requireAuthApi, async (req, res) => {
  try {
    const { caseId, eylemNum, summary } = req.body;
    if (!caseId || !eylemNum) return res.status(400).json({ error: "caseId ve eylemNum gerekli." });
    const record = await upsertEylemSummary(caseId, eylemNum, summary || "");
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Eylem özeti kaydedilemedi." });
  }
});

app.post("/api/eylem-summaries/bulk", requireAuthApi, async (req, res) => {
  try {
    const { caseId, summaries } = req.body;
    if (!caseId || !Array.isArray(summaries)) return res.status(400).json({ error: "caseId ve summaries dizisi gerekli." });
    const results = [];
    for (const s of summaries) {
      const record = await upsertEylemSummary(caseId, s.eylemNum, s.summary || "");
      results.push(record);
    }
    res.status(201).json(results);
  } catch (err) {
    res.status(500).json({ error: "Eylem özetleri kaydedilemedi." });
  }
});

app.delete("/api/eylem/:caseId/:eylemNum", requireAuthApi, async (req, res) => {
  try {
    const { caseId, eylemNum } = req.params;
    if (!caseId || !eylemNum) return res.status(400).json({ error: "caseId ve eylemNum gerekli." });
    await run("DELETE FROM eylem_summaries WHERE case_id = ? AND eylem_num = ?", [caseId, eylemNum]);
    await run("DELETE FROM actions WHERE case_id = ? AND action_num = ?", [caseId, eylemNum]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Eylem silinemedi." });
  }
});

app.get("/api/graph", async (req, res) => {
  try {
    const scope = req.query.scope || "all";
    const caseId = req.query.caseId || "";
    const incident = req.query.incident || "";
    const dossier = req.query.dossier || "";

    const people = await all("SELECT * FROM people ORDER BY name ASC");
    const casePeople = await all(
      `SELECT cp.person_id, cp.case_id, c.incident, c.dossier
       FROM case_people cp
       JOIN cases c ON c.id = cp.case_id`
    );

    const peopleById = new Map(people.map((p) => [p.id, p]));

    const groups = {
      case: new Map(),
      incident: new Map(),
      dossier: new Map()
    };

    for (const row of casePeople) {
      if (!groups.case.has(row.case_id)) groups.case.set(row.case_id, new Set());
      groups.case.get(row.case_id).add(row.person_id);

      if (row.incident) {
        if (!groups.incident.has(row.incident)) groups.incident.set(row.incident, new Set());
        groups.incident.get(row.incident).add(row.person_id);
      }

      if (row.dossier) {
        if (!groups.dossier.has(row.dossier)) groups.dossier.set(row.dossier, new Set());
        groups.dossier.get(row.dossier).add(row.person_id);
      }
    }

    const nodes = people.map((p) => ({
      id: p.id,
      label: p.name,
      title: p.role || "",
      group: p.role || "Unassigned",
      image: p.photo_url || ""
    }));

    const edges = [];
    const edgeSet = new Set();

    function addEdge(a, b, label) {
      const key = [a, b, label].sort().join("|");
      if (edgeSet.has(key) || a === b) return;
      edgeSet.add(key);
      edges.push({ from: a, to: b, label });
    }

    function connectGroup(set, label) {
      const ids = Array.from(set);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          addEdge(ids[i], ids[j], label);
        }
      }
    }

    if (scope === "case" && caseId && groups.case.has(caseId)) {
      connectGroup(groups.case.get(caseId), "Same case");
    } else if (scope === "incident" && incident && groups.incident.has(incident)) {
      connectGroup(groups.incident.get(incident), "Same incident");
    } else if (scope === "dossier" && dossier && groups.dossier.has(dossier)) {
      connectGroup(groups.dossier.get(dossier), "Same dossier");
    } else {
      for (const set of groups.case.values()) connectGroup(set, "Same case");
      for (const set of groups.incident.values()) connectGroup(set, "Same incident");
      for (const set of groups.dossier.values()) connectGroup(set, "Same dossier");
    }

    const filteredNodes =
      edges.length === 0
        ? nodes
        : nodes.filter((node) => {
            return edges.some((edge) => edge.from === node.id || edge.to === node.id);
          });

    res.json({ nodes: filteredNodes, edges });
  } catch (err) {
    res.status(500).json({ error: "Failed to build graph." });
  }
});

app.get("/api/tck-summary", async (req, res) => {
  try {
    const definitions = await all("SELECT code FROM tck_definitions ORDER BY code ASC");
    const actions = await all("SELECT * FROM actions ORDER BY action_num ASC");
    const people = await all("SELECT * FROM people ORDER BY name ASC");
    const casePeople = await all("SELECT * FROM case_people");
    const cases = await all("SELECT id, title FROM cases");

    const caseMap = new Map(cases.map(c => [c.id, c.title]));
    const personMap = new Map(people.map(p => [p.id, p]));

    const personCases = new Map();
    for (const cp of casePeople) {
      if (!personCases.has(cp.person_id)) personCases.set(cp.person_id, new Set());
      personCases.get(cp.person_id).add(cp.case_id);
    }

    const tckData = new Map();
    for (const row of definitions) {
      const code = normalizeTckCode(row.code);
      if (!code) continue;
      tckData.set(code, { article: code, profiles: [] });
    }

    for (const action of actions) {
      const codes = parseJsonField(action.tck_codes, []);
      for (const code of codes) {
        const normalized = normalizeTckCode(code);
        if (!normalized) continue;
        const root = rootTckCode(normalized);
        if (!tckData.has(normalized)) {
          if (!tckData.has(root)) continue;
          tckData.set(normalized, { article: normalized, profiles: [] });
        }
        const person = personMap.get(action.person_id);
        if (!person) continue;

        const caseIds = personCases.get(action.person_id);
        const actionCaseTitle = caseMap.get(action.case_id) || (caseIds ? caseMap.get([...caseIds][0]) || "" : "");
        const actionCaseId = action.case_id || (caseIds ? [...caseIds][0] || "" : "");

        tckData.get(normalized).profiles.push({
          personId: person.id,
          name: person.name,
          role: person.role,
          organization: person.organization,
          actionNum: action.action_num,
          actionTitle: action.title,
          claim: action.claim,
          evidence: action.evidence,
          defense: action.defense,
          sentenceDemand: action.sentence_demand || person.sentence_demand,
          caseId: actionCaseId,
          caseTitle: actionCaseTitle
        });
      }
    }

    for (const person of people) {
      const articles = parseJsonField(person.tck_articles, []);
      for (const code of articles) {
        const normalized = normalizeTckCode(code);
        if (!normalized) continue;
        const root = rootTckCode(normalized);
        if (!tckData.has(normalized)) {
          if (!tckData.has(root)) continue;
          tckData.set(normalized, { article: normalized, profiles: [] });
        }
        const existing = tckData.get(normalized).profiles;
        if (existing.some(p => p.personId === person.id)) continue;

        const caseIds = personCases.get(person.id);
        const caseTitle = caseIds ? caseMap.get([...caseIds][0]) || "" : "";
        const caseId = caseIds ? [...caseIds][0] || "" : "";

        existing.push({
          personId: person.id,
          name: person.name,
          role: person.role,
          organization: person.organization,
          actionNum: null,
          actionTitle: null,
          claim: person.charge,
          evidence: person.evidence,
          defense: null,
          sentenceDemand: person.sentence_demand,
          caseId,
          caseTitle
        });
      }
    }

    const result = Array.from(tckData.values()).sort((a, b) => {
      const na = parseInt(a.article) || 0;
      const nb = parseInt(b.article) || 0;
      return na - nb || a.article.localeCompare(b.article);
    });

    res.json(result);
  } catch (err) {
    console.error("TCK summary error:", err);
    res.status(500).json({ error: "TCK verileri yüklenemedi." });
  }
});

app.get("/api/tck-definitions", async (req, res) => {
  try {
    const rows = await all("SELECT code, short_desc, full_text, source_url, category, status FROM tck_definitions ORDER BY code ASC");
    res.json(rows);
  } catch (err) {
    console.error("TCK definitions error:", err);
    res.status(500).json({ error: "TCK tanımları yüklenemedi." });
  }
});

app.get("/api/tck-article-parts", async (req, res) => {
  try {
    const tckCode = normalizeTckCode(req.query.tck || req.query.tckCode || "");
    const root = rootTckCode(tckCode);
    const params = [];
    let where = "";
    if (tckCode) {
      where = "WHERE article_code = ? OR code = ? OR parent_code = ?";
      params.push(root || tckCode, tckCode, tckCode);
    }
    const rows = await all(
      `SELECT code, article_code, parent_code, level, label, title, text, category, status, source_url, book, part, chapter, order_index
       FROM tck_article_parts
       ${where}
       ORDER BY order_index ASC, code ASC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error("TCK article parts error:", err);
    res.status(500).json({ error: "TCK kırılımları yüklenemedi." });
  }
});

app.put("/api/tck-definitions/:code", requireAuthApi, async (req, res) => {
  try {
    const { code } = req.params;
    const { short_desc, full_text, source_url } = req.body || {};
    const existing = await get("SELECT code, short_desc, full_text, source_url FROM tck_definitions WHERE code = ?", [code]);
    if (existing) {
      await run(
        "UPDATE tck_definitions SET short_desc = ?, full_text = ?, source_url = ? WHERE code = ?",
        [
          short_desc !== undefined ? short_desc : (existing.short_desc || ""),
          full_text !== undefined ? full_text : (existing.full_text || ""),
          source_url !== undefined ? source_url : (existing.source_url || ""),
          code
        ]
      );
    } else {
      await run(
        "INSERT INTO tck_definitions (code, short_desc, full_text, source_url) VALUES (?, ?, ?, ?)",
        [code, short_desc || "", full_text || "", source_url || ""]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("TCK definition update error:", err);
    res.status(500).json({ error: "TCK tanımı güncellenemedi." });
  }
});

app.post("/api/tck-definitions", requireAuthApi, async (req, res) => {
  try {
    const { code, short_desc, full_text, source_url } = req.body || {};
    if (!code) return res.status(400).json({ error: "Madde kodu gerekli." });
    const existing = await get("SELECT code FROM tck_definitions WHERE code = ?", [code]);
    if (existing) {
      return res.status(409).json({ error: "Bu madde zaten mevcut." });
    }
    await run(
      "INSERT INTO tck_definitions (code, short_desc, full_text, source_url) VALUES (?, ?, ?, ?)",
      [code, short_desc || "", full_text || "", source_url || ""]
    );
    res.json({ ok: true, code });
  } catch (err) {
    console.error("TCK definition create error:", err);
    res.status(500).json({ error: "TCK tanımı oluşturulamadı." });
  }
});

app.delete("/api/tck-definitions/:code", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM tck_definitions WHERE code = ?", [req.params.code]);
    res.json({ ok: true });
  } catch (err) {
    console.error("TCK definition delete error:", err);
    res.status(500).json({ error: "TCK tanımı silinemedi." });
  }
});

app.get("/api/legal-references", async (req, res) => {
  try {
    const tckCode = normalizeTckCode(req.query.tck || req.query.tckCode || "");
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 250);
    const params = [];
    const where = [];

    if (tckCode) {
      where.push("(detected_tck_codes LIKE ? OR detected_law_refs LIKE ?)");
      params.push(likeNeedle(tckCode), likeNeedle(`TCK ${tckCode}`));
    }

    if (query) {
      where.push("(court LIKE ? OR esas_no LIKE ? OR karar_no LIKE ? OR short_preview LIKE ? OR detected_law_refs LIKE ?)");
      const q = likeNeedle(query);
      params.push(q, q, q, q, q);
    }

    const sql = `
      SELECT *
      FROM legal_references
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY karar_tarihi DESC, year DESC
      LIMIT ?
    `;
    const rows = await all(sql, [...params, limit]);
    res.json(rows.map(mapLegalReference));
  } catch (err) {
    console.error("Legal references error:", err);
    res.status(500).json({ error: "İçtihat kayıtları yüklenemedi." });
  }
});

app.post("/api/deep-search-jobs", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    const tckCode = normalizeTckCode(req.body?.tckCode || "");
    if (!query && !tckCode) {
      return res.status(400).json({ error: "Arama sorgusu veya TCK kodu gerekli." });
    }
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const statusMessage = "Kuyruğa alındı. Önce TCK atıf formatları, sonra madde başlığı ile aranacak.";
    const estimatedSeconds = 1800;
    await run(
      `INSERT INTO deep_search_jobs
        (id, query, tck_code, status, progress_percent, estimated_seconds, status_message, matched_count, started_at, finished_at, error, retry_count, last_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        query || (tckCode ? `TCK ${tckCode}` : ""),
        tckCode,
        "queued",
        0,
        estimatedSeconds,
        statusMessage,
        0,
        startedAt,
        "",
        "",
        0,
        ""
      ]
    );
    res.status(202).json({
      id,
      query: query || (tckCode ? `TCK ${tckCode}` : ""),
      tck_code: tckCode,
      status: "queued",
      progress_percent: 0,
      estimated_seconds: estimatedSeconds,
      status_message: statusMessage,
      matched_count: 0,
      retry_count: 0,
      started_at: startedAt
    });
  } catch (err) {
    console.error("Deep search job error:", err);
    res.status(500).json({ error: "Derin arama isteği oluşturulamadı." });
  }
});

app.get("/api/deep-search-jobs", requireAuthApi, async (req, res) => {
  try {
    const rows = await all(
      "SELECT * FROM deep_search_jobs ORDER BY started_at DESC LIMIT 50"
    );
    res.json(rows.map(mapDeepSearchJob));
  } catch (err) {
    console.error("Deep search jobs list error:", err);
    res.status(500).json({ error: "Derin arama işleri yüklenemedi." });
  }
});

app.get("/api/deep-search-jobs/:id", async (req, res) => {
  try {
    const row = await get("SELECT * FROM deep_search_jobs WHERE id = ?", [req.params.id]);
    if (!row) return res.status(404).json({ error: "Derin arama işi bulunamadı." });
    res.json(mapDeepSearchJob(row));
  } catch (err) {
    console.error("Deep search job detail error:", err);
    res.status(500).json({ error: "Derin arama durumu yüklenemedi." });
  }
});

// ── Officials ──

app.get("/api/officials", async (req, res) => {
  try {
    let rows;
    if (req.query.role) {
      rows = await all("SELECT * FROM officials WHERE role = ? ORDER BY name ASC", [req.query.role]);
    } else {
      rows = await all("SELECT * FROM officials ORDER BY name ASC");
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Görevliler yüklenemedi." });
  }
});

app.get("/api/officials/:id", async (req, res) => {
  try {
    const official = await get("SELECT * FROM officials WHERE id = ?", [req.params.id]);
    if (!official) return res.status(404).json({ error: "Görevli bulunamadı." });
    const caseLinks = await all(
      `SELECT co.role_in_case, c.id, c.title, c.case_number, c.status
       FROM case_officials co
       JOIN cases c ON c.id = co.case_id
       WHERE co.official_id = ?
       ORDER BY c.title ASC`,
      [req.params.id]
    );
    official.cases = caseLinks;
    res.json(official);
  } catch (err) {
    res.status(500).json({ error: "Görevli yüklenemedi." });
  }
});

app.post("/api/officials", requireAuthApi, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: "İsim gerekli." });
    const record = await createOfficial(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Görevli kaydedilemedi." });
  }
});

app.post("/api/case-officials", requireAuthApi, async (req, res) => {
  try {
    const { caseId, officialId, roleInCase } = req.body;
    if (!caseId || !officialId) return res.status(400).json({ error: "caseId ve officialId gerekli." });
    await linkOfficial(caseId, officialId, roleInCase || "");
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Görevli bağlanamadı." });
  }
});

app.get("/admin", (req, res) => {
  if (!isAuthed(req)) return res.redirect("/admin/login.html");
  res.redirect("/admin/index.html");
});

app.use("/admin", requireAuthPage, express.static(path.join(__dirname, "public", "admin"), {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
}));

app.delete("/api/cases/:id", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM case_officials WHERE case_id = ?", [req.params.id]);
    await run("DELETE FROM actions WHERE case_id = ?", [req.params.id]);
    await run("DELETE FROM case_people WHERE case_id = ?", [req.params.id]);
    await run("DELETE FROM cases WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Dava silinemedi." });
  }
});

app.delete("/api/people/:id", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM actions WHERE person_id = ?", [req.params.id]);
    await run("DELETE FROM case_people WHERE person_id = ?", [req.params.id]);
    await run("DELETE FROM people WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Kişi silinemedi." });
  }
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
}));

const port = process.env.PORT || 5000;

init()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${port}`);
    });
    if (DEEP_SEARCH_WORKER_ENABLED) {
      setInterval(runDeepSearchWorkerOnce, 5000);
      setTimeout(runDeepSearchWorkerOnce, 1000);
    }
  })
  .catch((err) => {
    console.error("Failed to init database", err);
    process.exit(1);
  });
