const STORAGE_KEY = "dcc_data";

function cleanName(str) {
  if (!str) return "";
  var s = str.replace(/^[\s\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF\u25CB\u2013\u2014\u2015\u2010\u2012\u2018\u2019\u201C\u201D\u00AB\u00BB\u2039\u203A*#\-]+/, "");
  s = s.replace(/^[\u2190-\u21FF\u2600-\u26FF\u2700-\u27BF\u2B50\u2B55\uFE0F\u200D\u20E3]+/, "");
  s = s.replace(/^(?:\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDDFF]|\uD83C[\uDDE0-\uDDFF])+/, "");
  return s.trim();
}

const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const menuItems = document.querySelectorAll(".menu-item[data-tab]");
const tabPanels = {
  cases: document.getElementById("tab-cases"),
  timeline: document.getElementById("tab-timeline"),
  profiles: document.getElementById("tab-profiles"),
  eylemler: document.getElementById("tab-eylemler"),
  tckmaddeleri: document.getElementById("tab-tckmaddeleri")
};

const caseForm = document.getElementById("case-form");
const caseList = document.getElementById("case-list");
const caseFormTitle = document.getElementById("case-form-title");
const caseFormReset = document.getElementById("case-form-reset");
const caseSubmitBtn = document.getElementById("case-submit-btn");
const judgeTypeSelect = document.getElementById("judge-type-select");
const judgeSingleFields = document.getElementById("judge-single-fields");
const judgePanelFields = document.getElementById("judge-panel-fields");

const profileForm = document.getElementById("profile-form");
const profileList = document.getElementById("profile-list");
const profileFormTitle = document.getElementById("profile-form-title");
const profileFormReset = document.getElementById("profile-form-reset");
const actionsContainer = document.getElementById("actions-container");

const parseInput = document.getElementById("parse-input");
const parseBtn = document.getElementById("parse-btn");
const clearBtn = document.getElementById("clear-btn");
const parseResults = document.getElementById("parse-results");
const activeCaseSelect = document.getElementById("active-case");

const eylemSummariesList = document.getElementById("eylem-summaries-list");
const eylemAddBtn = document.getElementById("eylem-add-btn");
const eylemSaveBtn = document.getElementById("eylem-save-btn");
const eylemBulkPaste = document.getElementById("eylem-bulk-paste");
const eylemBulkParseBtn = document.getElementById("eylem-bulk-parse-btn");
const eylemCaseSelect = document.getElementById("eylem-case-select");
const eylemStructuredPaste = document.getElementById("eylem-structured-paste");
const eylemStructuredParseBtn = document.getElementById("eylem-structured-parse-btn");
const eylemStructuredImportBtn = document.getElementById("eylem-structured-import-btn");
const eylemStructuredPreview = document.getElementById("eylem-structured-preview");
const eylemEditorList = document.getElementById("eylem-editor-list");
const eylemEditorEmpty = document.getElementById("eylem-editor-empty");
const eylemEditorNewBtn = document.getElementById("eylem-editor-new-btn");
const eylemEditorNum = document.getElementById("eylem-editor-num");
const eylemEditorSummary = document.getElementById("eylem-editor-summary");
const eylemEditorPeople = document.getElementById("eylem-editor-people");
const eylemEditorRelations = document.getElementById("eylem-editor-relations");
const eylemEditorSaveBtn = document.getElementById("eylem-editor-save-btn");
const eylemEditorDeleteBtn = document.getElementById("eylem-editor-delete-btn");

const timelineCaseSelect = document.getElementById("timeline-case-select");
const timelineEnabled = document.getElementById("timeline-enabled");
const timelineParserInput = document.getElementById("timeline-parser-input");
const timelineParseBtn = document.getElementById("timeline-parse-btn");
const timelineClearBtn = document.getElementById("timeline-clear-btn");
const timelineEventList = document.getElementById("timeline-event-list");
const timelineEditDate = document.getElementById("timeline-edit-date");
const timelineEditIncident = document.getElementById("timeline-edit-incident");
const timelineUpdateBtn = document.getElementById("timeline-update-btn");
const timelineDeleteBtn = document.getElementById("timeline-delete-btn");
const timelinePreview = document.getElementById("timeline-preview");
const timelinePreviewBtn = document.getElementById("timeline-preview-btn");
const timelineSaveBtn = document.getElementById("timeline-save-btn");
const timelineSaveStatus = document.getElementById("timeline-save-status");

const tckInput = document.getElementById("tck-input");
const tckAddBtn = document.getElementById("tck-add-btn");
const tckChips = document.getElementById("tck-chips");
const actionInput = document.getElementById("action-input");
const actionAddBtn = document.getElementById("action-add-btn");
const actionChips = document.getElementById("action-chips");
const tckAdminCode = document.getElementById("tck-admin-code");
const tckAdminShort = document.getElementById("tck-admin-short");
const tckAdminFull = document.getElementById("tck-admin-full");
const tckAdminSaveBtn = document.getElementById("tck-admin-save-btn");
const tckAdminResetBtn = document.getElementById("tck-admin-reset-btn");
const tckAdminList = document.getElementById("tck-admin-list");
const tckAdminBulkPaste = document.getElementById("tck-admin-bulk-paste");
const tckAdminBulkParseBtn = document.getElementById("tck-admin-bulk-parse-btn");
const tckAdminBulkImportBtn = document.getElementById("tck-admin-bulk-import-btn");
const tckAdminBulkPreview = document.getElementById("tck-admin-bulk-preview");

let lastParsed = null;
let currentTckCodes = [];
let currentActionNums = [];
let cachedServerCases = [];
let cachedServerPeople = [];
let cachedCasePeople = [];
let cachedTckDefinitions = [];
let timelineDraftEvents = [];
let timelineSelectedIndex = -1;
let parsedStructuredEylems = [];
let selectedEylemNum = "";
let editingTckCode = "";
let parsedTckBulkItems = [];
let activeInlineTckCode = "";

async function loadTckDefinitions() {
  try {
    const res = await fetch("/api/tck-definitions");
    if (res.ok) cachedTckDefinitions = await res.json();
    renderTckAdminList();
  } catch (e) {}
}

function normalizeTckCodeInput(value) {
  return String(value || "")
    .trim()
    .replace(/^TCK\s*/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function getDefinedTckCodeSet() {
  return new Set((cachedTckDefinitions || []).map((d) => normalizeTckCodeInput(d.code)).filter(Boolean));
}

function sanitizeKnownTckCodes(values) {
  const defined = getDefinedTckCodeSet();
  const seen = new Set();
  const out = [];
  for (const raw of (Array.isArray(values) ? values : [])) {
    const normalized = normalizeTckCodeInput(raw);
    if (!normalized || !defined.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(`TCK ${normalized}`);
  }
  return out;
}

function sanitizeAccusationTckCodes(accusations) {
  if (!Array.isArray(accusations)) return [];
  const defined = getDefinedTckCodeSet();
  return accusations.map((acc) => {
    const seen = new Set();
    const filtered = [];
    for (const raw of (Array.isArray(acc?.tckCodes) ? acc.tckCodes : [])) {
      const normalized = normalizeTckCodeInput(raw);
      if (!normalized || !defined.has(normalized) || seen.has(normalized)) continue;
      seen.add(normalized);
      filtered.push(`TCK ${normalized}`);
    }
    return { ...acc, tckCodes: filtered };
  });
}

function deriveShortDesc(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const firstLine = raw.split(/\n/).map((l) => l.trim()).find(Boolean) || raw;
  return firstLine.slice(0, 140);
}

function resetTckAdminForm() {
  editingTckCode = "";
  if (tckAdminCode) {
    tckAdminCode.value = "";
    tckAdminCode.disabled = false;
  }
  if (tckAdminShort) tckAdminShort.value = "";
  if (tckAdminFull) tckAdminFull.value = "";
}

function editTckDefinition(code) {
  activeInlineTckCode = String(code || "");
  renderTckAdminList();
}

async function saveInlineTckDefinition(code) {
  const safeCode = String(code).replace(/"/g, '\\"');
  const textarea = document.querySelector(`textarea[data-inline-tck-code="${safeCode}"]`);
  const shortInput = document.querySelector(`input[data-inline-tck-short="${safeCode}"]`);
  if (!textarea) return;
  const fullText = String(textarea.value || "").trim();
  if (!fullText) {
    alert("Tam açıklama boş olamaz.");
    return;
  }
  const shortDesc = String((shortInput && shortInput.value) || "").trim() || deriveShortDesc(fullText);
  try {
    const res = await fetch(`/api/tck-definitions/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ short_desc: shortDesc, full_text: fullText })
    });
    if (!res.ok) throw new Error("Kaydetme hatası");
    activeInlineTckCode = "";
    await loadTckDefinitions();
    alert(`TCK ${code} güncellendi.`);
  } catch (err) {
    alert("TCK maddesi güncellenemedi.");
  }
}

function renderTckAdminList() {
  if (!tckAdminList) return;
  if (!Array.isArray(cachedTckDefinitions) || cachedTckDefinitions.length === 0) {
    tckAdminList.innerHTML = `<div class="muted">Henüz TCK maddesi tanımlanmamış.</div>`;
    return;
  }
  const rows = [...cachedTckDefinitions].sort((a, b) => {
    const ab = String(a.code || "").replace(/^TCK\s*/i, "");
    const bb = String(b.code || "").replace(/^TCK\s*/i, "");
    const ai = parseInt(ab.split("/")[0], 10);
    const bi = parseInt(bb.split("/")[0], 10);
    if (!isNaN(ai) && !isNaN(bi) && ai !== bi) return ai - bi;
    return ab.localeCompare(bb);
  });
  const dupCounts = new Map();
  rows.forEach((r) => {
    const key = normalizeTckCodeInput(r.code);
    dupCounts.set(key, (dupCounts.get(key) || 0) + 1);
  });

  tckAdminList.innerHTML = rows.map((row) => `
    <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; padding:8px 0; border-bottom:1px solid rgba(148,163,184,.2);">
      <div>
        <div style="font-weight:600; ${((dupCounts.get(normalizeTckCodeInput(row.code)) || 0) > 1) ? "color:#ef4444;" : ""}">
          TCK ${row.code || ""}
          ${((dupCounts.get(normalizeTckCodeInput(row.code)) || 0) > 1) ? '<span style="font-size:.75rem; margin-left:6px;">(DUPLICATE)</span>' : ""}
        </div>
        <div class="muted" style="font-size:.85rem;">${row.short_desc || deriveShortDesc(row.full_text) || "Açıklama yok"}</div>
        ${activeInlineTckCode === String(row.code) ? `
          <div style="margin-top:8px;">
            <input data-inline-tck-short="${(row.code || "").replace(/"/g, "&quot;")}" value="${(row.short_desc || "").replace(/"/g, "&quot;")}" placeholder="Özet" style="width:100%; margin-bottom:6px;" />
            <textarea data-inline-tck-code="${(row.code || "").replace(/"/g, "&quot;")}" rows="5" style="width:100%;">${(row.full_text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
            <div style="display:flex; gap:6px; margin-top:6px;">
              <button type="button" class="btn primary tck-admin-inline-save-btn" data-code="${(row.code || "").replace(/"/g, "&quot;")}">Kaydet</button>
              <button type="button" class="btn ghost tck-admin-inline-cancel-btn">İptal</button>
            </div>
          </div>
        ` : ""}
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" class="btn ghost tck-admin-edit-btn" data-code="${(row.code || "").replace(/"/g, "&quot;")}">Düzenle</button>
        <button type="button" class="btn ghost tck-admin-delete-btn" data-code="${(row.code || "").replace(/"/g, "&quot;")}">Sil</button>
      </div>
    </div>
  `).join("");

  tckAdminList.querySelectorAll(".tck-admin-edit-btn").forEach((btn) => {
    btn.addEventListener("click", () => editTckDefinition(btn.getAttribute("data-code") || ""));
  });
  tckAdminList.querySelectorAll(".tck-admin-inline-save-btn").forEach((btn) => {
    btn.addEventListener("click", () => saveInlineTckDefinition(btn.getAttribute("data-code") || ""));
  });
  tckAdminList.querySelectorAll(".tck-admin-inline-cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeInlineTckCode = "";
      renderTckAdminList();
    });
  });
  tckAdminList.querySelectorAll(".tck-admin-delete-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const code = btn.getAttribute("data-code") || "";
      if (!code) return;
      if (!confirm(`TCK ${code} silinsin mi?`)) return;
      try {
        const res = await fetch(`/api/tck-definitions/${encodeURIComponent(code)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Silme hatası");
        await loadTckDefinitions();
        if (editingTckCode === code) resetTckAdminForm();
      } catch (err) {
        alert("TCK maddesi silinemedi.");
      }
    });
  });
}

function parseTckBulkText(text) {
  const raw = String(text || "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  const byCode = new Map();
  const pushText = (code, line) => {
    const c = normalizeTckCodeInput(code);
    const txt = String(line || "").trim();
    if (!c || !txt) return;
    if (!byCode.has(c)) byCode.set(c, []);
    byCode.get(c).push(txt);
  };

  let currentMadde = "";
  let currentClause = "";
  let currentSub = "";
  let lastHeader = "";

  const isNoiseLine = (line) => /^\d+\s+Bu Kanunun/i.test(line);
  const getCurrentCode = () => {
    if (currentMadde && currentClause && currentSub) return `${currentMadde}/${currentClause}-${currentSub}`;
    if (currentMadde && currentClause) return `${currentMadde}/${currentClause}`;
    return currentMadde;
  };

  const maddeRegex = /^Madde\s+(\d+)\s*-\s*(.*)$/i;
  const clauseRegex = /^\((\d+)\)\s*(.*)$/;
  const subRegex = /^([a-zçğıöşü])\)\s*(.*)$/i;

  lines.forEach((rawLine) => {
    const line = String(rawLine || "").trim();
    if (!line) return;
    if (isNoiseLine(line)) return;

    const maddeMatch = line.match(maddeRegex);
    if (maddeMatch) {
      currentMadde = maddeMatch[1];
      currentClause = "";
      currentSub = "";
      if (lastHeader) pushText(currentMadde, lastHeader);
      const maddeLine = `Madde ${currentMadde}-${maddeMatch[2] ? ` ${maddeMatch[2]}` : ""}`.trim();
      pushText(currentMadde, maddeLine);
      return;
    }

    const clauseMatch = line.match(clauseRegex);
    if (clauseMatch && currentMadde) {
      currentClause = clauseMatch[1];
      currentSub = "";
      const clauseLine = `(${currentClause})${clauseMatch[2] ? ` ${clauseMatch[2]}` : ""}`.trim();
      pushText(currentMadde, clauseLine);
      pushText(`${currentMadde}/${currentClause}`, clauseLine);
      return;
    }

    const subMatch = line.match(subRegex);
    if (subMatch && currentMadde) {
      if (!currentClause) currentClause = "1";
      currentSub = String(subMatch[1] || "").toLowerCase();
      const subLine = `${currentSub})${subMatch[2] ? ` ${subMatch[2]}` : ""}`.trim();
      pushText(currentMadde, subLine);
      pushText(`${currentMadde}/${currentClause}-${currentSub}`, subLine);
      return;
    }

    // Legacy fallback format: TCK 314/2 ... (for compatibility)
    const tckMatch = line.match(/^TCK\s+([^\n:]+)\s*:?\s*(.*)$/i);
    if (tckMatch) {
      const c = normalizeTckCodeInput(tckMatch[1]);
      if (tckMatch[2]) pushText(c, tckMatch[2]);
      currentMadde = "";
      currentClause = "";
      currentSub = "";
      return;
    }

    const currentCode = getCurrentCode();
    if (currentCode) {
      pushText(currentCode, line);
      if (currentMadde && currentCode !== currentMadde) {
        pushText(currentMadde, line);
      }
    } else {
      lastHeader = line;
    }
  });

  const out = [...byCode.entries()].map(([code, chunks]) => {
    const fullText = chunks.join("\n").trim();
    return { code, full_text: fullText, short_desc: deriveShortDesc(fullText) };
  });

  const parseCode = (code) => {
    const m = String(code).match(/^(\d+)(?:\/(\d+))?(?:-([a-zçğıöşü]))?$/i);
    if (!m) return { article: Number.MAX_SAFE_INTEGER, clause: Number.MAX_SAFE_INTEGER, sub: "zzzz" };
    return {
      article: parseInt(m[1], 10),
      clause: m[2] ? parseInt(m[2], 10) : 0,
      sub: m[3] ? String(m[3]).toLowerCase() : ""
    };
  };

  out.sort((a, b) => {
    const pa = parseCode(a.code);
    const pb = parseCode(b.code);
    if (pa.article !== pb.article) return pa.article - pb.article;
    if (pa.clause !== pb.clause) return pa.clause - pb.clause;
    return pa.sub.localeCompare(pb.sub);
  });

  return out;
}

function renderTckBulkPreview(items) {
  if (!tckAdminBulkPreview) return;
  if (!items.length) {
    tckAdminBulkPreview.innerHTML = `<div class="muted">Ayrıştırılacak TCK maddesi bulunamadı.</div>`;
    return;
  }
  tckAdminBulkPreview.innerHTML = items.map((it) => `
    <div style="border:1px solid rgba(148,163,184,.25); border-radius:8px; padding:8px; margin-bottom:8px;">
      <div style="font-weight:600;">TCK ${it.code}</div>
      <div class="muted" style="font-size:.85rem;">${it.short_desc || "Açıklama yok"}</div>
    </div>
  `).join("");
}

function setupAutocomplete(inputEl, getSuggestions, onSelect, opts = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "autocomplete-wrapper";
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);

  const dropdown = document.createElement("div");
  dropdown.className = "autocomplete-dropdown";
  wrapper.appendChild(dropdown);

  let activeIndex = -1;
  let currentItems = [];

  function renderDropdown(items) {
    currentItems = items;
    activeIndex = -1;
    dropdown.innerHTML = "";
    if (!items.length) {
      dropdown.classList.remove("visible");
      return;
    }
    items.forEach((item, i) => {
      const div = document.createElement("div");
      div.className = "autocomplete-item";
      div.innerHTML = item.html || `<span>${item.label}</span>`;
      div.addEventListener("mousedown", (e) => {
        e.preventDefault();
        onSelect(item);
        inputEl.value = opts.clearOnSelect ? "" : (item.fillValue || item.label);
        dropdown.classList.remove("visible");
      });
      dropdown.appendChild(div);
    });
    dropdown.classList.add("visible");
  }

  inputEl.addEventListener("input", () => {
    const val = inputEl.value.trim();
    if (val.length < (opts.minLength || 1)) {
      dropdown.classList.remove("visible");
      return;
    }
    const items = getSuggestions(val);
    renderDropdown(items);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (!dropdown.classList.contains("visible")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
      updateActive();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive();
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      e.stopPropagation();
      const item = currentItems[activeIndex];
      if (item) {
        onSelect(item);
        inputEl.value = opts.clearOnSelect ? "" : (item.fillValue || item.label);
        dropdown.classList.remove("visible");
      }
    } else if (e.key === "Escape") {
      dropdown.classList.remove("visible");
    }
  });

  function updateActive() {
    dropdown.querySelectorAll(".autocomplete-item").forEach((el, i) => {
      el.classList.toggle("active", i === activeIndex);
    });
  }

  inputEl.addEventListener("blur", () => {
    setTimeout(() => dropdown.classList.remove("visible"), 150);
  });

  inputEl.addEventListener("focus", () => {
    const val = inputEl.value.trim();
    if (val.length >= (opts.minLength || 1)) {
      const items = getSuggestions(val);
      renderDropdown(items);
    }
  });

  return { wrapper, dropdown };
}

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return text.slice(0, idx) + '<span class="ac-highlight">' + text.slice(idx, idx + query.length) + '</span>' + text.slice(idx + query.length);
}

const roleLabelsMap = {
  defendant: "Sanık", informant: "İtirafçı", witness: "Tanık",
  secretWitness: "Gizli Tanık", victim: "Mağdur", fugitive: "Firari", detained: "Tutuklu"
};

const timelineUtils = window.TimelineUtils || {
  DEFAULT_TRANSITION_YEAR: 2016,
  FEATURED_TRANSITION_PAGE: 657,
  toIsoDate: (d) => String(d || "").trim(),
  formatDate: (d) => String(d || ""),
  parseTimelineText: () => [],
  formatTimelineText: () => "",
  coerceTimelineConfig: (raw) => ({
    enabled: !!(raw && raw.enabled),
    transitionYear: 2016,
    events: Array.isArray(raw && raw.events) ? raw.events : []
  }),
  toneForEvent: () => "cold",
  isFeaturedTransitionEvent: () => false
};

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = { cases: [], actions: [], profiles: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { cases: [], actions: [], profiles: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function setSection(tab) {
  menuItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  Object.keys(tabPanels).forEach((key) => {
    const panel = tabPanels[key];
    if (panel) panel.classList.toggle("active-tab", key === tab);
  });
}

function fillSelect(select, items, labelKey = "title") {
  if (!select) return;
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item[labelKey];
    select.appendChild(option);
  });
}

judgeTypeSelect.addEventListener("change", () => {
  const isPanel = judgeTypeSelect.value === "panel";
  judgeSingleFields.style.display = isPanel ? "none" : "block";
  judgePanelFields.style.display = isPanel ? "block" : "none";
});

async function deleteCase(id) {
  if (!confirm("Bu davayı silmek istediğinize emin misiniz?\nDavaya bağlı tüm profil bağlantıları ve suçlama kayıtları da silinecektir.")) return;
  try {
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
  } catch (e) {}
  const data = loadData();
  data.cases = data.cases.filter((c) => c.id !== id);
  saveData(data);
  resetCaseForm();
  sync();
}

async function deleteProfile(id) {
  if (!confirm("Bu profili silmek istediğinize emin misiniz?")) return;
  try {
    await fetch(`/api/people/${id}`, { method: "DELETE" });
  } catch (e) {}
  const data = loadData();
  data.profiles = data.profiles.filter((p) => p.id !== id);
  saveData(data);
  resetProfileForm();
  sync();
}

function editCase(c) {
  caseFormTitle.textContent = `Düzenleniyor: ${c.title}`;
  caseFormReset.style.display = "inline-block";
  caseSubmitBtn.textContent = "Güncelle";
  setInput(caseForm, "editId", c.id);
  setInput(caseForm, "title", c.title);
  setInput(caseForm, "summary", c.summary);
  setInput(caseForm, "sorusturmaNo", c.sorusturma_no || c.sorusturmaNo || "");
  setInput(caseForm, "caseNumber", c.case_number || c.caseNumber || "");
  setInput(caseForm, "iddianameNo", c.iddianame_no || c.iddianameNo || "");
  setInput(caseForm, "courtName", c.court_name || c.courtName || "");
  setInput(caseForm, "indictmentProsecutor", c.indictment_prosecutor || c.indictmentProsecutor || c.prosecutor || "");
  setInput(caseForm, "trialProsecutor", c.trial_prosecutor || c.trialProsecutor || "");

  const jType = c.judge_type || c.judgeType || "single";
  setInput(caseForm, "judgeType", jType);
  judgeTypeSelect.value = jType;
  judgeTypeSelect.dispatchEvent(new Event("change"));

  setInput(caseForm, "judgeName", c.judge_name || c.judgeName || c.judge || "");
  setInput(caseForm, "panelPresident", c.panel_president || c.panelPresident || "");
  setInput(caseForm, "panelMembers", c.panel_members || c.panelMembers || c.court_panel || "");

  setInput(caseForm, "acceptanceDate", c.acceptance_date || c.acceptanceDate || c.date || "");
  setInput(caseForm, "indictmentDate", c.indictment_date || c.indictmentDate || "");
  setInput(caseForm, "verdictDate", c.verdict_date || c.verdictDate || "");
  setInput(caseForm, "status", c.status || "Kovuşturma (Devam Ediyor)");

  const statusSelect = caseForm.querySelector('[name="status"]');
  if (statusSelect) statusSelect.value = c.status || "Kovuşturma (Devam Ediyor)";

  if (timelineCaseSelect && c && c.id) {
    timelineCaseSelect.value = c.id;
    localStorage.setItem("dcc_admin_timeline_case", c.id);
    loadTimelineEditor(c.id);
  }

  caseForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetCaseForm() {
  caseForm.reset();
  setInput(caseForm, "editId", "");
  caseFormTitle.textContent = "Dava Oluştur";
  caseFormReset.style.display = "none";
  caseSubmitBtn.textContent = "Kaydet";
  judgeTypeSelect.value = "single";
  judgeTypeSelect.dispatchEvent(new Event("change"));
}

async function editProfile(p) {
  profileFormTitle.textContent = `Düzenleniyor: ${p.name}`;
  profileFormReset.style.display = "inline-block";

  setInput(profileForm, "editId", p.id);
  setInput(profileForm, "name", p.name);
  setInput(profileForm, "organization", p.organization || "");
  setInput(profileForm, "title", p.title || "");
  setInput(profileForm, "summary", p.charge || p.summary || "");
  setInput(profileForm, "sentenceDemand", p.sentence_demand || p.sentenceDemand || "");
  setInput(profileForm, "photo", p.photo_url || p.photo || "");
  const hierarchy = p.hierarchy || {};
  setInput(profileForm, "hierarchySuperiors", stringifyHierarchyList(hierarchy.superiors));
  setInput(profileForm, "hierarchySubordinates", stringifyHierarchyList(hierarchy.subordinates));

  setRoleCheckboxes(p.role || "defendant");

  const tckArticles = Array.isArray(p.tck_articles) ? p.tck_articles : [];
  currentTckCodes = sanitizeKnownTckCodes(tckArticles);
  renderTckChips();

  const actionNums = Array.isArray(p.action_numbers) ? p.action_numbers : [];
  currentActionNums = [...actionNums];
  renderActionChips();

  actionsContainer.innerHTML = "";

  try {
    const caseId = activeCaseSelect.value;
    const actionsRes = await fetch(`/api/actions?personId=${p.id}${caseId ? '&caseId=' + caseId : ''}`);
    if (actionsRes.ok) {
      const actions = await actionsRes.json();
      if (actions.length > 0) {
        lastParsed = {
          summary: p.charge || p.summary || "",
          sentenceDemand: p.sentence_demand || p.sentenceDemand || "",
          tckCodes: [...currentTckCodes],
          actionNumbers: [...currentActionNums],
          profiles: [{ name: p.name, role: p.role || "defendant", organization: p.organization || "", title: p.title || "" }],
          accusations: actions.map(a => ({
            title: a.title || "",
            actionNums: a.action_num ? a.action_num.split(",").map(n => n.trim()).filter(Boolean) : [],
            tckCodes: sanitizeKnownTckCodes(Array.isArray(a.tck_codes) ? a.tck_codes : []),
            claim: a.claim || "",
            evidence: a.evidence || "",
            defense: a.defense || "",
            mentionedNames: Array.isArray(a.mentioned_names) ? a.mentioned_names : []
          }))
        };
        renderActionCards(lastParsed);
      } else {
        lastParsed = null;
      }
    } else {
      lastParsed = null;
    }
  } catch (e) {
    lastParsed = null;
  }

  profileForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetProfileForm() {
  profileForm.reset();
  setInput(profileForm, "editId", "");
  profileFormTitle.textContent = "Profil Ekle";
  profileFormReset.style.display = "none";
  actionsContainer.innerHTML = "";
  parseResults.innerHTML = "";
  lastParsed = null;
  currentTckCodes = [];
  currentActionNums = [];
  renderTckChips();
  renderActionChips();
  clearRoleCheckboxes();
}

caseFormReset.addEventListener("click", resetCaseForm);
profileFormReset.addEventListener("click", resetProfileForm);

function renderLists(data, serverCases, serverPeople) {
  caseList.innerHTML = "";
  const casesToRender = serverCases && serverCases.length > 0 ? serverCases : data.cases;
  casesToRender.forEach((c) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const editId = caseForm.querySelector('[name="editId"]').value;
    if (editId === c.id) div.classList.add("list-item-active");
    const defCount = c.defendantCount || 0;
    const dateLabel = c.acceptance_date || c.date || "";
    div.innerHTML = `<div class="list-item-content"><strong>${c.title}</strong><br /><span class="muted">${c.case_number || c.caseNumber || ''}</span><span class="list-item-meta">${defCount} sanık${dateLabel ? ' · Kabul: ' + dateLabel : ''}</span></div><button class="btn-delete" title="Sil">&times;</button>`;
    div.querySelector(".list-item-content").addEventListener("click", () => editCase(c));
    div.querySelector(".btn-delete").addEventListener("click", (e) => { e.stopPropagation(); deleteCase(c.id); });
    caseList.appendChild(div);
  });

  profileList.innerHTML = "";
  const profilesToRender = serverPeople && serverPeople.length > 0 ? serverPeople : data.profiles;
  profilesToRender.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const editId = profileForm.querySelector('[name="editId"]').value;
    if (editId === p.id) div.classList.add("list-item-active");
    div.innerHTML = `<div class="list-item-content"><strong>${p.name}</strong><br /><span class="muted">${p.role || ''}</span></div><button class="btn-delete" title="Sil">&times;</button>`;
    div.querySelector(".list-item-content").addEventListener("click", () => editProfile(p));
    div.querySelector(".btn-delete").addEventListener("click", (e) => { e.stopPropagation(); deleteProfile(p.id); });
    profileList.appendChild(div);
  });
}

function renderFilteredProfiles(casePeople) {
  profileList.innerHTML = "";
  if (!casePeople || casePeople.length === 0) {
    profileList.innerHTML = `<div class="muted" style="padding:12px;text-align:center;">Bu davada kayıtlı profil yok</div>`;
    return;
  }
  casePeople.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const editId = profileForm.querySelector('[name="editId"]').value;
    if (editId === p.id) div.classList.add("list-item-active");
    div.innerHTML = `<div class="list-item-content"><strong>${p.name}</strong><br /><span class="muted">${p.role || ''}</span></div><button class="btn-delete" title="Sil">&times;</button>`;
    div.querySelector(".list-item-content").addEventListener("click", () => editProfile(p));
    div.querySelector(".btn-delete").addEventListener("click", (e) => { e.stopPropagation(); deleteProfile(p.id); });
    profileList.appendChild(div);
  });
}

async function loadServerCases() {
  try {
    const res = await fetch("/api/cases");
    if (res.ok) return await res.json();
  } catch (e) {}
  return [];
}

async function loadServerPeople() {
  try {
    const res = await fetch("/api/people");
    if (res.ok) return await res.json();
  } catch (e) {}
  return [];
}

async function loadCasePeople(caseId) {
  if (!caseId) return [];
  try {
    const res = await fetch(`/api/cases/${caseId}`);
    if (res.ok) {
      const data = await res.json();
      return data.people || [];
    }
  } catch (e) {}
  return [];
}

async function sync() {
  const data = loadData();
  cachedServerCases = await loadServerCases();
  cachedServerPeople = await loadServerPeople();

  renderLists(data, cachedServerCases, cachedServerPeople);

  const casesToUse = cachedServerCases.length > 0 ? cachedServerCases : data.cases;

  if (casesToUse.length > 0) {
    activeCaseSelect.innerHTML = "";
    casesToUse.forEach((c) => {
      const option1 = document.createElement("option");
      option1.value = c.id;
      option1.textContent = c.title;
      activeCaseSelect.appendChild(option1);
    });
  } else {
    fillSelect(activeCaseSelect, data.cases, "title");
  }

  const savedCaseId = localStorage.getItem("dcc_admin_active_case");
  if (savedCaseId && casesToUse.find(c => c.id === savedCaseId)) {
    activeCaseSelect.value = savedCaseId;
  }

  const caseId = activeCaseSelect.value;
  if (caseId) {
    localStorage.setItem("dcc_admin_active_case", caseId);
    cachedCasePeople = await loadCasePeople(caseId);
    renderFilteredProfiles(cachedCasePeople);
  }

  if (eylemCaseSelect) {
    const prevEylemCase = eylemCaseSelect.value;
    eylemCaseSelect.innerHTML = "";
    casesToUse.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.title;
      eylemCaseSelect.appendChild(opt);
    });
    if (prevEylemCase) eylemCaseSelect.value = prevEylemCase;
    const selectedEylemCase = eylemCaseSelect.value;
    if (selectedEylemCase) loadEylemSummaries(selectedEylemCase);
  }

  if (timelineCaseSelect) {
    const prevTimelineCase = timelineCaseSelect.value || localStorage.getItem("dcc_admin_timeline_case");
    timelineCaseSelect.innerHTML = "";
    casesToUse.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.title;
      timelineCaseSelect.appendChild(opt);
    });
    if (prevTimelineCase && casesToUse.some((c) => c.id === prevTimelineCase)) {
      timelineCaseSelect.value = prevTimelineCase;
    }
    if (timelineCaseSelect.value) {
      localStorage.setItem("dcc_admin_timeline_case", timelineCaseSelect.value);
      await loadTimelineEditor(timelineCaseSelect.value);
    } else {
      clearTimelineEditor();
    }
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clearTimelineEditor() {
  if (!timelineEnabled || !timelinePreview) return;
  timelineEnabled.checked = false;
  if (timelineParserInput) timelineParserInput.value = "";
  if (timelineEditDate) timelineEditDate.value = "";
  if (timelineEditIncident) timelineEditIncident.value = "";
  timelineDraftEvents = [];
  timelineSelectedIndex = -1;
  renderTimelineEventList();
  timelinePreview.innerHTML = `<p class="timeline-preview-empty">Önizleme için zaman çizelgesi satırları girin.</p>`;
  if (timelineSaveStatus) timelineSaveStatus.textContent = "";
}

function buildTimelineDescription(event) {
  const title = String(event.title || "").trim();
  const note = String(event.note || "").trim();
  return [title, note].filter(Boolean).join(" — ").trim();
}

function sortTimelineDraft() {
  const sortKey = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return Number.MAX_SAFE_INTEGER;
    const m = raw.match(/^(\d{4})(?:-(\d{2})-(\d{2}))?$/);
    if (!m) return Number.MAX_SAFE_INTEGER - 1;
    const year = parseInt(m[1], 10);
    const month = m[2] ? parseInt(m[2], 10) : 1;
    const day = m[3] ? parseInt(m[3], 10) : 1;
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return Number.MAX_SAFE_INTEGER - 2;
    }
    return year * 10000 + month * 100 + day;
  };
  timelineDraftEvents.sort((a, b) => {
    const ka = sortKey(a.date);
    const kb = sortKey(b.date);
    if (ka !== kb) return ka - kb;
    return String(a.date || "").localeCompare(String(b.date || ""));
  });
}

function syncParserInputFromDraft() {
  if (!timelineParserInput) return;
  timelineParserInput.value = timelineDraftEvents
    .map((event) => `${event.date} | ${buildTimelineDescription(event) || "-"}`)
    .join("\n");
}

function renderTimelineEventList() {
  if (!timelineEventList) return;
  if (!timelineDraftEvents.length) {
    timelineEventList.innerHTML = `<p class="timeline-preview-empty">Ayrıştırıldıktan sonra tarihler burada listelenir.</p>`;
    return;
  }

  timelineEventList.innerHTML = "";
  timelineDraftEvents.forEach((event, index) => {
    const item = document.createElement("div");
    item.className = "timeline-event-item";
    if (index === timelineSelectedIndex) item.classList.add("active");
    item.innerHTML = `
      <div class="timeline-event-main">
        <div class="timeline-event-date">${escapeHtml(timelineUtils.formatDate(event.date))}</div>
        <div class="timeline-event-desc">${escapeHtml(buildTimelineDescription(event) || "—")}</div>
      </div>
      <button type="button" class="timeline-event-remove" aria-label="Olayı sil">−</button>
    `;
    item.addEventListener("click", () => {
      timelineSelectedIndex = index;
      if (timelineEditDate) timelineEditDate.value = event.date || "";
      if (timelineEditIncident) timelineEditIncident.value = buildTimelineDescription(event);
      renderTimelineEventList();
    });
    const removeBtn = item.querySelector(".timeline-event-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        timelineDraftEvents.splice(index, 1);
        if (!timelineDraftEvents.length) {
          timelineSelectedIndex = -1;
        } else if (timelineSelectedIndex >= timelineDraftEvents.length) {
          timelineSelectedIndex = timelineDraftEvents.length - 1;
        }
        syncParserInputFromDraft();
        selectTimelineEvent(timelineSelectedIndex);
        renderTimelinePreview(getTimelineConfigFromForm());
        if (timelineSaveStatus) timelineSaveStatus.textContent = "Olay silindi.";
      });
    }
    timelineEventList.appendChild(item);
  });
}

function parseTimelineLines(rawText) {
  const text = String(rawText || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text) return [];

  // Supports both line-based input and single-paragraph chained records:
  // YYYY-MM-DD | description ... YYYY-MM-DD | next description ...
  const tokenRegex = /\b(\d{4}(?:-\d{2}-\d{2})?)\s*\|/g;
  const tokens = Array.from(text.matchAll(tokenRegex));
  if (!tokens.length) return [];

  const parsed = [];
  for (let i = 0; i < tokens.length; i++) {
    const rawDate = tokens[i][1];
    const tokenStart = tokens[i].index || 0;
    const contentStart = tokenStart + tokens[i][0].length;
    const contentEnd = i + 1 < tokens.length ? (tokens[i + 1].index || text.length) : text.length;

    const date = timelineUtils.toIsoDate ? timelineUtils.toIsoDate(rawDate) : String(rawDate || "").trim();
    const description = text
      .slice(contentStart, contentEnd)
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/\s([,.;:!?])/g, "$1")
      .trim();

    if (!date || !description) continue;
    parsed.push({
      date,
      type: "incident",
      title: description,
      note: "",
      page: null
    });
  }

  return parsed;
}

function selectTimelineEvent(index) {
  timelineSelectedIndex = index;
  const event = timelineDraftEvents[index];
  if (!event) {
    if (timelineEditDate) timelineEditDate.value = "";
    if (timelineEditIncident) timelineEditIncident.value = "";
    renderTimelineEventList();
    return;
  }
  if (timelineEditDate) timelineEditDate.value = event.date || "";
  if (timelineEditIncident) timelineEditIncident.value = buildTimelineDescription(event);
  renderTimelineEventList();
}

function parseTimelineFromTextArea() {
  const parsed = parseTimelineLines(timelineParserInput ? timelineParserInput.value : "");
  if (!parsed.length) {
    if (timelineSaveStatus) timelineSaveStatus.textContent = "Geçerli satır bulunamadı.";
    return;
  }

  const byKey = new Map();
  timelineDraftEvents.forEach((event) => {
    const key = `${String(event.date || "").trim()}||${String(event.title || "").trim()}`;
    byKey.set(key, event);
  });
  parsed.forEach((event) => {
    const key = `${String(event.date || "").trim()}||${String(event.title || "").trim()}`;
    byKey.set(key, event);
  });
  timelineDraftEvents = [...byKey.values()];

  sortTimelineDraft();
  const lastParsed = parsed[parsed.length - 1];
  const lastParsedKey = `${String(lastParsed.date || "").trim()}||${String(lastParsed.title || "").trim()}`;
  timelineSelectedIndex = timelineDraftEvents.findIndex((event) => {
    const key = `${String(event.date || "").trim()}||${String(event.title || "").trim()}`;
    return key === lastParsedKey;
  });
  if (timelineSelectedIndex < 0) timelineSelectedIndex = timelineDraftEvents.length ? 0 : -1;
  syncParserInputFromDraft();
  selectTimelineEvent(timelineSelectedIndex);
  renderTimelinePreview(getTimelineConfigFromForm());
  if (timelineSaveStatus) {
    timelineSaveStatus.textContent = `${parsed.length} yeni satır işlendi. Toplam: ${timelineDraftEvents.length}.`;
  }
}

function renderTimelinePreview(config) {
  if (!timelinePreview) return;
  const normalized = timelineUtils.coerceTimelineConfig(config);
  if (!normalized.events.length) {
    timelinePreview.innerHTML = `<p class="timeline-preview-empty">Henüz olay girilmedi.</p>`;
    return;
  }

  const cards = normalized.events.map((event) => {
    const tone = timelineUtils.toneForEvent(event, normalized.transitionYear);
    const featured = timelineUtils.isFeaturedTransitionEvent(event);
    const marker = featured ? ` · Geçiş Sf.${timelineUtils.FEATURED_TRANSITION_PAGE || 657}` : "";
    const title = escapeHtml(event.title);
    const note = escapeHtml(event.note || "");
    return `
      <div class="timeline-preview-item ${tone}">
        <div class="timeline-preview-date">${escapeHtml(timelineUtils.formatDate(event.date))}</div>
        <div class="timeline-preview-title">${title}${marker}</div>
        <div class="timeline-preview-note">${note || "—"}</div>
      </div>
    `;
  }).join("");

  timelinePreview.innerHTML = `<div class="timeline-preview-track">${cards}</div>`;
}

function getTimelineConfigFromForm() {
  const base = {
    enabled: !!(timelineEnabled && timelineEnabled.checked),
    transitionYear: timelineUtils.DEFAULT_TRANSITION_YEAR || 2016,
    events: timelineDraftEvents.map((event) => ({
      date: event.date,
      type: event.type || "incident",
      title: buildTimelineDescription(event) || "Olay",
      note: "",
      page: event.page || null
    }))
  };
  return timelineUtils.coerceTimelineConfig(base);
}

function upsertSelectedTimelineEvent() {
  const rawDate = timelineEditDate ? timelineEditDate.value : "";
  const description = (timelineEditIncident ? timelineEditIncident.value : "").trim();
  const isoDate = timelineUtils.toIsoDate ? timelineUtils.toIsoDate(rawDate) : String(rawDate || "").trim();
  if (!isoDate || !description) {
    if (timelineSaveStatus) timelineSaveStatus.textContent = "Tarih/Sene ve olay açıklaması gerekli.";
    return;
  }

  const event = { date: isoDate, type: "incident", title: description, note: "", page: null };
  if (timelineSelectedIndex >= 0 && timelineSelectedIndex < timelineDraftEvents.length) {
    timelineDraftEvents[timelineSelectedIndex] = event;
  } else {
    timelineDraftEvents.push(event);
    timelineSelectedIndex = timelineDraftEvents.length - 1;
  }

  sortTimelineDraft();
  syncParserInputFromDraft();
  const newIndex = timelineDraftEvents.findIndex((item) => item.date === event.date && item.title === event.title);
  selectTimelineEvent(newIndex >= 0 ? newIndex : 0);
  renderTimelinePreview(getTimelineConfigFromForm());
  if (timelineSaveStatus) timelineSaveStatus.textContent = "Olay güncellendi.";
}

function deleteSelectedTimelineEvent() {
  if (timelineSelectedIndex < 0 || timelineSelectedIndex >= timelineDraftEvents.length) return;
  timelineDraftEvents.splice(timelineSelectedIndex, 1);
  if (!timelineDraftEvents.length) {
    timelineSelectedIndex = -1;
  } else if (timelineSelectedIndex >= timelineDraftEvents.length) {
    timelineSelectedIndex = timelineDraftEvents.length - 1;
  }
  syncParserInputFromDraft();
  selectTimelineEvent(timelineSelectedIndex);
  renderTimelinePreview(getTimelineConfigFromForm());
  if (timelineSaveStatus) timelineSaveStatus.textContent = "Olay silindi.";
}

async function loadTimelineEditor(caseId) {
  if (!caseId) {
    clearTimelineEditor();
    return;
  }
  try {
    const res = await fetch(`/api/cases/${caseId}`);
    if (!res.ok) throw new Error("load-failed");
    const caseData = await res.json();
    const config = timelineUtils.coerceTimelineConfig(caseData.timeline_data || {});
    timelineEnabled.checked = !!config.enabled;
    timelineDraftEvents = (config.events || []).map((event) => ({
      date: event.date,
      type: "incident",
      title: buildTimelineDescription(event) || event.title || "",
      note: "",
      page: event.page || null
    }));
    sortTimelineDraft();
    syncParserInputFromDraft();
    timelineSelectedIndex = timelineDraftEvents.length ? 0 : -1;
    selectTimelineEvent(timelineSelectedIndex);
    renderTimelinePreview(config);
    if (timelineSaveStatus) timelineSaveStatus.textContent = "";
  } catch (err) {
    clearTimelineEditor();
  }
}

activeCaseSelect.addEventListener("change", async () => {
  const caseId = activeCaseSelect.value;
  if (caseId) {
    localStorage.setItem("dcc_admin_active_case", caseId);
    cachedCasePeople = await loadCasePeople(caseId);
    renderFilteredProfiles(cachedCasePeople);
  } else {
    cachedCasePeople = [];
    renderFilteredProfiles([]);
  }
});

function setInput(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value || "";
}

function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeActionNumsForSave(values) {
  const src = Array.isArray(values) ? values : [values];
  const out = new Set();
  src.forEach((value) => {
    String(value || "")
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .forEach((token) => {
        const m = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);
        if (m) {
          const start = parseInt(m[1], 10);
          const end = parseInt(m[2], 10);
          if (!isNaN(start) && !isNaN(end)) {
            const min = Math.min(start, end);
            const max = Math.max(start, end);
            for (let n = min; n <= max; n++) out.add(String(n));
            return;
          }
        }
        out.add(token);
      });
  });
  return [...out];
}

function stringifyHierarchyList(list) {
  if (!Array.isArray(list)) return "";
  return list
    .map((entry) => {
      const raw = String(entry || "").trim();
      if (!raw) return "";
      const byId = cachedServerPeople.find((person) => person.id === raw);
      return byId ? byId.name : raw;
    })
    .filter(Boolean)
    .join(", ");
}

function getSelectedRoles() {
  const checkboxes = document.querySelectorAll('#role-checkboxes input[name="roles"]:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

function setRoleCheckboxes(roleValue) {
  const checkboxes = document.querySelectorAll('#role-checkboxes input[name="roles"]');
  checkboxes.forEach(cb => cb.checked = false);
  if (!roleValue) return;
  const roles = roleValue.split(",").map(r => r.trim()).filter(Boolean);
  roles.forEach(r => {
    const cb = document.querySelector(`#role-checkboxes input[value="${r}"]`);
    if (cb) cb.checked = true;
  });
}

function clearRoleCheckboxes() {
  const checkboxes = document.querySelectorAll('#role-checkboxes input[name="roles"]');
  checkboxes.forEach(cb => cb.checked = false);
}

function renderChips(container, items, onRemove) {
  container.innerHTML = "";
  items.forEach((item, idx) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${item} <button type="button" class="chip-remove">&times;</button>`;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      onRemove(idx);
    });
    container.appendChild(chip);
  });
}

function renderTckChips() {
  renderChips(tckChips, currentTckCodes, (idx) => {
    currentTckCodes.splice(idx, 1);
    renderTckChips();
  });
}

function renderActionChips() {
  const displayItems = currentActionNums.map((n) => `Eylem ${n}`);
  renderChips(actionChips, displayItems, (idx) => {
    currentActionNums.splice(idx, 1);
    renderActionChips();
  });
}

tckAddBtn.addEventListener("click", () => {
  const raw = tckInput.value.trim();
  if (!raw) return;
  const normalized = normalizeTckCodeInput(raw);
  const defined = getDefinedTckCodeSet();
  if (!defined.has(normalized)) {
    alert(`TCK ${normalized} adminde tanımlı değil. Önce TCK Maddeleri bölümüne ekleyin.`);
    return;
  }
  const val = `TCK ${normalized}`;
  if (!currentTckCodes.includes(val)) {
    currentTckCodes.push(val);
    renderTckChips();
  }
  tckInput.value = "";
});

tckInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    tckAddBtn.click();
  }
});

actionAddBtn.addEventListener("click", () => {
  let val = actionInput.value.trim();
  val = val.replace(/^Eylem\s*/i, "").trim();
  if (val && !currentActionNums.includes(val)) {
    currentActionNums.push(val);
    renderActionChips();
  }
  actionInput.value = "";
});

actionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    actionAddBtn.click();
  }
});

function extractNamesFromText(text) {
  if (!text) return [];
  const stopWords = new Set([
    "TCK", "CMK", "AYM", "FETÖ", "PKK", "DHKPC", "NATO", "BM", "AB", "TL",
    "Eylem", "Madde", "Sayı", "Tarih", "Dosya", "Esas", "Karar", "Dava",
    "Mahkeme", "Savcı", "Hakim", "Tanık", "Sanık", "Müdafi", "Avukat",
    "İDDİA", "DELİL", "SAVUNMA", "Suçlama", "Ceza", "Hapis",
    "WhatsApp", "Telegram", "ByLock", "HTS", "SMS", "MASAK",
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
    "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
    "Başkan", "Üye", "Genel", "Müdür", "Bakan", "Vali", "Kaymakam",
    "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana",
    "Türkiye", "Cumhurbaşkanı", "Başbakan", "Devlet",
    "Emniyet", "Jandarma", "Polis", "Askeri", "Silahlı",
    "Örgüt", "Örgütü", "Terör", "Üyeliği", "Yardım", "Hakaret",
    "Bilirkişi", "Rapor", "Belge", "Kayıt", "Beyan", "İfade",
    "Banka", "Hesap", "Para", "Toplantı", "Dernek", "Vakıf"
  ]);

  const namePattern = /\b([A-ZÇĞİÖŞÜ][a-zçğıöşü]+(?:\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+)+)\b/g;
  const names = new Set();
  let match;
  while ((match = namePattern.exec(text)) !== null) {
    const candidate = match[1].trim();
    const words = candidate.split(/\s+/);
    if (words.length < 2 || words.length > 4) continue;
    if (words.some((w) => stopWords.has(w))) continue;
    if (/^\d/.test(candidate)) continue;
    names.add(candidate);
  }
  return Array.from(names);
}

function parseTck(text) {
  const codes = new Set();
  const regex = /TCK\s*(\d{2,3})(?:\/([\w.-]+))?/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const base = match[1];
    const suffix = match[2];
    if (suffix) {
      codes.add(`TCK ${base}/${suffix}`);
    } else {
      codes.add(`TCK ${base}`);
    }
    const rest = text.slice(match.index + match[0].length);
    const lineRest = rest.split(/\n/)[0];
    const shortMatches = lineRest.match(/\b(\d+\.[a-z0-9-]+)\b/gi);
    if (shortMatches) {
      shortMatches.forEach((seg) => codes.add(`TCK ${base}/${seg}`));
    }
  }
  const standalone = text.match(/\b\d{2,3}\/[0-9a-zA-Z.-]+\b/g) || [];
  standalone.forEach((seg) => codes.add(`TCK ${seg}`));
  return Array.from(codes);
}

function parseOrgAndTitle(text) {
  const orgKeywords = [
    "Müdürlüğü", "Müdürlügü", "Bakanlığı", "Bakanlıgı",
    "Belediyesi", "Belediye", "Başkanlığı", "Başkanlıgı",
    "A.Ş.", "A.S.", "A.Ş", "Ltd.", "Ltd", "Şirketi", "Sirketi",
    "Holding", "Kurumu", "Genel Müdürlüğü", "Daire Başkanlığı",
    "Emniyet", "Üniversitesi", "Hastanesi", "Vakıfı", "Vakfi",
    "Derneği", "Dernegi", "Ajansı", "Gazetesi", "Bankası", "Odası",
    "İSFALT", "İBB"
  ];
  let organization = "";
  let titleVal = "";
  const separator = text.includes(",") ? "," : text.includes(" - ") ? " - " : null;
  if (separator) {
    const parts = text.split(separator).map(s => s.trim());
    const orgIdx = parts.findIndex(p => orgKeywords.some(k => p.includes(k)));
    if (orgIdx !== -1) {
      organization = parts[orgIdx];
      titleVal = parts.filter((_, i) => i !== orgIdx).join(", ");
    } else {
      organization = parts[0];
      titleVal = parts.slice(1).join(", ");
    }
  } else {
    if (orgKeywords.some(k => text.includes(k))) {
      organization = text;
    } else {
      titleVal = text;
    }
  }
  return { organization, title: titleVal };
}

function parseSanikKimligi(textBlock) {
  const roleMap = {
    "Sanık": "defendant", "İtirafçı": "informant", "Tanık": "witness",
    "Gizli Tanık": "secretWitness", "Mağdur": "victim", "Firari": "fugitive", "Tutuklu": "detained"
  };

  const section = textBlock.match(/👤\s*SANIK(?:\s*KİMLİĞİ)?\s*:\s*([\s\S]*?)(?=⚖️|🚨|🖼️?\s*FOTOĞRAF|$)/iu);
  if (!section) return null;
  const body = section[1].trim();

  const firstSentence = body.split(/[.;]/)[0].trim();
  const leadLine = body.split("\n")[0].trim();
  const commaHead = cleanName(leadLine.split(",")[0] || "");
  const commaHeadWords = commaHead.split(/\s+/).filter(Boolean);
  const nameMatch = firstSentence.match(/^([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?:,|\s+(?:bünyesinde|tarafından|hakkında|eski|Eski))/i);
  let name = "";
  if (commaHeadWords.length >= 2 && commaHeadWords.length <= 5) {
    name = commaHead;
  } else if (nameMatch) {
    name = nameMatch[1].trim();
  } else {
    const words = firstSentence.split(/\s+/);
    const nameWords = [];
    for (const w of words) {
      if (/^[A-ZÇĞİÖŞÜ]/.test(w) && !/bünyesinde|tarafından|hakkında|olarak|kapsamında/i.test(w)) {
        nameWords.push(w);
      } else if (nameWords.length >= 2) break;
      else if (nameWords.length > 0) break;
    }
    name = nameWords.join(" ");
  }

  let organization = "";
  let titleVal = "";

  const fullOrgTitleMatch = body.match(/,\s*([^\n,]+?)\s+bünyesinde\s+(.*?)\s+olarak\s+görev/i);
  if (fullOrgTitleMatch) {
    organization = fullOrgTitleMatch[1].trim();
    titleVal = fullOrgTitleMatch[2].trim();
  } else {
    const orgBeforeMatch = body.match(/([A-ZÇĞİÖŞÜİ][A-ZÇĞİÖŞÜİa-zçğıöşü\s.]+?)\s+bünyesinde/i);
    if (orgBeforeMatch) {
      organization = orgBeforeMatch[1].trim();
      if (organization.includes(",")) {
        organization = organization.split(",").pop().trim();
      }
    }

    const titleOnlyMatch = body.match(/bünyesinde\s+(.*?)\s+olarak\s+görev/i);
    if (titleOnlyMatch) {
      titleVal = titleOnlyMatch[1].trim();
    } else {
      const standaloneTitle = body.match(/((?:Eski\s+)?[A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)\s+olarak\s+görev/i);
      if (standaloneTitle) {
        titleVal = standaloneTitle[1].trim();
      }
    }
  }

  if (!organization) {
    const inlineOrgMatch = body.match(/,\s*([A-ZÇĞİÖŞÜİ][^\n,]*(?:bünyesinde|nezdinde|A\.Ş\.|Ltd\.|Holding|Müdürlüğü|Başkanlığı|Belediyesi|Şirketi))/i);
    if (inlineOrgMatch) {
      organization = inlineOrgMatch[1].replace(/\s*bünyesinde\s*/i, "").replace(/\s*nezdinde\s*/i, "").trim();
    }
  }

  // Supports inline format:
  // "👤 SANIK: Ad Soyad, Kurum A.Ş. yönetim kurulu üyesidir. Ayrıca ..."
  if (!organization || !titleVal) {
    const inlineSentence = body.split(".")[0].trim();
    const afterComma = inlineSentence.includes(",") ? inlineSentence.split(",").slice(1).join(",").trim() : "";
    if (afterComma) {
      const orgInlineMatch = afterComma.match(/([A-ZÇĞİÖŞÜİ][A-Za-zÇĞİÖŞÜçğıöşü0-9\s.&'’-]*?(?:A\.Ş\.?|Ltd\.?|Holding|Üniversitesi|Vakfı|Vakıf|Derneği|Belediyesi|Müdürlüğü|Başkanlığı))/u);
      if (orgInlineMatch && !organization) {
        organization = orgInlineMatch[1].trim();
      }
      if (!titleVal) {
        let titleInline = afterComma;
        if (organization) titleInline = titleInline.replace(organization, "").trim();
        titleInline = titleInline
          .replace(/^\s*,?\s*/u, "")
          .replace(/\s+üyesidir\.?$/iu, " üyesi")
          .replace(/\s+olarak\s+görev.*$/iu, "")
          .replace(/\s+görevlerini?\s+yürütmüştür.*$/iu, "")
          .trim();
        titleVal = titleInline;
      }
    }
  }

  const extraDuty = body.match(/Ayrıca\s+([^.\n]+?)(?:\s+görevlerini?\s+yürütmüştür|\s+olarak\s+görev.*|\.|$)/iu);
  if (extraDuty && extraDuty[1]) {
    const extraTitle = extraDuty[1].trim();
    if (extraTitle && !titleVal.includes(extraTitle)) {
      titleVal = titleVal ? `${titleVal} · ${extraTitle}` : extraTitle;
    }
  }

  const roles = [];
  const bracketRoles = body.match(/\[([^\]]+)\]/g) || [];
  bracketRoles.forEach(br => {
    const r = br.replace(/[\[\]]/g, "").trim();
    if (roleMap[r]) roles.push(roleMap[r]);
  });
  if (!roles.length) roles.push("defendant");

  let sentenceDemand = "";
  const sentencePatterns = [
    /toplam\s+(.*?hapis\s*cezası)\s*talep/i,
    /(\d+\s*yıl.*?hapis.*?cezası)\s*talep/i,
    /(\d+\s*yıldan\s+\d+\s*yıla\s+kadar.*?hapis\s*cezası)/i,
    /Talep edilen ceza:\s*([^\n]+)/i,
    /(\d+[-–]\d+\s*yıl(?:\s*(?:ve|ile)\s*\d+[-–]\d+\s*ay)?\s*(?:hapis|ağır hapis)(?:\s*cezası)?)/i
  ];
  for (const pat of sentencePatterns) {
    const m = body.match(pat);
    if (m) { sentenceDemand = m[1] ? m[1].trim() : m[0].trim(); break; }
  }

  const actionNumbers = [];
  const eylemRangeRefs = body.match(/Eylem\s*(\d+)\s*[-–]\s*(\d+)/gi) || [];
  const rangeProcessed = new Set();
  eylemRangeRefs.forEach(ref => {
    const rm = ref.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (rm) {
      const start = parseInt(rm[1], 10);
      const end = parseInt(rm[2], 10);
      for (let i = start; i <= end; i++) {
        actionNumbers.push(String(i));
        rangeProcessed.add(String(i));
      }
    }
  });
  const eylemRefs = body.match(/Eylem\s*(\d+)/gi) || [];
  eylemRefs.forEach(ref => {
    const n = ref.replace(/Eylem/i, "").trim();
    if (n && !rangeProcessed.has(n)) actionNumbers.push(n);
  });

  const tckCodes = parseTck(body);

  return {
    name, organization, title: titleVal,
    roles: roles.join(","),
    sentenceDemand,
    actionNumbers: Array.from(new Set(actionNumbers)),
    tckCodes
  };
}

function parseMentionedNames(block) {
  const roleMap = {
    "Sanık": "defendant", "İtirafçı": "informant", "Tanık": "witness",
    "Gizli Tanık": "secretWitness", "Mağdur": "victim", "Firari": "fugitive", "Tutuklu": "detained"
  };

  const mentionedNames = [];
  const mnSection = block.match(/👥\s*(?:GEÇEN\s*İSİMLER|(?:[A-ZÇĞİÖŞÜa-zçğıöşü\s]+\s+)?DAHLİ\s*OLANLAR)\s*:?\s*([\s\S]*?)(?=🚨|📂|👤|🚩|🖼|$)/u);
  if (!mnSection) {
    return [];
  }

  const mnBody = mnSection[1].trim();
  const mnLines = mnBody.split("\n").map(l => l.trim()).filter(l => l && !/^(🚨|📂|👤|🚩)/.test(l));

  function parseLineEntries(line) {
    const entries = [];
    const rolePat = /\s*[\[\(]([^\]\)]+)[\]\)]\s*:\s*/g;
    const positions = [];
    let rm;
    while ((rm = rolePat.exec(line)) !== null) {
      positions.push({ index: rm.index, end: rm.index + rm[0].length, roles: rm[1] });
    }
    if (positions.length === 0) return entries;

    for (let i = 0; i < positions.length; i++) {
      const rp = positions[i];
      const nameStart = i === 0 ? 0 : positions[i - 1].end;
      const contextEnd = i + 1 < positions.length ? positions[i + 1].index : line.length;
      let nameText = line.slice(nameStart, rp.index).trim();
      if (i > 0) {
        const lastPeriod = nameText.lastIndexOf(". ");
        if (lastPeriod >= 0) nameText = nameText.substring(lastPeriod + 2).trim();
      }
      const rawContext = line.slice(rp.end, contextEnd).trim().replace(/[.;,\s]+$/, "").trim();
      let finalContext = rawContext;
      if (i + 1 < positions.length) {
        const lastPeriod = rawContext.lastIndexOf(". ");
        if (lastPeriod >= 0) finalContext = rawContext.substring(0, lastPeriod).trim();
      }
      const parsedRoles = rp.roles.split(/[\/,]/).map(r => r.trim()).filter(Boolean);
      const mappedRoles = parsedRoles.map(r => roleMap[r] || "unknown").filter(Boolean);
      entries.push({
        name: nameText,
        roles: mappedRoles.length ? mappedRoles : ["unknown"],
        context: finalContext
      });
    }
    return entries;
  }

  for (const line of mnLines) {
    const entries = parseLineEntries(line);
    if (entries.length > 0) {
      mentionedNames.push(...entries);
    } else {
      const simpleName = line.replace(/^[-•]\s*/, "").trim();
      if (simpleName && /[A-ZÇĞİÖŞÜ]/.test(simpleName[0])) {
        mentionedNames.push({ name: simpleName, roles: ["unknown"], context: "" });
      }
    }
  }
  return mentionedNames;
}

function parsePastedText(text) {
  const lines = text.split("\n");
  const result = {
    caseNumber: "",
    title: "",
    summary: "",
    sentenceDemand: "",
    actionNumbers: [],
    profiles: [],
    accusations: [],
    tckCodes: [],
    photo: ""
  };

  const textBlock = lines.join("\n");

  const fileLine = lines.find((l) => /📂/.test(l.trim()));
  if (fileLine) {
    const value = fileLine.replace(/📂\s*(?:\[?SANIK\s*KARTI\]?\s*[-–]?\s*)?/i, "").trim();
    const match = value.match(/^(\d{4}\/\d+)\s+(.*)$/);
    if (match) {
      result.caseNumber = match[1];
      result.title = match[2].replace(/Dosyası\s*$/i, "").trim();
    } else {
      const dashMatch = value.match(/^(.*?)\s*[-–]\s*(.*)$/);
      if (dashMatch) {
        result.caseNumber = dashMatch[1].trim();
        result.title = dashMatch[2].replace(/Dosyası\s*$/i, "").trim();
      } else {
        result.caseNumber = value;
      }
    }
  }

  const sanik = parseSanikKimligi(textBlock);
  if (sanik) {
    const reverseRoleMap = {
      defendant: "Sanık", informant: "İtirafçı", witness: "Tanık",
      secretWitness: "Gizli Tanık", victim: "Mağdur", fugitive: "Firari", detained: "Tutuklu"
    };
    const rolesTr = sanik.roles.split(",").map(r => reverseRoleMap[r.trim()] || r.trim()).join(",");
    result.profiles.push({
      name: sanik.name,
      role: rolesTr,
      organization: sanik.organization,
      title: sanik.title
    });
    result.sentenceDemand = sanik.sentenceDemand;
    result.actionNumbers = [...sanik.actionNumbers];
    result.tckCodes = [...sanik.tckCodes];
  }

  const prosecutionMatch = textBlock.match(/⚖️\s*SAVCILIK\s*SUÇLAMALARI\s*:\s*([\s\S]*?)(?=🚨|📂|👤|🖼|$)/u);
  if (prosecutionMatch) {
    result.summary = prosecutionMatch[1].trim();
  }

  if (!result.summary) {
    const summaryMatch = textBlock.match(/🚩\s*İddianame Özeti:\s*([\s\S]*?)(?=🚨|$)/u);
    if (summaryMatch) {
      result.summary = summaryMatch[1].trim();
    }
  }

  const photoMatch = textBlock.match(/🖼️?\s*FOTOĞRAF\s*:\s*([^\n]+)/u);
  if (photoMatch) {
    let photoUrl = photoMatch[1].trim().replace(/^\[|\]$/g, "").trim();
    if (photoUrl && photoUrl !== "Görsel Linki") {
      result.photo = photoUrl;
    }
  }

  if (!result.sentenceDemand) {
    const searchIn = result.summary || textBlock;
    const sentencePatterns = [
      /toplam\s+(.*?hapis\s*cezası)\s*talep/i,
      /(\d+\s*yıldan\s+\d+\s*yıla\s+kadar.*?hapis\s*cezası)/i,
      /(\d+\s*yıl.*?hapis.*?cezası)\s*talep/i,
      /Talep edilen ceza:\s*([^\n]+)/i,
      /(\d+[-–]\d+\s*yıl(?:\s*(?:ve|ile)\s*\d+[-–]\d+\s*ay)?\s*(?:hapis|ağır hapis)(?:\s*cezası)?)/i
    ];
    for (const pat of sentencePatterns) {
      let m = searchIn.match(pat);
      if (!m && searchIn !== textBlock) m = textBlock.match(pat);
      if (m) { result.sentenceDemand = m[1] ? m[1].trim() : m[0].trim(); break; }
    }
  }

  const accBlocks = textBlock.split(/🚨\s*SUÇLAMA\s*\d+\s*:/u).slice(1);
  accBlocks.forEach((block) => {
    const firstLine = block.split("\n").find((l) => l.trim())?.trim() || "";

    const eylemMatch = block.match(/EYLEM\s*:\s*(.*?)(?=\s*TCK\s*:|$)/i);
    const tckMatch = block.match(/TCK\s*:\s*([^\n]+)/i);
    const claimMatch = block.match(/İDDİA\s*:\s*([\s\S]*?)(?=DELİL|SAVUNMA|👥|$)/i);
    const evidenceMatch = block.match(/DELİLLER?\s*:\s*([\s\S]*?)(?=SAVUNMA|👥|$)/i);
    const defenseMatch = block.match(/SAVUNMA\s*:\s*([\s\S]*?)(?=👥|$)/i);

    const blockActionNums = [];
    // Only parse action numbers from explicit EYLEM-tagged content.
    // This prevents random years/case numbers in free text from being treated as action ids.
    const eylemSource = eylemMatch ? eylemMatch[1].trim() : "";
    const blockRangeRefs = eylemSource.match(/(?:Eylem\s*)?(\d+)\s*[-–]\s*(\d+)/gi) || [];
    const blockRangeProcessed = new Set();
    blockRangeRefs.forEach(ref => {
      const rm = ref.match(/(\d+)\s*[-–]\s*(\d+)/);
      if (rm) {
        const start = parseInt(rm[1], 10);
        const end = parseInt(rm[2], 10);
        for (let i = start; i <= end; i++) {
          blockActionNums.push(String(i));
          blockRangeProcessed.add(String(i));
        }
      }
    });
    const blockEylemRefs = eylemSource.match(/(?:Eylem\s*)?(\d+)/gi) || [];
    blockEylemRefs.forEach(ref => {
      const n = ref.replace(/Eylem/i, "").trim();
      if (n && !blockRangeProcessed.has(n)) blockActionNums.push(n);
    });

    let blockTckCodes = [];
    if (tckMatch) {
      blockTckCodes = parseTck(tckMatch[1]);
    }
    if (!blockTckCodes.length) {
      blockTckCodes = parseTck(block);
    }

    const mentionedNames = parseMentionedNames(block);

    result.accusations.push({
      title: firstLine || "",
      actionNums: Array.from(new Set(blockActionNums)),
      tckCodes: blockTckCodes,
      claim: claimMatch ? claimMatch[1].trim() : "",
      evidence: evidenceMatch ? evidenceMatch[1].trim() : "",
      defense: defenseMatch ? defenseMatch[1].trim() : "",
      mentionedNames
    });
  });

  const allEylemFromAccs = result.accusations.flatMap(a => a.actionNums);
  result.actionNumbers = Array.from(new Set([...result.actionNumbers, ...allEylemFromAccs]));

  if (!result.tckCodes.length) result.tckCodes = parseTck(text);
  const allTckFromAccs = result.accusations.flatMap(a => a.tckCodes);
  result.tckCodes = Array.from(new Set([...result.tckCodes, ...allTckFromAccs]));

  return result;
}

function formatNumberedItems(text) {
  if (!text) return "\u2014";
  const items = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (items.length <= 1) return text;
  return items.map((item, i) => {
    const cleaned = item.replace(/^\d+[\.\)]\s*/, "");
    return `${i + 1}) ${cleaned}`;
  }).join("<br>");
}

function normalizeRoles(entry) {
  if (entry.roles && Array.isArray(entry.roles)) return entry.roles;
  if (entry.role) {
    const parts = entry.role.split(",").map(r => r.trim()).filter(Boolean);
    return parts.length ? parts : ["unknown"];
  }
  return ["unknown"];
}

function renderMentionedNamesForCard(container, accIdx) {
  if (!lastParsed || !lastParsed.accusations[accIdx]) return;
  const names = lastParsed.accusations[accIdx].mentionedNames || [];
  container.innerHTML = "";

  const allRoleOptions = [
    { value: "defendant", label: "Sanık" },
    { value: "informant", label: "İtirafçı" },
    { value: "witness", label: "Tanık" },
    { value: "secretWitness", label: "Gizli Tanık" },
    { value: "victim", label: "Mağdur" },
    { value: "fugitive", label: "Firari" },
    { value: "detained", label: "Tutuklu" }
  ];

  names.forEach((mn, mnIdx) => {
    const entry = typeof mn === "string" ? { name: mn, roles: ["unknown"], context: "" } : mn;
    entry.roles = normalizeRoles(entry);
    lastParsed.accusations[accIdx].mentionedNames[mnIdx] = entry;

    const item = document.createElement("div");
    item.className = "mentioned-name-item";

    const topRow = document.createElement("div");
    topRow.className = "mentioned-name-top-row";
    topRow.innerHTML = `
      <span class="mentioned-name-text">${entry.name}</span>
      <button type="button" class="btn-remove-name" title="Çıkar">&times;</button>
    `;

    const rolesRow = document.createElement("div");
    rolesRow.className = "mentioned-roles-row";
    allRoleOptions.forEach(opt => {
      const lbl = document.createElement("label");
      lbl.className = "role-checkbox-label";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = opt.value;
      cb.checked = entry.roles.includes(opt.value);
      cb.addEventListener("change", () => {
        const checked = rolesRow.querySelectorAll("input[type=checkbox]:checked");
        entry.roles = Array.from(checked).map(c => c.value);
        if (!entry.roles.length) entry.roles = ["unknown"];
      });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(" " + opt.label));
      rolesRow.appendChild(lbl);
    });

    const contextInput = document.createElement("input");
    contextInput.type = "text";
    contextInput.className = "mentioned-context-input";
    contextInput.placeholder = "Olayla dahili (örn: para transferi yapılan kişi)";
    contextInput.value = entry.context || "";
    contextInput.addEventListener("input", (e) => {
      entry.context = e.target.value;
    });

    item.appendChild(topRow);
    item.appendChild(rolesRow);
    item.appendChild(contextInput);

    topRow.querySelector(".btn-remove-name").addEventListener("click", () => {
      lastParsed.accusations[accIdx].mentionedNames.splice(mnIdx, 1);
      renderMentionedNamesForCard(container, accIdx);
    });
    container.appendChild(item);
  });

  const addRow = document.createElement("div");
  addRow.className = "mentioned-name-add-row";
  addRow.innerHTML = `
    <input type="text" class="add-name-input" placeholder="İsim Soyad">
    <button type="button" class="btn-add-name">+</button>
  `;
  const mnNameInput = addRow.querySelector(".add-name-input");
  const addBtn = addRow.querySelector(".btn-add-name");
  addBtn.addEventListener("click", () => {
    const name = mnNameInput.value.trim();
    if (!name) return;
    if (!lastParsed.accusations[accIdx].mentionedNames) lastParsed.accusations[accIdx].mentionedNames = [];
    lastParsed.accusations[accIdx].mentionedNames.push({ name, roles: ["unknown"], context: "" });
    renderMentionedNamesForCard(container, accIdx);
  });
  mnNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !mnNameInput._acSelected) { e.preventDefault(); addBtn.click(); }
    mnNameInput._acSelected = false;
  });
  container.appendChild(addRow);

  setupAutocomplete(mnNameInput, (query) => {
    const q = query.toLowerCase();
    const caseMatches = cachedCasePeople
      .filter(p => p.name && p.name.toLowerCase().includes(q))
      .map(p => ({
        label: p.name,
        fillValue: p.name,
        html: `<div>${highlightMatch(p.name, query)}<div class="ac-meta">${roleLabelsMap[(p.role || "").split(",")[0].trim()] || ""}${p.organization ? ' · ' + p.organization : ''} <span style="color:#6ee7b7;font-size:0.7rem">Bu dava</span></div></div>`,
        person: p
      }));
    const caseIds = new Set(cachedCasePeople.map(p => p.id));
    const otherMatches = cachedServerPeople
      .filter(p => p.name && p.name.toLowerCase().includes(q) && !caseIds.has(p.id))
      .map(p => ({
        label: p.name,
        fillValue: p.name,
        html: `<div>${highlightMatch(p.name, query)}<div class="ac-meta">${roleLabelsMap[(p.role || "").split(",")[0].trim()] || ""}${p.organization ? ' · ' + p.organization : ''}</div></div>`,
        person: p
      }));
    return [...caseMatches, ...otherMatches].slice(0, 8);
  }, (item) => {
    mnNameInput._acSelected = true;
    mnNameInput.value = item.fillValue;
    const personRoles = (item.person.role || "").split(",").map(r => r.trim()).filter(Boolean);
    const checkboxes = container.querySelectorAll('.role-checkbox-label input[type="checkbox"]');
    checkboxes.forEach(cb => {
      cb.checked = personRoles.includes(cb.value);
    });
  }, { minLength: 2 });
}

function renderAccCardChips(container, items, accIdx, field, labelPrefix) {
  container.innerHTML = "";
  items.forEach((item, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    const display = labelPrefix ? `${labelPrefix} ${item}` : item;
    chip.innerHTML = `${display} <button type="button" class="chip-remove">&times;</button>`;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      if (lastParsed && lastParsed.accusations[accIdx]) {
        lastParsed.accusations[accIdx][field].splice(i, 1);
        renderAccCardChips(container, lastParsed.accusations[accIdx][field], accIdx, field, labelPrefix);
      }
    });
    container.appendChild(chip);
  });
  const addRow = document.createElement("div");
  addRow.className = "acc-chip-add-row";
  const placeholder = field === "tckCodes" ? "TCK 314/2" : "Numara";
  addRow.innerHTML = `<input type="text" class="acc-chip-input" placeholder="${placeholder}"><button type="button" class="btn-acc-chip-add">+</button>`;
  const input = addRow.querySelector(".acc-chip-input");
  const addBtnEl = addRow.querySelector(".btn-acc-chip-add");

  function addChipValue(rawVal) {
    let val = rawVal;
    if (!val) return;
    if (field === "tckCodes") {
      const normalized = normalizeTckCodeInput(val);
      const defined = getDefinedTckCodeSet();
      if (!defined.has(normalized)) {
        alert(`TCK ${normalized} adminde tanımlı değil. Önce TCK Maddeleri bölümüne ekleyin.`);
        return;
      }
      val = `TCK ${normalized}`;
    } else if (field === "actionNums") {
      val = val.replace(/^Eylem\s*/i, "").trim();
    }
    if (!lastParsed.accusations[accIdx][field]) lastParsed.accusations[accIdx][field] = [];
    if (!lastParsed.accusations[accIdx][field].includes(val)) {
      lastParsed.accusations[accIdx][field].push(val);
      renderAccCardChips(container, lastParsed.accusations[accIdx][field], accIdx, field, labelPrefix);
    }
  }

  addBtnEl.addEventListener("click", () => {
    addChipValue(input.value.trim());
    input.value = "";
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !input._acSelected) { e.preventDefault(); addBtnEl.click(); }
    input._acSelected = false;
  });
  container.appendChild(addRow);

  if (field === "tckCodes") {
    setupAutocomplete(input, (query) => {
      const q = query.toLowerCase().replace(/^tck\s*/i, "").trim();
      if (!q) return [];
      return cachedTckDefinitions
        .filter(d => d.code.toLowerCase().includes(q) || (d.short_desc || "").toLowerCase().includes(q))
        .slice(0, 6)
        .map(d => ({
          label: d.code,
          fillValue: d.code.startsWith("TCK") ? d.code : `TCK ${d.code}`,
          html: `<div>${highlightMatch(d.code, q)}${d.short_desc ? '<div class="ac-meta">' + d.short_desc + '</div>' : ''}</div>`
        }));
    }, (item) => {
      input._acSelected = true;
      addChipValue(item.fillValue || item.label);
      input.value = "";
    }, { clearOnSelect: true });
  } else if (field === "actionNums") {
    setupAutocomplete(input, (query) => {
      const q = query.replace(/^Eylem\s*/i, "").trim().toLowerCase();
      if (!q) return [];
      const allNums = new Set();
      cachedServerPeople.forEach(p => {
        (p.action_numbers || []).forEach(n => {
          String(n).split(/[,\s]+/).filter(Boolean).forEach(v => allNums.add(v.trim()));
        });
      });
      return [...allNums]
        .filter(n => n.toLowerCase().includes(q))
        .sort((a, b) => { const na = parseInt(a), nb = parseInt(b); return (!isNaN(na) && !isNaN(nb)) ? na - nb : a.localeCompare(b); })
        .slice(0, 6)
        .map(n => ({ label: `Eylem ${n}`, fillValue: n, html: `<div>Eylem ${highlightMatch(n, q)}</div>` }));
    }, (item) => {
      input._acSelected = true;
      addChipValue(item.fillValue);
      input.value = "";
    }, { clearOnSelect: true });
  }
}

function renderActionCards(parsed) {
  actionsContainer.innerHTML = "";
  if (!parsed || !parsed.accusations || parsed.accusations.length === 0) return;

  parsed.accusations.forEach((acc, idx) => {
    if (!Array.isArray(acc.tckCodes)) acc.tckCodes = [];
    if (!Array.isArray(acc.actionNums)) acc.actionNums = [];
    if (!Array.isArray(acc.mentionedNames)) acc.mentionedNames = [];

    const card = document.createElement("div");
    card.className = "accusation-card";

    const num = idx + 1;

    card.innerHTML = `
      <div class="accusation-card-header">
        <span class="accusation-num">Suçlama ${num}</span>
        <input type="text" class="accusation-title-input" value="${(acc.title || "").replace(/"/g, '&quot;')}" placeholder="Suçlama başlığı" data-acc="${idx}" data-field="title">
      </div>
      <div class="accusation-card-body">
        <div class="accusation-row">
          <span class="accusation-label">İddia</span>
          <textarea class="accusation-edit" rows="3" data-acc="${idx}" data-field="claim" placeholder="İddia metni">${acc.claim || ""}</textarea>
        </div>
        <div class="accusation-row">
          <span class="accusation-label">Deliller</span>
          <textarea class="accusation-edit" rows="3" data-acc="${idx}" data-field="evidence" placeholder="Delil metni">${acc.evidence || ""}</textarea>
        </div>
        <div class="accusation-row">
          <span class="accusation-label">Savunma</span>
          <textarea class="accusation-edit" rows="3" data-acc="${idx}" data-field="defense" placeholder="Savunma metni">${acc.defense || ""}</textarea>
        </div>
        <div class="accusation-meta">
          <div class="accusation-meta-editable">
            <strong>Eylem:</strong>
            <div class="acc-action-chips" data-acc-idx="${idx}"></div>
          </div>
          <div class="accusation-meta-editable">
            <strong>TCK:</strong>
            <div class="acc-tck-chips" data-acc-idx="${idx}"></div>
          </div>
          <div class="mentioned-names-section">
            <strong>Geçen İsimler:</strong>
            <div class="mentioned-names-list" data-acc-idx="${idx}"></div>
          </div>
        </div>
      </div>
    `;

    card.querySelectorAll(".accusation-edit, .accusation-title-input").forEach(el => {
      el.addEventListener("input", () => {
        const accIdx = parseInt(el.dataset.acc, 10);
        const field = el.dataset.field;
        if (lastParsed && lastParsed.accusations[accIdx]) {
          lastParsed.accusations[accIdx][field] = el.value;
        }
      });
    });

    actionsContainer.appendChild(card);

    const actionChipsEl = card.querySelector(`.acc-action-chips[data-acc-idx="${idx}"]`);
    renderAccCardChips(actionChipsEl, acc.actionNums || [], idx, "actionNums", "Eylem");

    const tckChipsEl = card.querySelector(`.acc-tck-chips[data-acc-idx="${idx}"]`);
    renderAccCardChips(tckChipsEl, acc.tckCodes || [], idx, "tckCodes", "");

    const namesContainer = card.querySelector(`.mentioned-names-list[data-acc-idx="${idx}"]`);
    renderMentionedNamesForCard(namesContainer, idx);
  });
}

function applyParsedToForm(parsed) {
  if (!parsed) return;

  setInput(profileForm, "summary", parsed.summary || "");

  if (parsed.profiles[0]) {
    const profile = parsed.profiles[0];
    const rawRole = profile.role || "Sanık";

    setInput(profileForm, "name", profile.name);
    setInput(profileForm, "organization", profile.organization || "");
    setInput(profileForm, "title", profile.title || "");

    const roleMap = {
      "Sanık": "defendant",
      "İtirafçı": "informant",
      "Tanık": "witness",
      "Gizli Tanık": "secretWitness",
      "Mağdur": "victim",
      "Firari": "fugitive",
      "Tutuklu": "detained"
    };
    const mappedRoles = rawRole.split(",").map(r => roleMap[r.trim()] || r.trim()).join(",");
    setRoleCheckboxes(mappedRoles);
  }

  setInput(profileForm, "sentenceDemand", parsed.sentenceDemand || "");
  if (parsed.photo) {
    setInput(profileForm, "photo", parsed.photo);
  }

  currentTckCodes = sanitizeKnownTckCodes(parsed.tckCodes || []);
  renderTckChips();

  currentActionNums = [...(parsed.actionNumbers || [])];
  renderActionChips();

  renderActionCards(parsed);
}

function renderParseResults(parsed) {
  parseResults.innerHTML = "";
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = formData.get("username");
  const password = formData.get("password");
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (res.ok) {
      localStorage.setItem("dcc_admin_authed", "1");
      loginScreen.style.display = "none";
    } else {
      loginError.textContent = "Hatalı kullanıcı adı veya şifre.";
    }
  } catch (err) {
    loginError.textContent = "Sunucuya bağlanılamadı.";
  }
});

menuItems.forEach((btn) => {
  btn.addEventListener("click", () => setSection(btn.dataset.tab));
});

parseBtn.addEventListener("click", () => {
  const text = parseInput.value || "";
  if (!text.trim()) return;

  lastParsed = parsePastedText(text);
  renderParseResults(lastParsed);
  applyParsedToForm(lastParsed);
});

clearBtn.addEventListener("click", () => {
  parseInput.value = "";
  resetProfileForm();
});

if (timelineCaseSelect) {
  timelineCaseSelect.addEventListener("change", async () => {
    const caseId = timelineCaseSelect.value;
    if (caseId) localStorage.setItem("dcc_admin_timeline_case", caseId);
    await loadTimelineEditor(caseId);
  });
}

if (timelinePreviewBtn) {
  timelinePreviewBtn.addEventListener("click", () => {
    renderTimelinePreview(getTimelineConfigFromForm());
  });
}

if (timelineParseBtn) {
  timelineParseBtn.addEventListener("click", parseTimelineFromTextArea);
}

if (timelineClearBtn) {
  timelineClearBtn.addEventListener("click", () => {
    timelineDraftEvents = [];
    timelineSelectedIndex = -1;
    if (timelineParserInput) timelineParserInput.value = "";
    if (timelineEditDate) timelineEditDate.value = "";
    if (timelineEditIncident) timelineEditIncident.value = "";
    renderTimelineEventList();
    renderTimelinePreview(getTimelineConfigFromForm());
    if (timelineSaveStatus) timelineSaveStatus.textContent = "Zaman çizelgesi editörü temizlendi.";
  });
}

if (timelineUpdateBtn) {
  timelineUpdateBtn.addEventListener("click", upsertSelectedTimelineEvent);
}

if (timelineDeleteBtn) {
  timelineDeleteBtn.addEventListener("click", deleteSelectedTimelineEvent);
}

if (timelineEditIncident) {
  timelineEditIncident.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      upsertSelectedTimelineEvent();
    }
  });
}

if (timelineSaveBtn) {
  timelineSaveBtn.addEventListener("click", async () => {
    const caseId = timelineCaseSelect && timelineCaseSelect.value;
    if (!caseId) {
      if (timelineSaveStatus) timelineSaveStatus.textContent = "Önce bir dava seçin.";
      return;
    }
    parseTimelineFromTextArea();
    const config = getTimelineConfigFromForm();
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timeline_data: config })
      });
      if (!res.ok) throw new Error("save-failed");
      renderTimelinePreview(config);
      if (timelineSaveStatus) timelineSaveStatus.textContent = "Zaman çizelgesi kaydedildi.";
      await sync();
    } catch (err) {
      if (timelineSaveStatus) timelineSaveStatus.textContent = "Zaman çizelgesi kaydedilirken bir hata oluştu.";
    }
  });
}

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(caseForm);
  const editId = formData.get("editId");

  const judgeType = formData.get("judgeType");

  const payload = {
    title: formData.get("title"),
    summary: formData.get("summary"),
    sorusturma_no: formData.get("sorusturmaNo"),
    case_number: formData.get("caseNumber"),
    iddianame_no: formData.get("iddianameNo"),
    court_name: formData.get("courtName"),
    indictment_prosecutor: formData.get("indictmentProsecutor"),
    trial_prosecutor: formData.get("trialProsecutor"),
    judge_type: judgeType,
    judge_name: judgeType === "single" ? formData.get("judgeName") : "",
    panel_president: judgeType === "panel" ? formData.get("panelPresident") : "",
    panel_members: judgeType === "panel" ? formData.get("panelMembers") : "",
    acceptance_date: formData.get("acceptanceDate"),
    indictment_date: formData.get("indictmentDate"),
    verdict_date: formData.get("verdictDate"),
    status: formData.get("status"),
    judge: judgeType === "single" ? formData.get("judgeName") : formData.get("panelPresident"),
    court_panel: judgeType === "panel" ? formData.get("panelMembers") : "",
    prosecutor: formData.get("indictmentProsecutor"),
    date: formData.get("acceptanceDate")
  };

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/cases/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    if (res.ok) {
      const savedCase = await res.json();
      const caseId = editId || savedCase.id;

      const officialNames = [
        { name: payload.indictment_prosecutor, role: "indictment_prosecutor" },
        { name: payload.trial_prosecutor, role: "trial_prosecutor" },
        { name: payload.judge_name, role: "judge" },
        { name: payload.panel_president, role: "panel_president" }
      ];
      for (const o of officialNames) {
        if (o.name && o.name.trim()) {
          try {
            const oRes = await fetch("/api/officials", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: o.name.trim(), role: o.role, institution: payload.court_name || "" })
            });
            if (oRes.ok) {
              const official = await oRes.json();
              await fetch("/api/case-officials", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caseId, officialId: official.id, roleInCase: o.role })
              });
            }
          } catch (e) {}
        }
      }
    } else {
      alert("Dava sunucuya kaydedilemedi. Lütfen tekrar giriş yapın.");
    }
  } catch (err) {
    alert("Sunucuya bağlantı hatası.");
  }

  resetCaseForm();
  sync();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(profileForm);
  const editId = formData.get("editId");
  const caseId = activeCaseSelect.value;
  const parsedAccusations = (lastParsed && Array.isArray(lastParsed.accusations) && lastParsed.accusations.length)
    ? lastParsed.accusations.map((acc, idx) => ({
        order: idx + 1,
        title: acc.title || "",
        claim: acc.claim || "",
        evidence: acc.evidence || "",
        defense: acc.defense || "",
        actionNums: normalizeActionNumsForSave(acc.actionNums || [])
      }))
    : null;
  const sanitizedParsedAccusations = parsedAccusations ? sanitizeAccusationTckCodes(parsedAccusations) : null;

  const selectedRoles = getSelectedRoles();
  if (selectedRoles.length === 0) selectedRoles.push("defendant");
  const profilePayload = {
    name: cleanName(formData.get("name")),
    role: selectedRoles.join(","),
    organization: formData.get("organization"),
    title: formData.get("title"),
    photo_url: formData.get("photo"),
    tck_articles: sanitizeKnownTckCodes(currentTckCodes),
    sentence_demand: formData.get("sentenceDemand"),
    action_numbers: currentActionNums,
    charge: formData.get("summary"),
    ...(sanitizedParsedAccusations ? { accusations: sanitizedParsedAccusations } : {}),
    hierarchy: {
      superiors: parseCsvList(formData.get("hierarchySuperiors")),
      subordinates: parseCsvList(formData.get("hierarchySubordinates"))
    }
  };

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/people/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload)
      });
    } else {
      res = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profilePayload)
      });
    }
    if (res.ok) {
      const person = await res.json();
      if (!editId && caseId) {
        await fetch("/api/case-people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId, personId: person.id })
        });
      }
      if (lastParsed && lastParsed.accusations.length > 0) {
        if (editId) {
          await fetch(`/api/actions?personId=${person.id}${caseId ? '&caseId=' + caseId : ''}`, { method: "DELETE" });
        }
        const allMentionedNames = new Map();
        for (const acc of lastParsed.accusations) {
          const actionNumsForAcc = normalizeActionNumsForSave(acc.actionNums || []);
          const perActionNums = actionNumsForAcc.length ? actionNumsForAcc : [""];
          for (const actionNum of perActionNums) {
            await fetch("/api/actions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                caseId,
                personId: person.id,
                actionNum,
                title: acc.title || "",
                claim: acc.claim || "",
                evidence: acc.evidence || "",
                defense: acc.defense || "",
                tckCodes: sanitizeKnownTckCodes(acc.tckCodes || []),
                sentenceDemand: lastParsed.sentenceDemand || "",
                mentionedNames: (acc.mentionedNames || []).map(mn => {
                  if (typeof mn === "string") return cleanName(mn);
                  return { ...mn, name: cleanName(mn.name) };
                })
              })
            });
          }
          (acc.mentionedNames || []).forEach(mn => {
            const entry = typeof mn === "string" ? { name: mn, roles: ["unknown"] } : mn;
            entry.roles = normalizeRoles(entry);
            if (entry.name) {
              const key = entry.name.toLowerCase().trim();
              if (!allMentionedNames.has(key)) allMentionedNames.set(key, entry);
            }
          });
        }
        for (const [, mn] of allMentionedNames) {
          const roles = normalizeRoles(mn);
          const roleStr = roles.filter(r => r !== "unknown").join(",") || roles[0];
          try {
            await fetch("/api/people/find-or-create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: cleanName(mn.name), role: roleStr, caseId })
            });
          } catch (e) {}
        }
      }
      await sync();
      const savedPerson = cachedServerPeople.find(p => p.id === person.id);
      if (savedPerson) {
        editProfile(savedPerson);
      }
      return;
    } else {
      alert("Profil sunucuya kaydedilemedi.");
    }
  } catch (err) {
    alert("Sunucuya bağlantı hatası.");
  }

  sync();
});

function formatDateForInput(dateStr) {
  const parts = dateStr.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/);
  if (parts) return `${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  const parts2 = dateStr.match(/(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/);
  if (parts2) return `${parts2[1]}-${parts2[2].padStart(2,'0')}-${parts2[3].padStart(2,'0')}`;
  return dateStr;
}

async function initAuth() {
  const localAuthed = localStorage.getItem("dcc_admin_authed") === "1";
  if (localAuthed) {
    try {
      const res = await fetch("/api/me");
      const data = await res.json();
      if (data.authed) {
        loginScreen.style.display = "none";
        return;
      }
    } catch (e) {}
    localStorage.removeItem("dcc_admin_authed");
  }
  loginScreen.style.display = "grid";
}

const nameInput = profileForm.querySelector('[name="name"]');
setupAutocomplete(nameInput, (query) => {
  const q = query.toLowerCase();
  const caseMatches = cachedCasePeople
    .filter(p => p.name && p.name.toLowerCase().includes(q))
    .map(p => ({
      label: p.name,
      fillValue: p.name,
      html: `<div>${highlightMatch(p.name, query)}<div class="ac-meta">${roleLabelsMap[(p.role || "defendant").split(",")[0].trim()] || p.role || ""}${p.organization ? ' · ' + p.organization : ''} <span style="color:#6ee7b7;font-size:0.7rem">Bu dava</span></div></div>`,
      person: p
    }));
  const caseIds = new Set(cachedCasePeople.map(p => p.id));
  const otherMatches = cachedServerPeople
    .filter(p => p.name && p.name.toLowerCase().includes(q) && !caseIds.has(p.id))
    .map(p => ({
      label: p.name,
      fillValue: p.name,
      html: `<div>${highlightMatch(p.name, query)}<div class="ac-meta">${roleLabelsMap[(p.role || "defendant").split(",")[0].trim()] || p.role || ""}${p.organization ? ' · ' + p.organization : ''}</div></div>`,
      person: p
    }));
  return [...caseMatches, ...otherMatches].slice(0, 8);
}, (item) => {
  editProfile(item.person);
}, { minLength: 2 });

setupAutocomplete(tckInput, (query) => {
  const q = query.toLowerCase().replace(/^tck\s*/i, "").trim();
  if (!q) return [];
  return cachedTckDefinitions
    .filter(d => d.code.toLowerCase().includes(q) || (d.short_desc || "").toLowerCase().includes(q))
    .slice(0, 8)
    .map(d => ({
      label: d.code,
      fillValue: d.code.startsWith("TCK") ? d.code : `TCK ${d.code}`,
      html: `<div>${highlightMatch(d.code, q)}${d.short_desc ? '<div class="ac-meta">' + d.short_desc + '</div>' : ''}</div>`
    }));
}, (item) => {
  const val = item.fillValue || item.label;
  if (!currentTckCodes.includes(val)) {
    currentTckCodes.push(val);
    renderTckChips();
  }
  tckInput.value = "";
}, { clearOnSelect: true });

setupAutocomplete(actionInput, (query) => {
  const q = query.replace(/^Eylem\s*/i, "").trim().toLowerCase();
  if (!q) return [];
  const allNums = new Set();
  cachedServerPeople.forEach(p => {
    (p.action_numbers || []).forEach(n => {
      String(n).split(/[,\s]+/).filter(Boolean).forEach(v => allNums.add(v.trim()));
    });
  });
  return [...allNums]
    .filter(n => n.toLowerCase().includes(q))
    .sort((a, b) => {
      const na = parseInt(a, 10), nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    })
    .slice(0, 8)
    .map(n => ({
      label: `Eylem ${n}`,
      fillValue: n,
      html: `<div>Eylem ${highlightMatch(n, q)}</div>`
    }));
}, (item) => {
  const val = item.fillValue;
  if (val && !currentActionNums.includes(val)) {
    currentActionNums.push(val);
    renderActionChips();
  }
  actionInput.value = "";
}, { clearOnSelect: true });

let currentEylemCaseId = null;

function normalizeRoleCode(value) {
  const raw = String(value || "").toLowerCase().trim();
  if (!raw) return "defendant";
  const map = {
    "sanik": "defendant",
    "sanık": "defendant",
    "defendant": "defendant",
    "itirafci": "informant",
    "itirafçı": "informant",
    "informant": "informant",
    "tanik": "witness",
    "tanık": "witness",
    "witness": "witness",
    "gizli tanik": "secretWitness",
    "gizli tanık": "secretWitness",
    "secret witness": "secretWitness",
    "secretwitness": "secretWitness",
    "magdur": "victim",
    "mağdur": "victim",
    "victim": "victim",
    "firari": "fugitive",
    "fugitive": "fugitive",
    "tutuklu": "detained",
    "detained": "detained"
  };
  return map[raw] || "defendant";
}

function roleCodeToLabel(code) {
  return roleLabelsMap[code] || "Sanık";
}

function parsePersonLine(rawLine) {
  const line = String(rawLine || "").replace(/^[-*•]\s*/, "").trim();
  if (!line) return null;
  const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;

  const person = {
    name: cleanName(parts[0]),
    role: "defendant",
    accusations: []
  };

  parts.slice(1).forEach((part) => {
    const m = part.match(/^([^:]+)\s*:\s*(.+)$/);
    if (!m) return;
    const key = String(m[1] || "").toLowerCase().trim();
    const value = String(m[2] || "").trim();
    if (!value) return;
    if (key.includes("rol")) {
      person.role = normalizeRoleCode(value);
      return;
    }
    if (key.includes("suclama") || key.includes("suçlama") || key.includes("iddia")) {
      person.accusations = value
        .split(/[;,]/)
        .map((v) => v.trim())
        .filter(Boolean);
    }
  });

  if (!person.name) return null;
  return person;
}

function parseRelationLine(rawLine) {
  const line = String(rawLine || "").replace(/^[-*•]\s*/, "").trim();
  if (!line) return null;
  const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;

  const pair = parts[0].split("->").map((p) => cleanName(p));
  if (pair.length < 2 || !pair[0] || !pair[1]) return null;

  const relation = {
    from: pair[0],
    to: pair[1],
    type: "",
    context: ""
  };

  parts.slice(1).forEach((part) => {
    const m = part.match(/^([^:]+)\s*:\s*(.+)$/);
    if (!m) return;
    const key = String(m[1] || "").toLowerCase().trim();
    const value = String(m[2] || "").trim();
    if (!value) return;
    if (key.includes("iliski") || key.includes("ilişki") || key.includes("baglanti") || key.includes("bağlantı")) {
      relation.type = value;
      return;
    }
    if (key.includes("baglam") || key.includes("bağlam") || key.includes("aciklama") || key.includes("açıklama") || key.includes("not")) {
      relation.context = value;
    }
  });

  return relation;
}

function parseStructuredEylemText(text) {
  const raw = String(text || "");
  const blocks = [];
  const matches = [...raw.matchAll(/^EYLEM\s+([^\n:]+)\s*:?\s*$/gim)];

  if (!matches.length) return blocks;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const blockStart = m.index + m[0].length;
    const blockEnd = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    const blockText = raw.substring(blockStart, blockEnd).trim();
    const num = String(m[1] || "").trim();

    const row = {
      num,
      summary: "",
      people: [],
      relations: []
    };

    let mode = "summary";
    const lines = blockText.split(/\n/);
    lines.forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      const upper = line.toUpperCase();
      if (upper.startsWith("ÖZET:") || upper.startsWith("OZET:")) {
        mode = "summary";
        row.summary = line.split(":").slice(1).join(":").trim();
        return;
      }
      if (upper.startsWith("DAHİL OLANLAR") || upper.startsWith("DAHIL OLANLAR") || upper.startsWith("KİŞİLER") || upper.startsWith("KISILER")) {
        mode = "people";
        return;
      }
      if (upper.startsWith("İLİŞKİLER") || upper.startsWith("ILISKILER") || upper.startsWith("BAĞLANTILAR") || upper.startsWith("BAGLANTILAR")) {
        mode = "relations";
        return;
      }

      if (mode === "summary") {
        row.summary = row.summary ? `${row.summary} ${line}` : line;
        return;
      }
      if (mode === "people") {
        const person = parsePersonLine(line);
        if (person) row.people.push(person);
        return;
      }
      if (mode === "relations") {
        const relation = parseRelationLine(line);
        if (relation) row.relations.push(relation);
      }
    });

    if (row.num) blocks.push(row);
  }

  return blocks;
}

function renderStructuredEylemPreview(items) {
  if (!eylemStructuredPreview) return;
  eylemStructuredPreview.innerHTML = "";
  if (!items.length) {
    eylemStructuredPreview.innerHTML = `<div class="muted" style="padding:8px 0;">Ayrıştırılacak eylem bulunamadı.</div>`;
    return;
  }

  items.forEach((item) => {
    const div = document.createElement("div");
    div.style.cssText = "border:1px solid rgba(148,163,184,.25); border-radius:8px; padding:10px; margin-bottom:8px;";
    div.innerHTML = `
      <div style="font-weight:600; margin-bottom:4px;">Eylem ${item.num}</div>
      <div style="font-size:.85rem; color:#cbd5e1; margin-bottom:6px;">${item.summary || "Özet yok"}</div>
      <div style="font-size:.8rem; color:#94a3b8;">Kişi: ${item.people.length} · İlişki: ${item.relations.length}</div>
    `;
    eylemStructuredPreview.appendChild(div);
  });
}

async function importStructuredEylems(caseId, items) {
  const peopleByName = new Map();

  for (const eylem of items) {
    for (const person of eylem.people) {
      const key = String(person.name || "").toLowerCase().trim();
      if (!key || peopleByName.has(key)) continue;
      const res = await fetch("/api/people/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName(person.name),
          role: person.role || "defendant",
          caseId
        })
      });
      if (!res.ok) throw new Error("Kişi oluşturma/bağlama başarısız.");
      const created = await res.json();
      peopleByName.set(key, created);
    }
  }

  const touchedPersonIds = new Set();
  items.forEach((eylem) => {
    eylem.people.forEach((p) => {
      const key = String(p.name || "").toLowerCase().trim();
      const person = peopleByName.get(key);
      if (person && person.id) touchedPersonIds.add(person.id);
    });
  });

  for (const personId of touchedPersonIds) {
    await fetch(`/api/actions?personId=${personId}&caseId=${caseId}`, { method: "DELETE" });
  }

  const summaries = [];
  for (const eylem of items) {
    summaries.push({ eylemNum: eylem.num, summary: eylem.summary || "" });

    const relationByFrom = new Map();
    eylem.relations.forEach((rel) => {
      const fromKey = String(rel.from || "").toLowerCase().trim();
      if (!fromKey) return;
      if (!relationByFrom.has(fromKey)) relationByFrom.set(fromKey, []);
      relationByFrom.get(fromKey).push(rel);
    });

    for (const person of eylem.people) {
      const key = String(person.name || "").toLowerCase().trim();
      const sourcePerson = peopleByName.get(key);
      if (!sourcePerson || !sourcePerson.id) continue;

      const links = relationByFrom.get(key) || [];
      const mentionedNames = links.map((rel) => {
        const targetKey = String(rel.to || "").toLowerCase().trim();
        const targetPerson = peopleByName.get(targetKey);
        const role = targetPerson && targetPerson.role ? targetPerson.role : "unknown";
        const pieces = [];
        if (rel.type) pieces.push(rel.type);
        if (rel.context) pieces.push(rel.context);
        return {
          name: cleanName(rel.to),
          roles: [role || "unknown"],
          context: pieces.join(" - ")
        };
      });

      const claimText = (person.accusations || []).join("\n");
      const actionRes = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          personId: sourcePerson.id,
          actionNum: String(eylem.num || "").trim(),
          title: `Eylem ${eylem.num}`,
          claim: claimText,
          mentionedNames
        })
      });
      if (!actionRes.ok) throw new Error(`Eylem kaydı başarısız (Eylem ${eylem.num}).`);
    }
  }

  const summaryRes = await fetch("/api/eylem-summaries/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseId, summaries })
  });
  if (!summaryRes.ok) throw new Error("Eylem özetleri kaydedilemedi.");
}

async function loadEylemSummaries(caseId) {
  currentEylemCaseId = caseId;
  selectedEylemNum = "";
  eylemSummariesList.innerHTML = "";
  if (eylemEditorList) eylemEditorList.innerHTML = "";
  if (!caseId) return;
  const label = document.getElementById("eylem-case-label");
  if (label) {
    const opt = eylemCaseSelect.querySelector(`option[value="${caseId}"]`);
    label.textContent = opt ? opt.textContent : "";
  }
  try {
    const res = await fetch(`/api/eylem-summaries?caseId=${caseId}`);
    const summaries = await res.json();
    for (const s of summaries) addEylemRow(s.eylem_num, s.summary);
  } catch (e) {}
  await loadEylemEditorList(caseId);
  clearEylemEditor();
}

function addEylemRow(num, summary) {
  const row = document.createElement("div");
  row.style.cssText = "margin-bottom: 10px; display: flex; gap: 8px; align-items: flex-start;";
  row.innerHTML = `
    <input type="text" class="eylem-num-input" value="${num || ""}" placeholder="No" style="width: 60px; flex-shrink: 0;" />
    <textarea class="eylem-summary-input" rows="2" style="flex: 1;">${summary || ""}</textarea>
    <button type="button" class="btn ghost eylem-remove-btn" style="flex-shrink: 0; padding: 4px 8px;">✕</button>
  `;
  row.querySelector(".eylem-remove-btn").addEventListener("click", () => row.remove());
  eylemSummariesList.appendChild(row);
}

function clearEylemEditor() {
  if (eylemEditorEmpty) eylemEditorEmpty.style.display = "";
  if (eylemEditorNum) eylemEditorNum.value = "";
  if (eylemEditorSummary) eylemEditorSummary.value = "";
  if (eylemEditorPeople) eylemEditorPeople.value = "";
  if (eylemEditorRelations) eylemEditorRelations.value = "";
}

function parsePeopleTextarea(value) {
  return String(value || "")
    .split(/\n/)
    .map((line) => parsePersonLine(line))
    .filter(Boolean);
}

function parseRelationsTextarea(value) {
  return String(value || "")
    .split(/\n/)
    .map((line) => parseRelationLine(line))
    .filter(Boolean);
}

async function loadEylemEditorList(caseId) {
  if (!eylemEditorList) return;
  eylemEditorList.innerHTML = "";
  if (!caseId) return;

  let summaries = [];
  let actions = [];
  try {
    const [sumRes, actRes] = await Promise.all([
      fetch(`/api/eylem-summaries?caseId=${caseId}`),
      fetch(`/api/actions?caseId=${caseId}`)
    ]);
    summaries = await sumRes.json();
    actions = await actRes.json();
  } catch (e) {
    return;
  }

  const nums = new Set();
  summaries.forEach((s) => {
    const n = String(s.eylem_num || "").trim();
    if (n) nums.add(n);
  });
  actions.forEach((a) => {
    const n = String(a.action_num || "").trim();
    if (n) nums.add(n);
  });

  const ordered = [...nums].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  ordered.forEach((num) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn ghost";
    btn.textContent = `Eylem ${num}`;
    if (num === selectedEylemNum) btn.classList.add("active");
    btn.addEventListener("click", () => openEylemEditor(num));
    eylemEditorList.appendChild(btn);
  });
}

async function openEylemEditor(num) {
  if (!currentEylemCaseId) return;
  selectedEylemNum = String(num || "").trim();
  if (!selectedEylemNum) return;
  if (eylemEditorEmpty) eylemEditorEmpty.style.display = "none";

  let summaries = [];
  let actions = [];
  try {
    const [sumRes, actRes] = await Promise.all([
      fetch(`/api/eylem-summaries?caseId=${currentEylemCaseId}`),
      fetch(`/api/actions?caseId=${currentEylemCaseId}`)
    ]);
    summaries = await sumRes.json();
    actions = await actRes.json();
  } catch (e) {
    return;
  }

  const summaryRow = summaries.find((s) => String(s.eylem_num) === selectedEylemNum);
  if (eylemEditorNum) eylemEditorNum.value = selectedEylemNum;
  if (eylemEditorSummary) eylemEditorSummary.value = summaryRow ? (summaryRow.summary || "") : "";

  const peopleById = new Map(cachedServerPeople.map((p) => [p.id, p]));
  const actionRows = (Array.isArray(actions) ? actions : []).filter((a) => String(a.action_num || "").trim() === selectedEylemNum);
  const grouped = new Map();
  actionRows.forEach((a) => {
    if (!a.person_id) return;
    if (!grouped.has(a.person_id)) grouped.set(a.person_id, []);
    grouped.get(a.person_id).push(a);
  });

  const peopleLines = [];
  grouped.forEach((rows, personId) => {
    const person = peopleById.get(personId);
    const name = cleanName(person ? person.name : personId);
    const role = normalizeRoleCode(person ? person.role : "defendant");
    const claims = rows
      .flatMap((r) => String(r.claim || "").split(/\n/).map((c) => c.trim()).filter(Boolean))
      .filter(Boolean);
    const uniqueClaims = [...new Set(claims)];
    peopleLines.push(`- ${name} | Rol: ${roleCodeToLabel(role)} | Suçlama: ${uniqueClaims.join("; ")}`);
  });
  if (eylemEditorPeople) eylemEditorPeople.value = peopleLines.join("\n");

  const relationLines = [];
  actionRows.forEach((row) => {
    const from = cleanName((peopleById.get(row.person_id) || {}).name || row.person_id);
    const mentioned = Array.isArray(row.mentioned_names) ? row.mentioned_names : [];
    mentioned.forEach((mn) => {
      const entry = typeof mn === "string" ? { name: mn, context: "" } : mn;
      const rel = String(entry.context || "").trim();
      relationLines.push(`- ${from} -> ${cleanName(entry.name)} | İlişki: ${rel}`);
    });
  });
  if (eylemEditorRelations) eylemEditorRelations.value = relationLines.join("\n");
  await loadEylemEditorList(currentEylemCaseId);
}

async function saveEylemEditor() {
  if (!currentEylemCaseId) {
    alert("Önce bir dava seçin.");
    return;
  }
  const num = String((eylemEditorNum && eylemEditorNum.value) || "").trim();
  if (!num) {
    alert("Eylem numarası gerekli.");
    return;
  }
  const summary = String((eylemEditorSummary && eylemEditorSummary.value) || "").trim();
  const people = parsePeopleTextarea(eylemEditorPeople ? eylemEditorPeople.value : "");
  const relations = parseRelationsTextarea(eylemEditorRelations ? eylemEditorRelations.value : "");

  try {
    const resSum = await fetch("/api/eylem-summaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: currentEylemCaseId, eylemNum: num, summary })
    });
    if (!resSum.ok) throw new Error("Eylem özeti kaydedilemedi.");

    const deleteRes = await fetch(`/api/actions/by-eylem?caseId=${currentEylemCaseId}&actionNum=${encodeURIComponent(num)}`, { method: "DELETE" });
    if (!deleteRes.ok) throw new Error("Eski eylem kayıtları temizlenemedi.");

    const peopleByName = new Map();
    for (const p of people) {
      const findRes = await fetch("/api/people/find-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName(p.name), role: p.role || "defendant", caseId: currentEylemCaseId })
      });
      if (!findRes.ok) throw new Error("Kişi kaydı başarısız.");
      const row = await findRes.json();
      peopleByName.set(String(p.name || "").toLowerCase().trim(), row);
    }

    for (const p of people) {
      const key = String(p.name || "").toLowerCase().trim();
      const person = peopleByName.get(key);
      if (!person || !person.id) continue;

      const rels = relations.filter((r) => String(r.from || "").toLowerCase().trim() === key);
      const mentionedNames = rels.map((r) => {
        const target = String(r.to || "").toLowerCase().trim();
        const targetPerson = peopleByName.get(target);
        return {
          name: cleanName(r.to),
          roles: [targetPerson && targetPerson.role ? targetPerson.role : "unknown"],
          context: r.type || r.context || ""
        };
      });

      const claim = (p.accusations || []).join("\n");
      const actionRes = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: currentEylemCaseId,
          personId: person.id,
          actionNum: num,
          title: `Eylem ${num}`,
          claim,
          mentionedNames
        })
      });
      if (!actionRes.ok) throw new Error("Eylem detayları kaydedilemedi.");
    }

    selectedEylemNum = num;
    await sync();
    await loadEylemSummaries(currentEylemCaseId);
    await openEylemEditor(num);
    alert(`Eylem ${num} kaydedildi.`);
  } catch (err) {
    alert(err.message || "Eylem kaydedilemedi.");
  }
}

async function deleteEylemEditor() {
  if (!currentEylemCaseId) return;
  const num = String((eylemEditorNum && eylemEditorNum.value) || selectedEylemNum || "").trim();
  if (!num) return;
  if (!confirm(`Eylem ${num} silinsin mi?`)) return;

  try {
    const res = await fetch(`/api/eylem/${currentEylemCaseId}/${encodeURIComponent(num)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Silme hatası.");
    selectedEylemNum = "";
    await sync();
    await loadEylemSummaries(currentEylemCaseId);
    clearEylemEditor();
    alert(`Eylem ${num} silindi.`);
  } catch (err) {
    alert(err.message || "Eylem silinemedi.");
  }
}

if (eylemCaseSelect) {
  eylemCaseSelect.addEventListener("change", () => {
    const caseId = eylemCaseSelect.value;
    loadEylemSummaries(caseId);
  });
}

if (eylemAddBtn) {
  eylemAddBtn.addEventListener("click", () => {
    const existing = eylemSummariesList.querySelectorAll(".eylem-num-input");
    let nextNum = 1;
    existing.forEach((inp) => {
      const n = parseInt(inp.value, 10);
      if (n >= nextNum) nextNum = n + 1;
    });
    addEylemRow(String(nextNum), "");
  });
}

if (eylemBulkParseBtn) {
  eylemBulkParseBtn.addEventListener("click", () => {
    const text = eylemBulkPaste.value || "";
    const parsed = [];
    const eylemPattern = /EYLEM\s+(\d+)\s*(?:\([^)]*\))?\s*[:\-]?\s*/gi;
    const matches = [...text.matchAll(eylemPattern)];

    if (matches.length > 0) {
      for (let i = 0; i < matches.length; i++) {
        const m = matches[i];
        const startIdx = m.index + m[0].length;
        const endIdx = i + 1 < matches.length ? matches[i + 1].index : text.length;
        const content = text.substring(startIdx, endIdx).trim();
        parsed.push({ num: m[1], summary: content });
      }
    } else {
      const lines = text.split(/\n/);
      let current = null;
      for (const line of lines) {
        const mColon = line.match(/^EYLEM\s+(\d+)\s*:\s*(.*)/i);
        const mNoColon = line.match(/^EYLEM\s+(\d+)\s*$/i);
        if (mColon) {
          if (current) parsed.push(current);
          current = { num: mColon[1], summary: mColon[2].trim() };
        } else if (mNoColon) {
          if (current) parsed.push(current);
          current = { num: mNoColon[1], summary: "" };
        } else if (current && line.trim()) {
          current.summary += (current.summary ? " " : "") + line.trim();
        }
      }
      if (current) parsed.push(current);
    }

    if (parsed.length === 0) {
      alert("Ayrıştırılacak eylem bulunamadı. Format: EYLEM 1: metin veya EYLEM 1 (sonraki satırda metin)");
      return;
    }

    for (const p of parsed) {
      const existingInputs = eylemSummariesList.querySelectorAll(".eylem-num-input");
      let found = false;
      existingInputs.forEach((inp) => {
        if (inp.value === p.num) {
          inp.closest("div").querySelector(".eylem-summary-input").value = p.summary;
          found = true;
        }
      });
      if (!found) addEylemRow(p.num, p.summary);
    }
    eylemBulkPaste.value = "";
    const details = document.getElementById("eylem-bulk-details");
    if (details) details.removeAttribute("open");
    alert(`${parsed.length} eylem ayrıştırıldı ve eklendi.`);
  });
}

if (eylemStructuredParseBtn) {
  eylemStructuredParseBtn.addEventListener("click", () => {
    parsedStructuredEylems = parseStructuredEylemText(eylemStructuredPaste ? eylemStructuredPaste.value : "");
    renderStructuredEylemPreview(parsedStructuredEylems);
    if (!parsedStructuredEylems.length) {
      alert("Şablondan eylem ayrıştırılamadı. Başlıkları 'EYLEM 1', 'EYLEM 2' gibi yazın.");
      return;
    }
    parsedStructuredEylems.forEach((item) => {
      const existingInputs = eylemSummariesList.querySelectorAll(".eylem-num-input");
      let found = false;
      existingInputs.forEach((inp) => {
        if (inp.value === item.num) {
          inp.closest("div").querySelector(".eylem-summary-input").value = item.summary || "";
          found = true;
        }
      });
      if (!found) addEylemRow(item.num, item.summary || "");
    });
    alert(`${parsedStructuredEylems.length} eylem ayrıştırıldı.`);
  });
}

if (eylemStructuredImportBtn) {
  eylemStructuredImportBtn.addEventListener("click", async () => {
    if (!currentEylemCaseId) {
      alert("Önce bir dava seçin.");
      return;
    }
    if (!parsedStructuredEylems.length) {
      parsedStructuredEylems = parseStructuredEylemText(eylemStructuredPaste ? eylemStructuredPaste.value : "");
      renderStructuredEylemPreview(parsedStructuredEylems);
    }
    if (!parsedStructuredEylems.length) {
      alert("İçe aktarılacak eylem verisi yok.");
      return;
    }

    try {
      await importStructuredEylems(currentEylemCaseId, parsedStructuredEylems);
      await sync();
      await loadEylemSummaries(currentEylemCaseId);
      alert("Eylem şablonu içe aktarıldı. Profiller, suçlamalar ve ilişki bağlantıları kaydedildi.");
    } catch (err) {
      alert(err.message || "İçe aktarma sırasında hata oluştu.");
    }
  });
}

if (eylemSaveBtn) {
  eylemSaveBtn.addEventListener("click", async () => {
    if (!currentEylemCaseId) return;
    const rows = eylemSummariesList.querySelectorAll(".eylem-num-input");
    const summaries = [];
    rows.forEach((inp) => {
      const num = inp.value.trim();
      const summary = inp.closest("div").querySelector(".eylem-summary-input").value.trim();
      if (num) summaries.push({ eylemNum: num, summary });
    });

    try {
      const res = await fetch("/api/eylem-summaries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: currentEylemCaseId, summaries })
      });
      if (res.ok) {
        await loadEylemEditorList(currentEylemCaseId);
        alert("Eylem özetleri kaydedildi!");
      } else {
        alert("Kaydetme hatası.");
      }
    } catch (e) {
      alert("Kaydetme hatası: " + e.message);
    }
  });
}

if (eylemEditorNewBtn) {
  eylemEditorNewBtn.addEventListener("click", () => {
    clearEylemEditor();
    if (eylemEditorEmpty) eylemEditorEmpty.style.display = "none";
    const nums = [...eylemSummariesList.querySelectorAll(".eylem-num-input")]
      .map((inp) => parseInt(inp.value, 10))
      .filter((n) => !isNaN(n));
    const nextNum = nums.length ? Math.max(...nums) + 1 : 1;
    if (eylemEditorNum) eylemEditorNum.value = String(nextNum);
  });
}

if (eylemEditorSaveBtn) eylemEditorSaveBtn.addEventListener("click", saveEylemEditor);
if (eylemEditorDeleteBtn) eylemEditorDeleteBtn.addEventListener("click", deleteEylemEditor);

if (tckAdminSaveBtn) {
  tckAdminSaveBtn.addEventListener("click", async () => {
    const code = normalizeTckCodeInput(tckAdminCode ? tckAdminCode.value : "");
    const fullText = String((tckAdminFull && tckAdminFull.value) || "").trim();
    const shortDescInput = String((tckAdminShort && tckAdminShort.value) || "").trim();
    const shortDesc = shortDescInput || deriveShortDesc(fullText);
    if (!code) {
      alert("Madde kodu gerekli.");
      return;
    }
    if (!fullText) {
      alert("Tam açıklama gerekli.");
      return;
    }

    try {
      let res;
      if (editingTckCode) {
        res = await fetch(`/api/tck-definitions/${encodeURIComponent(editingTckCode)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ short_desc: shortDesc, full_text: fullText })
        });
      } else {
        res = await fetch("/api/tck-definitions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code, short_desc: shortDesc, full_text: fullText })
        });
      }
      if (!res.ok) throw new Error("Kaydetme hatası");
      await loadTckDefinitions();
      resetTckAdminForm();
      alert("TCK maddesi kaydedildi.");
    } catch (err) {
      alert("TCK maddesi kaydedilemedi.");
    }
  });
}

if (tckAdminResetBtn) {
  tckAdminResetBtn.addEventListener("click", resetTckAdminForm);
}

if (tckAdminBulkParseBtn) {
  tckAdminBulkParseBtn.addEventListener("click", () => {
    parsedTckBulkItems = parseTckBulkText(tckAdminBulkPaste ? tckAdminBulkPaste.value : "");
    renderTckBulkPreview(parsedTckBulkItems);
    if (!parsedTckBulkItems.length) {
      alert("Parser TCK maddesi bulamadı. Format: 'Madde 1- ...', '(1) ...', 'a) ...'");
      return;
    }
    alert(`${parsedTckBulkItems.length} TCK maddesi ayrıştırıldı.`);
  });
}

if (tckAdminBulkImportBtn) {
  tckAdminBulkImportBtn.addEventListener("click", async () => {
    if (!parsedTckBulkItems.length) {
      parsedTckBulkItems = parseTckBulkText(tckAdminBulkPaste ? tckAdminBulkPaste.value : "");
      renderTckBulkPreview(parsedTckBulkItems);
    }
    if (!parsedTckBulkItems.length) {
      alert("Kaydedilecek TCK maddesi yok.");
      return;
    }
    try {
      for (const item of parsedTckBulkItems) {
        await fetch(`/api/tck-definitions/${encodeURIComponent(item.code)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            short_desc: item.short_desc || "",
            full_text: item.full_text || ""
          })
        });
      }
      await loadTckDefinitions();
      alert("TCK maddeleri kaydedildi.");
    } catch (err) {
      alert("Toplu TCK kaydı sırasında hata oluştu.");
    }
  });
}

initAuth();
loadTckDefinitions();
sync();
