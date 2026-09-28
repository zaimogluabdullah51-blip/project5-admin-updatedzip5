// This module takes text only; HF metadata must never influence extraction.
const fold = (s) => String(s ?? "").toLocaleLowerCase("tr-TR").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i");

export function normalizeCourt(value) {
  return fold(value).replace(/\byargitay\b/g, "").replace(/\(kapatilan\)/g, "").replace(/[.:'’]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function isoDate(day, month, year) {
  const d = Number(day), m = Number(month), y = Number(year);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1800 || y > 2100 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function select(candidates) {
  candidates.sort((a, b) => b.score - a.score || b.start - a.start);
  const best = candidates[0];
  const ambiguous = best && candidates.some((c) => c.value !== best.value && c.score >= best.score - 5);
  return {
    value: best && !ambiguous ? best.value : null,
    confidence: !best || ambiguous ? "none" : best.score >= 90 ? "high" : "medium",
    source: "decision_text",
    flags: ambiguous ? ["conflicting_candidates"] : !best ? ["not_found_in_text"] : [],
    candidates
  };
}

export function parseDecisionMetadata(input) {
  const text = String(input ?? "").replace(/\r/g, " ");
  const normalized = fold(text);
  const courts = [], dates = [];
  const courtPattern = /^(?:\s*(?:t\.?\s*c\.?\s*)?)(?:(yargitay|danistay)\s*)?(?:\(kapatilan\)\s*)?((?:\d{1,2}\s*\.?\s*(?:hukuk|ceza)\s+dairesi)|(?:(?:hukuk|ceza)\s+(?:genel\s+kurulu|daireleri\s+baskanlar\s+kurulu))|(?:ictihatlari\s+birlestirme\s+(?:bgk|hukuk\s+genel\s+kurulu|ceza\s+genel\s+kurulu))|(?:\d{1,2}\s*\.\s*daire)|(?:anayasa\s+mahkemesi))/gm;
  for (const m of normalized.slice(0, 700).matchAll(courtPattern)) {
    const after = normalized.slice(m.index + m[0].length, m.index + m[0].length + 100);
    if (!/^\s*\d{4}\//.test(after) && (normalized.slice(0, m.index).trim() || !/^\s*(?:\n|$)/.test(after))) continue;
    const raw = text.slice(m.index, m.index + m[0].length).trim();
    courts.push({ value: normalizeCourt(raw), raw, start: m.index, rule: "decision_heading", score: 95 });
  }

  const headingEnd = normalized.indexOf("ictihat metni");
  function candidate(match, value) {
    if (!value) return;
    const start = match.index;
    const before = normalized.slice(Math.max(0, start - 55), start);
    const after = normalized.slice(start + match[0].length, start + match[0].length + 500);
    let rule, score;
    if (start < (headingEnd < 0 ? 350 : headingEnd) && /karar\s*tarihi\s*[:\-]?\s*$/.test(before)) {
      rule = "explicit_decision_date"; score = 100;
    } else if (start >= Math.max(0, text.length - 300) && /karar\s+verildi\s*[.,]?\s*$/.test(before)) {
      rule = "date_after_disposition"; score = 95;
    } else if (start >= Math.max(0, text.length - 1800) &&
      /^\s*(?:gunu|tarihinde)\s+yapilan\s+(?:ikinci|ucuncu|birinci)[\s\S]{0,320}?muzakereler[^.\n]{0,160}?karar\s+verildi\b/.test(after)) {
      rule = "multiple_deliberation_date"; score = 95;
    } else if (start >= Math.max(0, text.length - 1800) &&
      /^[\s,]*(?:tarihinde|tarihli|gununde|gunu|gun|tarihinde yapilan|tarihinde verilen)?[\s\S]{0,140}?karar\s+verildi\b/.test(after)) {
      // Reject dates introducing an older cited ruling rather than this disposition.
      if (/^\s*(?:tarihli|gun\s+ve|tarihinde\s+verilen|tarih(?:i|inden)?\s+itibar(?:iyle|iyla|en)|tarih(?:li|i)?\s+ve\b)/.test(after)) return;
      rule = "closing_decision_date"; score = 95;
    } else if (start >= Math.max(0, text.length - 600) &&
      /(?:onanmasina|bozulmasina|reddine|kabulune)[\s\S]{0,220}$/.test(normalized.slice(Math.max(0, start - 220), start)) &&
      /^[\s,]*(?:tarihinde|gununde|gunu)?\s*oy\s*(?:birligi|coklugu)/.test(after)) {
      rule = "closing_vote_date"; score = 85;
    }
    if (rule) dates.push({ value, raw: match[0], start, rule, score,
      context: text.slice(Math.max(0, start - 90), Math.min(text.length, start + 210)) });
  }
  for (const m of normalized.matchAll(/\b(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})(?=\b|gun(?:unde|u)\b|tarihinde\b)/g)) candidate(m, isoDate(m[1], m[2], m[3]));
  for (const m of normalized.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) candidate(m, isoDate(m[3], m[2], m[1]));
  const months = ["ocak", "subat", "mart", "nisan", "mayis", "haziran", "temmuz", "agustos", "eylul", "ekim", "kasim", "aralik"];
  for (const m of normalized.matchAll(new RegExp(`\\b(\\d{1,2})\\s+(${months.join("|")})\\s+(\\d{4})\\b`, "g"))) candidate(m, isoDate(m[1], months.indexOf(m[2]) + 1, m[3]));
  const decisionDate = select(dates);
  const headingYear = text.split("\n")[0].match(/\b((?:18|19|20)\d{2})\/\d+\s*K\b/)?.[1] || null;
  decisionDate.heading_decision_year = headingYear;
  if (dates.some((c) => c.rule === "multiple_deliberation_date") && new Set(dates.map((c) => c.value)).size > 1) {
    decisionDate.value = null;
    decisionDate.confidence = "none";
    decisionDate.flags = [...new Set([...decisionDate.flags, "conflicting_candidates", "multiple_deliberation_dates"])];
  }
  if (headingYear && dates.some((c) => c.value.slice(0, 4) !== headingYear)) {
    decisionDate.flags.push("decision_year_conflict");
    if (decisionDate.value) decisionDate.confidence = "low";
  }
  decisionDate.quality_status = decisionDate.flags.length ? "needs_review" : "supported_by_text";
  return { court: select(courts), decision_date: decisionDate };
}
