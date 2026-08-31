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
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_READ_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_WRITE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEEP_SEARCH_PAGE_SIZE = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_PAGE_SIZE, 10) || 25, 1), 100);
const DEEP_SEARCH_MAX_PAGES = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_MAX_PAGES, 10) || 3, 1), 20);
const DEEP_SEARCH_MAX_RETRIES = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_MAX_RETRIES, 10) || 1, 1), 50);
const DEEP_SEARCH_RETRY_SECONDS = Math.min(Math.max(parseInt(process.env.DEEP_SEARCH_RETRY_SECONDS, 10) || 300, 30), 3600);
const DEEP_SEARCH_WORKER_ENABLED = process.env.DEEP_SEARCH_WORKER_ENABLED !== "false";
let deepSearchWorkerRunning = false;

const LAW_REGISTRY = {
  TCK: {
    law_no: "5237",
    law_code: "TCK",
    name: "Türk Ceza Kanunu",
    aliases: ["TCK", "Türk Ceza Kanunu", "5237 sayılı TCK", "5237 sayılı Türk Ceza Kanunu", "5237 sayılı Kanun", "5237 sayılı Yasa"]
  },
  "765TCK": {
    law_no: "765",
    law_code: "765TCK",
    name: "Mülga Türk Ceza Kanunu",
    aliases: ["765 sayılı TCK", "765 sayılı Türk Ceza Kanunu", "765 sayılı Kanun", "765 sayılı Yasa"]
  },
  CMK: {
    law_no: "5271",
    law_code: "CMK",
    name: "Ceza Muhakemesi Kanunu",
    aliases: ["CMK", "Ceza Muhakemesi Kanunu", "5271 sayılı CMK", "5271 sayılı Ceza Muhakemesi Kanunu", "5271 sayılı Kanun", "5271 sayılı Yasa"]
  },
  INF: {
    law_no: "5275",
    law_code: "INF",
    name: "Ceza ve Güvenlik Tedbirlerinin İnfazı Hakkında Kanun",
    aliases: ["İnfaz Kanunu", "CGTİHK", "5275 sayılı Kanun", "5275 sayılı Yasa", "5275 sayılı İnfaz Kanunu"]
  },
  TMK: {
    law_no: "3713",
    law_code: "TMK",
    name: "Terörle Mücadele Kanunu",
    aliases: ["TMK", "Terörle Mücadele Kanunu", "3713 sayılı Kanun", "3713 sayılı Yasa", "3713 sayılı Terörle Mücadele Kanunu"]
  },
  SILAH: {
    law_no: "6136",
    law_code: "SILAH",
    name: "Ateşli Silahlar ve Bıçaklar ile Diğer Aletler Hakkında Kanun",
    aliases: ["6136", "6136 sayılı Kanun", "6136 sayılı Yasa", "Ateşli Silahlar Kanunu"]
  },
  KACAK: {
    law_no: "5607",
    law_code: "KACAK",
    name: "Kaçakçılıkla Mücadele Kanunu",
    aliases: ["5607", "5607 sayılı Kanun", "5607 sayılı Yasa", "Kaçakçılıkla Mücadele Kanunu"]
  },
  VUK: {
    law_no: "213",
    law_code: "VUK",
    name: "Vergi Usul Kanunu",
    aliases: ["VUK", "Vergi Usul Kanunu", "213 sayılı Kanun", "213 sayılı Yasa"]
  }
};

const LAW_BY_NO = Object.values(LAW_REGISTRY).reduce((acc, law) => {
  acc[law.law_no] = law;
  return acc;
}, {});

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
  const parsed = parseArticlePath(String(value || "").replace(/^TCK\s*/i, ""));
  if (!parsed) {
    return String(value || "")
      .trim()
      .replace(/^TCK\s*/i, "")
      .replace(/\/(\d+)\./g, "/$1-")
      .replace(/\s+/g, "")
      .toUpperCase();
  }
  return formatArticlePath(parsed);
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

function isSupabaseReadEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_READ_KEY);
}

function isSupabaseWriteEnabled() {
  return Boolean(SUPABASE_URL && SUPABASE_WRITE_KEY);
}

async function supabaseRest(pathname, options = {}) {
  const write = options.write === true;
  const key = write ? SUPABASE_WRITE_KEY : SUPABASE_READ_KEY;
  if (!SUPABASE_URL || !key) throw new Error("Supabase environment variables are not configured.");
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const url = `${SUPABASE_URL}/rest/v1${pathname}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Supabase request failed (${response.status}): ${detail}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function postgrestSearchText(value) {
  return String(value || "").replace(/[(),*]/g, " ").replace(/\s+/g, " ").trim();
}

function supabaseLegalRefOrFilter(legalRef) {
  const canonical = canonicalLegalRef(legalRef);
  if (!canonical) return "";
  return `(canonical_ref.eq.${canonical},canonical_ref.like.${canonical}:*)`;
}

function mapSupabaseCitation(row) {
  const decision = row.court_decisions || {};
  const ref = normalizeLegalRef(row);
  const tckCode = ref?.law_no === "5237" && ref?.law_code === "TCK" ? formatArticlePath(ref) : "";
  return {
    id: row.id,
    hf_id: row.hf_id || decision.hf_id || "",
    source: decision.source || "",
    document_id: decision.document_id || "",
    court: decision.court || "",
    esas_no: decision.esas_no || "",
    karar_no: decision.karar_no || "",
    karar_tarihi: decision.karar_tarihi || "",
    year: Number(decision.year || 0),
    month: Number(decision.month || 0),
    text_len: Number(decision.text_len || 0),
    masked_count: Number(decision.masked_count || 0),
    raw_sha256: decision.raw_sha256 || "",
    detected_law_refs: Array.from(new Set([
      row.canonical_ref,
      labelLegalRef(ref),
      row.raw_reference
    ].filter(Boolean))),
    detected_tck_codes: tckCode ? Array.from(new Set([tckCode, ref.article].filter(Boolean))) : [],
    short_preview: row.context || decision.short_preview || "",
    indexed_level: "supabase_legal_citation",
    created_at: row.created_at || decision.created_at || ""
  };
}

async function fetchSupabaseLegalReferences({ legalRef, query, limit }) {
  if (!isSupabaseReadEnabled()) return [];
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,hf_id,law_no,law_code,law_name,article,paragraph,subparagraph,canonical_ref,raw_reference,context,position,created_at,court_decisions(id,hf_id,source,document_id,court,esas_no,karar_no,karar_tarihi,year,month,text_len,masked_count,raw_sha256,short_preview,created_at)"
  );
  params.set("limit", String(Math.min(Math.max(Number(limit) || 6, 1), 250)));
  params.set("order", "created_at.desc");

  if (legalRef) {
    const filter = supabaseLegalRefOrFilter(legalRef);
    if (filter) params.set("or", filter);
  } else if (query) {
    const q = postgrestSearchText(query);
    if (q) params.set("or", `(context.ilike.*${q}*,raw_reference.ilike.*${q}*,canonical_ref.ilike.*${q}*)`);
  }

  const rows = await supabaseRest(`/legal_citations?${params.toString()}`);
  return Array.isArray(rows) ? rows.map(mapSupabaseCitation) : [];
}

function mergeLegalReferences(primary, secondary, limit) {
  const seen = new Set();
  const merged = [];
  [...(primary || []), ...(secondary || [])].forEach((row) => {
    const key = row.hf_id || row.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  });
  return merged.slice(0, limit);
}

function mapDeepSearchJob(row) {
  if (!row) return null;
  return {
    ...row,
    query_plan: parseJsonField(row.query_plan, []),
    progress_percent: Number(row.progress_percent || 0),
    estimated_seconds: Number(row.estimated_seconds || 0),
    matched_count: Number(row.matched_count || 0),
    retry_count: Number(row.retry_count || 0)
  };
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lawByNo(lawNo) {
  const normalized = String(lawNo || "").trim();
  if (LAW_BY_NO[normalized]) return LAW_BY_NO[normalized];
  if (!normalized) return null;
  return {
    law_no: normalized,
    law_code: normalized,
    name: `${normalized} sayılı Kanun`,
    aliases: [normalized, `${normalized} sayılı Kanun`, `${normalized} sayılı Yasa`]
  };
}

function lawByCode(rawCode, lawNoHint = "") {
  const token = String(rawCode || "")
    .trim()
    .replace(/[İI]NFAZ/i, "INF")
    .replace(/CGTİHK|CGTIHK/i, "INF")
    .toUpperCase();
  if (lawNoHint && lawByNo(lawNoHint)?.law_code) return lawByNo(lawNoHint);
  if (token === "TCK") return LAW_REGISTRY.TCK;
  if (LAW_REGISTRY[token]) return LAW_REGISTRY[token];
  return null;
}

function lawByTextMarker(marker, lawNoHint = "") {
  const text = String(marker || "").toLocaleUpperCase("tr-TR");
  if (lawNoHint) return lawByNo(lawNoHint);
  if (text.includes("TÜRK CEZA") || /\bTCK\b/.test(text)) return LAW_REGISTRY.TCK;
  if (text.includes("CEZA MUHAKEMES") || /\bCMK\b/.test(text)) return LAW_REGISTRY.CMK;
  if (text.includes("TERÖRLE MÜCADELE") || /\bTMK\b/.test(text)) return LAW_REGISTRY.TMK;
  if (text.includes("İNFAZ") || text.includes("GÜVENLİK TEDBİRLER")) return LAW_REGISTRY.INF;
  if (text.includes("VERGİ USUL") || /\bVUK\b/.test(text)) return LAW_REGISTRY.VUK;
  if (text.includes("ATEŞLİ SİLAH")) return LAW_REGISTRY.SILAH;
  if (text.includes("KAÇAKÇILIK")) return LAW_REGISTRY.KACAK;
  return null;
}

function cleanArticleToken(value) {
  return String(value || "")
    .trim()
    .replace(/[–—]/g, "-")
    .replace(/[()"'“”‘’]/g, "")
    .replace(/^(?:m\.?|madde)\s*/i, "")
    .replace(/[,:;]+$/g, "")
    .replace(/\s+/g, "")
    .replace(/\/(\d+)\.(?=[A-Za-zÇĞİÖŞÜçğıöşü0-9])/g, "/$1-")
    .replace(/(\d+)\.(?=[A-Za-zÇĞİÖŞÜçğıöşü])/g, "$1-")
    .replace(/\.$/, "");
}

function parseArticlePath(value) {
  const token = cleanArticleToken(value);
  if (!token) return null;
  const match = token.match(/^(\d{1,4})(?:\/(.+))?$/i);
  if (!match) return null;
  const article = match[1];
  if (!article || Number(article) > 999) return null;
  const suffix = String(match[2] || "").replace(/^[./-]+|[./-]+$/g, "");
  let paragraph = "";
  let subparagraph = "";
  if (suffix) {
    const paragraphMatch = suffix.match(/^(\d+)(?:[.\-/]?(.+))?$/i);
    if (paragraphMatch) {
      paragraph = paragraphMatch[1] || "";
      subparagraph = String(paragraphMatch[2] || "").replace(/^[.\-/]+|[.\-/]+$/g, "");
    } else {
      subparagraph = suffix;
    }
  }
  return {
    article,
    paragraph,
    subparagraph: subparagraph ? subparagraph.toUpperCase() : ""
  };
}

function formatArticlePath(ref) {
  if (!ref?.article) return "";
  let out = String(ref.article);
  if (ref.paragraph) out += `/${ref.paragraph}`;
  if (ref.subparagraph) out += `-${String(ref.subparagraph).toUpperCase()}`;
  return out;
}

function canonicalLegalRef(ref) {
  if (!ref?.law_no || !ref?.law_code || !ref?.article) return "";
  return [ref.law_no, ref.law_code, ref.article, ref.paragraph, ref.subparagraph]
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean)
    .join(":");
}

function labelLegalRef(ref) {
  if (!ref?.law_code || !ref?.article) return "";
  const code = ref.law_code === "765TCK" ? "765 TCK" : ref.law_code;
  return `${code} ${formatArticlePath(ref)}`.trim();
}

function normalizeLegalRef(ref) {
  if (!ref) return null;
  const law = lawByNo(ref.law_no) || lawByCode(ref.law_code) || null;
  const articleParts = parseArticlePath(formatArticlePath(ref) || ref.article);
  if (!law || !articleParts?.article) return null;
  return {
    law_no: law.law_no,
    law_code: law.law_code,
    law_name: law.name,
    article: articleParts.article,
    paragraph: articleParts.paragraph || String(ref.paragraph || ""),
    subparagraph: articleParts.subparagraph || String(ref.subparagraph || "").toUpperCase(),
    raw_reference: ref.raw_reference || ""
  };
}

function legalRefFromBody(body = {}) {
  const lawNo = String(body.lawNo || body.law_no || "").trim();
  const lawCode = String(body.lawCode || body.law_code || "").trim();
  const article = String(body.article || "").trim();
  if (!article && !lawNo && !lawCode) return null;
  const law = lawByNo(lawNo) || lawByCode(lawCode) || lawByCode(lawCode, lawNo);
  const parts = parseArticlePath([
    article,
    body.paragraph || body.fikra ? body.paragraph || body.fikra : "",
    body.subparagraph || body.bent ? body.subparagraph || body.bent : ""
  ].filter(Boolean).join("/"));
  if (!law || !parts?.article) return null;
  return normalizeLegalRef({ ...law, ...parts });
}

function parseLegalReferenceInput(value, options = {}) {
  const input = String(value || "").trim();
  if (!input) return null;

  const canonical = input.match(/\b(\d{3,4}):([A-Za-z0-9ÇĞİÖŞÜçğıöşü]+):(\d{1,4})(?::([^:\s]+))?(?::([^:\s]+))?\b/u);
  if (canonical) {
    const law = lawByNo(canonical[1]) || lawByCode(canonical[2], canonical[1]);
    return normalizeLegalRef({
      ...(law || {}),
      article: canonical[3],
      paragraph: canonical[4] || "",
      subparagraph: canonical[5] || "",
      raw_reference: canonical[0]
    });
  }

  const compactLaw = input.match(/\b(765|5237|5271|5275|3713|6136|5607|213)\/(\d{1,4}(?:\/[0-9A-Za-zÇĞİÖŞÜçğıöşü.-]+)?)\b/u);
  if (compactLaw) {
    const law = lawByNo(compactLaw[1]);
    const parts = parseArticlePath(compactLaw[2]);
    if (law && parts) return normalizeLegalRef({ ...law, ...parts, raw_reference: compactLaw[0] });
  }

  const numbered = input.match(/\b(765|5237|5271|5275|3713|6136|5607|213)\s*sayılı[\s\S]{0,90}?(\d{1,4}(?:\/[0-9A-Za-zÇĞİÖŞÜçğıöşü.-]+)?)\s*(?:\.?\s*(?:madde|maddesi|maddesinin|fıkra|uyarınca|kapsamında)|\b)/iu);
  if (numbered) {
    const law = lawByNo(numbered[1]);
    const parts = parseArticlePath(numbered[2]);
    if (law && parts) return normalizeLegalRef({ ...law, ...parts, raw_reference: numbered[0] });
  }

  const code = input.match(/\b(TCK|CMK|TMK|VUK|INF|İnfaz|CGTİHK|CGTIHK)\b[\s'’`A-Za-zÇĞİÖŞÜçğıöşü.]{0,30}?(\d{1,4}(?:\/[0-9A-Za-zÇĞİÖŞÜçğıöşü.-]+)?)\b/u);
  if (code) {
    const law = lawByCode(code[1]);
    const parts = parseArticlePath(code[2]);
    if (law && parts) return normalizeLegalRef({ ...law, ...parts, raw_reference: code[0] });
  }

  if (options.defaultLawCode) {
    const partsOnly = input.match(/\b(\d{1,4}(?:\/[0-9A-Za-zÇĞİÖŞÜçğıöşü.-]+)?)\b/u);
    const law = lawByCode(options.defaultLawCode);
    const parts = partsOnly ? parseArticlePath(partsOnly[1]) : null;
    if (law && parts) return normalizeLegalRef({ ...law, ...parts, raw_reference: partsOnly[0] });
  }

  return null;
}

function contextSnippet(text, index, length = 280) {
  const clean = String(text || "").replace(/\s+/g, " ");
  const start = Math.max(0, index - Math.round(length / 3));
  return `${start > 0 ? "..." : ""}${clean.slice(start, start + length)}${start + length < clean.length ? "..." : ""}`;
}

function isPlausibleArticleToken(token, lawNo) {
  const parts = parseArticlePath(token);
  if (!parts?.article) return false;
  const articleNumber = Number(parts.article);
  if (!Number.isFinite(articleNumber) || articleNumber <= 0 || articleNumber > 999) return false;
  if (String(parts.article) === String(lawNo)) return false;
  if (articleNumber >= 1900 && articleNumber <= 2099) return false;
  return true;
}

function extractArticleTokensFromContext(windowText, lawNo) {
  const tokens = [];
  const seen = new Set();
  const articleRegex = /\b(\d{1,3}(?:\/[0-9]+(?:[.\-/]?[A-Za-zÇĞİÖŞÜçğıöşü](?:[-.]?\d+)?)?)?)\s*(?=(?:\.|,|;|\)|\s+ve|\s+ile|\s+(?:madde|maddesi|maddesinin|maddelerine|fıkra|uyarınca|gereğince|kapsamında)|$))/giu;
  let match;
  while ((match = articleRegex.exec(windowText)) !== null) {
    const raw = match[1];
    if (!isPlausibleArticleToken(raw, lawNo)) continue;
    const normalized = formatArticlePath(parseArticlePath(raw));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tokens.push({ raw, index: match.index });
    if (tokens.length >= 10) break;
  }
  return tokens;
}

function addDetectedLegalRef(target, law, parts, rawReference, text, index) {
  const ref = normalizeLegalRef({ ...law, ...parts, raw_reference: rawReference });
  const canonical = canonicalLegalRef(ref);
  if (!canonical || target.has(canonical)) return;
  target.set(canonical, {
    ...ref,
    canonical,
    label: labelLegalRef(ref),
    position: Math.max(0, Number(index || 0)),
    context: contextSnippet(text, index)
  });
}

function extractLegalReferences(text) {
  const sourceText = String(text || "");
  const refs = new Map();
  if (!sourceText) return [];

  const directCodeRegex = /\b(TCK|CMK|TMK|VUK|INF|İnfaz|CGTİHK|CGTIHK)\b[\s'’`A-Za-zÇĞİÖŞÜçğıöşü.]{0,30}?(\d{1,4}(?:\/[0-9A-Za-zÇĞİÖŞÜçğıöşü.-]+)?)\b/giu;
  let match;
  while ((match = directCodeRegex.exec(sourceText)) !== null) {
    const law = lawByCode(match[1]);
    const parts = parseArticlePath(match[2]);
    if (law && parts) addDetectedLegalRef(refs, law, parts, match[0], sourceText, match.index);
  }

  const bracketLawRegex = /\b(?:(765|5237|5271|5275|3713|6136|5607|213)\s*S\.?\s*)?([A-ZÇĞİÖŞÜÜa-zçğıöşü\s]+?(?:KANUNU|YASA|TCK|CMK|TMK|VUK))(?:\s*\((765|5237|MÜLGA|MULGA)\))?\s*\[\s*Madde\s+(\d{1,4}(?:\/[0-9A-Za-zÇĞİÖŞÜçğıöşü.-]+)?)\s*\]/giu;
  while ((match = bracketLawRegex.exec(sourceText)) !== null) {
    const hintedNo = /^\d+$/.test(match[3] || "") ? match[3] : match[1];
    const law = lawByTextMarker(match[2], hintedNo);
    const parts = parseArticlePath(match[4]);
    if (law && parts) addDetectedLegalRef(refs, law, parts, match[0], sourceText, match.index);
  }

  for (const law of Object.values(LAW_REGISTRY)) {
    const aliasPatterns = [
      ...law.aliases.filter((alias) => !/^\d+$/.test(alias)).map(escapeRegExp),
      `${escapeRegExp(law.law_no)}\\s*sayılı(?:\\s+[\\p{L}0-9'’().\\-]+){0,10}`
    ];

    for (const pattern of aliasPatterns) {
      const aliasRegex = new RegExp(pattern, "giu");
      let aliasMatch;
      while ((aliasMatch = aliasRegex.exec(sourceText)) !== null) {
        const windowText = sourceText.slice(aliasMatch.index, aliasMatch.index + 260);
        const articleTokens = extractArticleTokensFromContext(windowText, law.law_no);
        articleTokens.forEach((token) => {
          const parts = parseArticlePath(token.raw);
          if (parts) addDetectedLegalRef(refs, law, parts, token.raw, sourceText, aliasMatch.index + token.index);
        });
      }
    }
  }

  return Array.from(refs.values());
}

function extractTckCodes(text) {
  const refs = extractLegalReferences(text);
  const codes = new Set();
  refs
    .filter((ref) => ref.law_no === "5237" && ref.law_code === "TCK")
    .forEach((ref) => {
      const full = formatArticlePath(ref);
      if (full) codes.add(full);
      if (ref.article) codes.add(ref.article);
    });
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

function buildDeepSearchQueries(query, legalRef, tckTitle) {
  const ref = normalizeLegalRef(legalRef);
  if (!ref) return Array.from(new Set([String(query || "").trim()].filter(Boolean)));
  const law = lawByNo(ref.law_no) || lawByCode(ref.law_code) || ref;
  const pathValue = formatArticlePath(ref);
  const article = ref.article;
  const paragraph = ref.paragraph;
  const subparagraph = ref.subparagraph;
  const paragraphDot = paragraph ? `${article}. maddesinin ${paragraph}. fıkrası` : "";
  const paragraphSlash = paragraph ? `${article}/${paragraph}` : "";
  const dottedSub = paragraph && subparagraph ? `${article}/${paragraph}.${String(subparagraph).toLowerCase()}` : "";
  const title = String(tckTitle || "").trim();
  return Array.from(new Set([
    query,
    labelLegalRef(ref),
    `${law.law_no} sayılı ${law.law_code} ${pathValue}`,
    `${law.law_no} sayılı ${law.name} ${article}. madde`,
    `${law.law_no} sayılı Kanun ${pathValue}`,
    `${law.law_no} sayılı Yasa ${pathValue}`,
    `${law.law_code}'nın ${article}. maddesi`,
    `${law.law_code} ${article}. madde`,
    `${law.name}'nun ${article}. maddesi`,
    paragraphSlash ? `${law.law_code} ${paragraphSlash}` : "",
    paragraphDot ? `${law.law_code}'nın ${paragraphDot}` : "",
    paragraphDot ? `${law.law_no} sayılı Kanunun ${paragraphDot}` : "",
    dottedSub ? `${law.law_code} ${dottedSub}` : "",
    dottedSub ? `${law.law_no} sayılı Kanun ${dottedSub}` : "",
    title ? `${title}` : "",
    article && title ? `${article}. madde ${title}` : "",
    article && title ? `${law.law_code} ${article} ${title}` : ""
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

function legalRefForJob(job) {
  const fromStructured = normalizeLegalRef({
    law_no: job.law_no,
    law_code: job.law_code,
    article: job.article,
    paragraph: job.paragraph,
    subparagraph: job.subparagraph
  });
  if (fromStructured) return fromStructured;
  const fromCanonical = parseLegalReferenceInput(job.canonical_ref || "");
  if (fromCanonical) return fromCanonical;
  if (job.tck_code) return parseLegalReferenceInput(`TCK ${job.tck_code}`, { defaultLawCode: "TCK" });
  return parseLegalReferenceInput(job.query || "");
}

async function upsertLegalReferenceFromHfRow(rowWrapper, query, legalRef) {
  const row = rowWrapper?.row || {};
  const text = row.text || "";
  const hfId = row.id || `${row.source || "hf"}:${row.document_id || rowWrapper?.row_idx || crypto.randomUUID()}`;
  const requestedRef = normalizeLegalRef(legalRef);
  const detectedRefs = extractLegalReferences(text);
  if (requestedRef) detectedRefs.push({ ...requestedRef, canonical: canonicalLegalRef(requestedRef), label: labelLegalRef(requestedRef) });

  const lawRefStrings = new Set();
  const detectedCodes = new Set();
  detectedRefs.forEach((ref) => {
    const normalized = normalizeLegalRef(ref);
    const canonical = canonicalLegalRef(normalized);
    const label = labelLegalRef(normalized);
    if (canonical) lawRefStrings.add(canonical);
    if (label) lawRefStrings.add(label);
    if (ref.raw_reference) lawRefStrings.add(String(ref.raw_reference));
    if (normalized?.law_no === "5237" && normalized?.law_code === "TCK") {
      const pathValue = formatArticlePath(normalized);
      if (pathValue) detectedCodes.add(pathValue);
      if (normalized.article) detectedCodes.add(normalized.article);
    }
  });
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
      JSON.stringify(Array.from(lawRefStrings)),
      JSON.stringify(Array.from(detectedCodes)),
      makeExcerpt(text, query || labelLegalRef(requestedRef)),
      "deep_search",
      now
    ]
  );

  return await get("SELECT id FROM legal_references WHERE hf_id = ?", [hfId]);
}

function legalRefMatchesTarget(ref, targetRef) {
  const canonical = canonicalLegalRef(ref);
  const target = canonicalLegalRef(targetRef);
  if (!canonical || !target) return false;
  return canonical === target || canonical.startsWith(`${target}:`);
}

async function fetchHfRowsPage(config, offset, length) {
  const url = new URL("https://datasets-server.huggingface.co/rows");
  url.searchParams.set("dataset", HF_DATASET);
  url.searchParams.set("config", config || HF_CONFIG);
  url.searchParams.set("split", HF_SPLIT);
  url.searchParams.set("offset", String(offset || 0));
  url.searchParams.set("length", String(length || 100));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  return fetch(url, { signal: controller.signal })
    .catch((err) => {
      if (err?.name === "AbortError") {
        throw new TransientDeepSearchError("Hugging Face rows servisi zaman aşımına uğradı.");
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

async function upsertSupabaseDecisionAndCitations(rowWrapper, citations, query = "") {
  if (!isSupabaseWriteEnabled()) {
    throw new Error("Supabase write key is not configured.");
  }
  const row = rowWrapper?.row || {};
  const text = row.text || "";
  const hfId = row.id || `${row.source || "hf"}:${row.document_id || rowWrapper?.row_idx || crypto.randomUUID()}`;
  const decisionPayload = {
    hf_id: hfId,
    source: row.source || "",
    document_id: row.document_id || "",
    court: row.court || "",
    esas_no: row.esas_no || "",
    karar_no: row.karar_no || "",
    karar_tarihi: row.karar_tarihi || null,
    year: Number(row.year || 0) || null,
    month: Number(row.month || 0) || null,
    text_len: Number(row.text_len || String(text).length || 0) || null,
    masked_count: Number(row.masked_count || 0) || 0,
    raw_sha256: row.raw_sha256 || "",
    short_preview: makeExcerpt(text, query || hfId, 520),
    indexed_at: new Date().toISOString()
  };
  const decisionRows = await supabaseRest("/court_decisions?on_conflict=hf_id", {
    method: "POST",
    write: true,
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: [decisionPayload]
  });
  const decision = Array.isArray(decisionRows) ? decisionRows[0] : null;
  if (!decision?.id) return { decisions_indexed: 0, citations_indexed: 0 };

  const seen = new Set();
  const citationPayload = citations
    .map((citation, idx) => {
      const ref = normalizeLegalRef(citation);
      const canonical = canonicalLegalRef(ref);
      if (!canonical) return null;
      const rawReference = String(citation.raw_reference || labelLegalRef(ref) || canonical);
      const key = `${canonical}|${rawReference}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        decision_id: decision.id,
        hf_id: hfId,
        law_no: ref.law_no,
        law_code: ref.law_code,
        law_name: ref.law_name || lawByNo(ref.law_no)?.name || "",
        article: ref.article,
        paragraph: ref.paragraph || "",
        subparagraph: ref.subparagraph || "",
        canonical_ref: canonical,
        raw_reference: rawReference,
        context: citation.context || makeExcerpt(text, rawReference, 360),
        position: Number(citation.position || idx) || 0
      };
    })
    .filter(Boolean);

  if (!citationPayload.length) return { decisions_indexed: 1, citations_indexed: 0 };

  const conflict = new URLSearchParams({ on_conflict: "decision_id,canonical_ref,raw_reference" });
  await supabaseRest(`/legal_citations?${conflict.toString()}`, {
    method: "POST",
    write: true,
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: citationPayload
  });
  return { decisions_indexed: 1, citations_indexed: citationPayload.length };
}

async function scanHfRowsBatch({ config = "yargitay", offset = 0, length = 100, targetRef = null, query = "" }) {
  const response = await fetchHfRowsPage(config, offset, length);
  if (!response.ok) {
    const detail = await hfErrorText(response);
    throw new Error(`Hugging Face rows servisi yanıt vermedi (${response.status}${detail ? `: ${detail}` : ""}).`);
  }
  const payload = await response.json();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  let decisionsIndexed = 0;
  let citationsIndexed = 0;
  let rowsWithCitations = 0;
  let rowsMatchedTarget = 0;

  for (const rowWrapper of rows) {
    const citations = extractLegalReferences(rowWrapper?.row?.text || "");
    if (!citations.length) continue;
    rowsWithCitations += 1;
    const matchesTarget = targetRef ? citations.some((citation) => legalRefMatchesTarget(citation, targetRef)) : true;
    if (!matchesTarget) continue;
    rowsMatchedTarget += 1;
    const stored = await upsertSupabaseDecisionAndCitations(rowWrapper, citations, query);
    decisionsIndexed += stored.decisions_indexed;
    citationsIndexed += stored.citations_indexed;
  }

  return {
    config,
    offset,
    next_offset: offset + rows.length,
    rows_scanned: rows.length,
    rows_with_citations: rowsWithCitations,
    rows_matched_target: rowsMatchedTarget,
    decisions_indexed: decisionsIndexed,
    citations_indexed: citationsIndexed
  };
}

async function processDeepSearchJob(job) {
  const legalRef = legalRefForJob(job);
  const tckCode = legalRef?.law_no === "5237" && legalRef?.law_code === "TCK"
    ? formatArticlePath(legalRef)
    : normalizeTckCode(job.tck_code || "");
  const rootCode = tckCode ? rootTckCode(tckCode) : legalRef?.article || "";
  const query = job.query || (legalRef ? labelLegalRef(legalRef) : "");
  const tckTitle = tckCode ? await getTckTitleForSearch(tckCode) : "";
  const storedPlan = parseJsonField(job.query_plan, []);
  const queryCandidates = storedPlan.length ? storedPlan : buildDeepSearchQueries(query, legalRef, tckTitle);
  let activeQuery = query;
  const startedAt = new Date().toISOString();

  if (legalRef && isSupabaseReadEnabled()) {
    try {
      const indexed = await fetchSupabaseLegalReferences({ legalRef, query, limit: 250 });
      if (indexed.length) {
        await run(
          "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, matched_count = ?, started_at = ?, finished_at = ?, next_attempt_at = ?, status_message = ?, canonical_ref = ?, query_plan = ?, error = ? WHERE id = ?",
          [
            "completed",
            100,
            0,
            indexed.length,
            startedAt,
            new Date().toISOString(),
            "",
            `${indexed.length} karar yerel mevzuat indeksinden bulundu. Hugging Face canlı aramasına gerek kalmadı.`,
            canonicalLegalRef(legalRef),
            JSON.stringify(queryCandidates),
            "",
            job.id
          ]
        );
        return;
      }
    } catch (err) {
      console.warn("Supabase indexed lookup before deep search failed:", err.message);
    }
  }

  await run(
    "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, status_message = ?, started_at = ?, last_attempt_at = ?, next_attempt_at = ?, error = ?, canonical_ref = ?, query_plan = ? WHERE id = ?",
    [
      "running",
      2,
      "Hugging Face arama indeksi mevzuat atfı varyasyonlarıyla sorgulanıyor.",
      startedAt,
      startedAt,
      "",
      "",
      canonicalLegalRef(legalRef),
      JSON.stringify(queryCandidates),
      job.id
    ]
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
          : `İlk sorgu yanıt vermedi. Alternatif mevzuat atfı deneniyor: ${activeQuery}`;
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
      const rootFallback = legalRef?.law_code && rootCode ? `${legalRef.law_code} ${rootCode}` : "";
      if (!fallbackWorked && rootFallback && activeQuery !== rootFallback) {
        activeQuery = rootFallback;
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
      const ref = await upsertLegalReferenceFromHfRow(resultRow, activeQuery, legalRef);
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
          JSON.stringify([activeQuery, query, canonicalLegalRef(legalRef), labelLegalRef(legalRef), tckCode].filter(Boolean)),
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
    "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, matched_count = ?, finished_at = ?, next_attempt_at = ?, status_message = ? WHERE id = ?",
    [
      "completed",
      100,
      0,
      matchedCount,
      new Date().toISOString(),
      "",
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
      const nextAttempt = candidate.next_attempt_at ? Date.parse(candidate.next_attempt_at) : 0;
      if (nextAttempt && nowMs < nextAttempt) return false;
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
          "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, next_attempt_at = ?, status_message = ?, error = ?, finished_at = ? WHERE id = ?",
          [
            "completed",
            100,
            0,
            "",
            `${matchedCount} karar indekse eklendi. Hugging Face sonraki sayfada yanıt vermedi; kayıtlı sonuçlar kullanılabilir.`,
            err.message || String(err),
            new Date().toISOString(),
            running.id
          ]
        );
      } else {
        const retryCount = Number(running.retry_count || 0) + 1;
        if (err.isTransient) {
          await run(
            "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, retry_count = ?, next_attempt_at = ?, status_message = ?, error = ?, finished_at = ? WHERE id = ?",
            [
              "source_unavailable",
              Math.max(Number(running.progress_percent || 0), 8),
              0,
              retryCount,
              "",
              "Hugging Face dataset arama indeksi şu an sorgu kabul etmiyor. Bu arama dış kaynağa bağlı olduğu için bekletilmedi; daha sonra tekrar deneyebilir veya yerel indeks kurulabilir.",
              err.message || String(err),
              new Date().toISOString(),
              running.id
            ]
          );
        } else {
          const message = err.message && err.message.includes("Hugging Face")
            ? err.message
            : "Derin arama hata verdi.";
          await run(
            "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, retry_count = ?, next_attempt_at = ?, status_message = ?, error = ?, finished_at = ? WHERE id = ?",
            [
              "failed",
              Math.max(Number(running.progress_percent || 0), 8),
              0,
              retryCount,
              "",
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

app.post("/api/legal-index/scan-batch", requireAuthApi, async (req, res) => {
  try {
    if (!isSupabaseWriteEnabled()) {
      return res.status(400).json({
        error: "Supabase yazma anahtarı yok. Render Environment bölümüne SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY eklenmeli."
      });
    }
    const config = String(req.body?.config || "yargitay").trim();
    const offset = Math.max(0, parseInt(req.body?.offset, 10) || 0);
    const length = Math.min(Math.max(parseInt(req.body?.length, 10) || 100, 1), 100);
    const query = String(req.body?.query || req.body?.legalRef || "").trim();
    const targetRef = parseLegalReferenceInput(req.body?.legalRef || query || "", { defaultLawCode: "TCK" });
    const runId = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    await run(
      `INSERT INTO deep_search_jobs
        (id, query, tck_code, law_no, law_code, article, paragraph, subparagraph, canonical_ref, query_plan, status, progress_percent, estimated_seconds, status_message, matched_count, started_at, finished_at, error, retry_count, last_attempt_at, next_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        runId,
        query || (targetRef ? labelLegalRef(targetRef) : `HF rows ${config}`),
        targetRef?.law_no === "5237" && targetRef?.law_code === "TCK" ? formatArticlePath(targetRef) : "",
        targetRef?.law_no || "",
        targetRef?.law_code || "",
        targetRef?.article || "",
        targetRef?.paragraph || "",
        targetRef?.subparagraph || "",
        canonicalLegalRef(targetRef),
        JSON.stringify(targetRef ? buildDeepSearchQueries(query || labelLegalRef(targetRef), targetRef, "") : []),
        "running",
        5,
        60,
        `${config} kaynağında ${offset}-${offset + length} arası satırlar mevzuat atfı için taranıyor.`,
        0,
        startedAt,
        "",
        "",
        0,
        startedAt,
        ""
      ]
    );
    const result = await scanHfRowsBatch({ config, offset, length, targetRef, query });
    await run(
      "UPDATE deep_search_jobs SET status = ?, progress_percent = ?, estimated_seconds = ?, matched_count = ?, status_message = ?, finished_at = ? WHERE id = ?",
      [
        "completed",
        100,
        0,
        result.decisions_indexed,
        `${result.rows_scanned} karar satırı tarandı; ${result.decisions_indexed} karar ve ${result.citations_indexed} mevzuat atfı Supabase indeksine yazıldı.`,
        new Date().toISOString(),
        runId
      ]
    );
    res.json({ id: runId, ...result });
  } catch (err) {
    console.error("Legal index batch error:", err);
    res.status(500).json({ error: err.message || "Mevzuat indeksi batch taraması yapılamadı." });
  }
});

app.get("/api/legal-references", async (req, res) => {
  try {
    const tckCode = normalizeTckCode(req.query.tck || req.query.tckCode || "");
    const legalRef = legalRefFromBody(req.query)
      || parseLegalReferenceInput(req.query.legalRef || req.query.reference || "", { defaultLawCode: tckCode ? "TCK" : "" })
      || (tckCode ? parseLegalReferenceInput(`TCK ${tckCode}`, { defaultLawCode: "TCK" }) : null);
    const query = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 6, 1), 250);
    const params = [];
    const where = [];
    let supabaseRows = [];

    try {
      supabaseRows = await fetchSupabaseLegalReferences({ legalRef, query, limit });
    } catch (err) {
      console.warn("Supabase legal reference lookup skipped:", err.message);
    }

    if (legalRef) {
      const needles = [
        canonicalLegalRef(legalRef),
        labelLegalRef(legalRef),
        `${legalRef.law_no}:${legalRef.law_code}:${legalRef.article}`,
        `${legalRef.law_code} ${legalRef.article}`,
        legalRef.law_no === "5237" && legalRef.law_code === "TCK" ? formatArticlePath(legalRef) : ""
      ].filter(Boolean);
      where.push(`(${needles.map(() => "detected_law_refs LIKE ?").join(" OR ")}${tckCode ? " OR detected_tck_codes LIKE ?" : ""})`);
      params.push(...needles.map(likeNeedle));
      if (tckCode) params.push(likeNeedle(tckCode));
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
    res.json(mergeLegalReferences(supabaseRows, rows.map(mapLegalReference), limit));
  } catch (err) {
    console.error("Legal references error:", err);
    res.status(500).json({ error: "İçtihat kayıtları yüklenemedi." });
  }
});

app.post("/api/deep-search-jobs", async (req, res) => {
  try {
    const query = String(req.body?.query || "").trim();
    const tckCodeInput = normalizeTckCode(req.body?.tckCode || "");
    const legalRef = legalRefFromBody(req.body)
      || parseLegalReferenceInput(req.body?.legalRef || req.body?.reference || query, { defaultLawCode: tckCodeInput ? "TCK" : "" })
      || (tckCodeInput ? parseLegalReferenceInput(`TCK ${tckCodeInput}`, { defaultLawCode: "TCK" }) : null);
    const tckCode = legalRef?.law_no === "5237" && legalRef?.law_code === "TCK"
      ? formatArticlePath(legalRef)
      : tckCodeInput;
    const jobQuery = query || (legalRef ? labelLegalRef(legalRef) : (tckCode ? `TCK ${tckCode}` : ""));
    if (!jobQuery && !legalRef) {
      return res.status(400).json({ error: "Arama sorgusu veya mevzuat atfı gerekli." });
    }
    const id = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const tckTitle = tckCode ? await getTckTitleForSearch(tckCode) : "";
    const queryPlan = buildDeepSearchQueries(jobQuery, legalRef, tckTitle);
    const statusMessage = legalRef
      ? "Kuyruğa alındı. Dış indeks hazırsa kesin mevzuat atfı, alias ve yapısal varyasyonlar aranacak."
      : "Kuyruğa alındı. Dış indeks hazırsa serbest metin sorgusu Hugging Face arşivinde aranacak.";
    const estimatedSeconds = 180;
    await run(
      `INSERT INTO deep_search_jobs
        (id, query, tck_code, law_no, law_code, article, paragraph, subparagraph, canonical_ref, query_plan, status, progress_percent, estimated_seconds, status_message, matched_count, started_at, finished_at, error, retry_count, last_attempt_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        jobQuery,
        tckCode,
        legalRef?.law_no || "",
        legalRef?.law_code || "",
        legalRef?.article || "",
        legalRef?.paragraph || "",
        legalRef?.subparagraph || "",
        canonicalLegalRef(legalRef),
        JSON.stringify(queryPlan),
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
      query: jobQuery,
      tck_code: tckCode,
      law_no: legalRef?.law_no || "",
      law_code: legalRef?.law_code || "",
      article: legalRef?.article || "",
      paragraph: legalRef?.paragraph || "",
      subparagraph: legalRef?.subparagraph || "",
      canonical_ref: canonicalLegalRef(legalRef),
      query_plan: queryPlan,
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
