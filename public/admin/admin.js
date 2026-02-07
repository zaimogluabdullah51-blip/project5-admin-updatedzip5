const STORAGE_KEY = "dcc_data";

const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const menuItems = document.querySelectorAll(".menu-item[data-tab]");
const tabPanels = {
  cases: document.getElementById("tab-cases"),
  profiles: document.getElementById("tab-profiles"),
  indictments: document.getElementById("tab-indictments")
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

const tckInput = document.getElementById("tck-input");
const tckAddBtn = document.getElementById("tck-add-btn");
const tckChips = document.getElementById("tck-chips");
const actionInput = document.getElementById("action-input");
const actionAddBtn = document.getElementById("action-add-btn");
const actionChips = document.getElementById("action-chips");

const indictmentForm = document.getElementById("indictment-form");
const indictmentList = document.getElementById("indictment-list");
const indictmentFormTitle = document.getElementById("indictment-form-title");
const indictmentFormReset = document.getElementById("indictment-form-reset");
const indictmentActionsContainer = document.getElementById("indictment-actions-container");
const addIndictmentActionBtn = document.getElementById("add-indictment-action");
const indictmentSubmitBtn = document.getElementById("indictment-submit-btn");
const indictmentParseInput = document.getElementById("indictment-parse-input");
const indictmentParseBtn = document.getElementById("indictment-parse-btn");
const indictmentClearBtn = document.getElementById("indictment-clear-btn");

let lastParsed = null;
let currentTckCodes = [];
let currentActionNums = [];
let cachedServerCases = [];
let cachedServerPeople = [];
let cachedIndictments = [];
let indictmentActionCount = 0;

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
    tabPanels[key].classList.toggle("active-tab", key === tab);
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
  setInput(caseForm, "caseNumber", c.case_number || c.caseNumber || "");
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

function editProfile(p) {
  profileFormTitle.textContent = `Düzenleniyor: ${p.name}`;
  profileFormReset.style.display = "inline-block";

  setInput(profileForm, "editId", p.id);
  setInput(profileForm, "name", p.name);
  setInput(profileForm, "organization", p.organization || "");
  setInput(profileForm, "title", p.title || "");
  setInput(profileForm, "summary", p.charge || p.summary || "");
  setInput(profileForm, "sentenceDemand", p.sentence_demand || p.sentenceDemand || "");
  setInput(profileForm, "photo", p.photo_url || p.photo || "");

  const roleSelect = profileForm.querySelector('[name="role"]');
  if (roleSelect) roleSelect.value = p.role || "defendant";

  const tckArticles = Array.isArray(p.tck_articles) ? p.tck_articles : [];
  currentTckCodes = tckArticles.map(code => {
    const s = String(code).trim();
    return s.startsWith("TCK") ? s : `TCK ${s}`;
  });
  renderTckChips();

  const actionNums = Array.isArray(p.action_numbers) ? p.action_numbers : [];
  currentActionNums = [...actionNums];
  renderActionChips();

  actionsContainer.innerHTML = "";
  lastParsed = null;

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

async function sync() {
  const data = loadData();
  cachedServerCases = await loadServerCases();
  cachedServerPeople = await loadServerPeople();
  cachedIndictments = await loadServerIndictments();

  renderLists(data, cachedServerCases, cachedServerPeople);
  renderIndictmentList();

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
}

function setInput(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value || "";
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
  let val = tckInput.value.trim();
  if (!val) return;
  val = val.replace(/^TCK\s*/i, "").trim();
  val = `TCK ${val}`;
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
    tckCodes: []
  };

  const textBlock = lines.join("\n");

  const fileLine = lines.find((l) => l.trim().startsWith("\u{1F4C2}"));
  if (fileLine) {
    const value = fileLine.split(":").slice(1).join(":").trim();
    const match = value.match(/^(\d{4}\/\d+)\s+(.*)$/);
    if (match) {
      result.caseNumber = match[1];
      result.title = match[2];
    } else if (value.includes("-")) {
      const [num, title] = value.split("-").map((v) => v.trim());
      result.caseNumber = num;
      result.title = title;
    } else {
      result.caseNumber = value;
    }
  }

  const actionLine = lines.find((l) => l.trim().startsWith("\u2696\uFE0F"));
  if (actionLine) {
    const value = actionLine.split(":").slice(1).join(":").trim();
    const [actionsPart] = value.split("|").map((v) => v.trim());
    if (actionsPart) {
      const parts = actionsPart.split(/,|&/).map((v) => v.trim()).filter(Boolean);
      result.actionNumbers = parts;
    }

    const roleKeywords = ["Sanık", "İtirafçı", "Tanık", "Gizli Tanık", "Mağdur", "Firari", "Tutuklu"];
    let foundRole = "";
    let personPart = "";
    for (const keyword of roleKeywords) {
      const roleIdx = actionLine.indexOf(keyword + ":");
      if (roleIdx !== -1) {
        foundRole = keyword;
        personPart = actionLine.slice(roleIdx + keyword.length + 1).trim();
        break;
      }
    }
    if (!foundRole) {
      const pipeIdx = actionLine.indexOf("|");
      if (pipeIdx !== -1) {
        personPart = actionLine.slice(pipeIdx + 1).trim();
        const colonIdx = personPart.indexOf(":");
        if (colonIdx !== -1) {
          foundRole = personPart.slice(0, colonIdx).trim();
          personPart = personPart.slice(colonIdx + 1).trim();
        }
      }
    }
    if (personPart) {
      const unvanMatch = personPart.match(/^([^(]+)\(([^)]+)\)/);
      if (unvanMatch) {
        const nameStr = unvanMatch[1].trim();
        const unvanStr = unvanMatch[2].trim();
        let organization = "";
        let titleVal = "";

        const orgKeywords = [
          "Müdürlüğü", "Müdürlügü",
          "Bakanlığı", "Bakanlıgı",
          "Belediyesi", "Belediye",
          "Başkanlığı", "Başkanlıgı",
          "A.Ş.", "A.S.", "A.Ş",
          "Ltd.", "Ltd",
          "Şirketi", "Sirketi",
          "Holding",
          "Kurumu",
          "Genel Müdürlüğü",
          "Daire Başkanlığı",
          "Emniyet",
          "Üniversitesi",
          "Hastanesi",
          "Vakıfı", "Vakfi",
          "Derneği", "Dernegi",
          "Ajansı",
          "Gazetesi",
          "Bankası",
          "Odası"
        ];

        if (unvanStr.includes(",")) {
          const parts = unvanStr.split(",").map((s) => s.trim());
          const orgIdx = parts.findIndex((p) => orgKeywords.some((k) => p.includes(k)));
          if (orgIdx !== -1) {
            organization = parts[orgIdx];
            titleVal = parts.filter((_, i) => i !== orgIdx).join(", ");
          } else {
            organization = parts[0];
            titleVal = parts.slice(1).join(", ");
          }
        } else if (unvanStr.includes(" - ")) {
          const parts = unvanStr.split(" - ").map((s) => s.trim());
          const orgIdx = parts.findIndex((p) => orgKeywords.some((k) => p.includes(k)));
          if (orgIdx !== -1) {
            organization = parts[orgIdx];
            titleVal = parts.filter((_, i) => i !== orgIdx).join(" - ");
          } else {
            organization = parts[0];
            titleVal = parts.slice(1).join(" - ");
          }
        } else {
          const isOrg = orgKeywords.some((k) => unvanStr.includes(k));
          if (isOrg) {
            organization = unvanStr;
          } else {
            titleVal = unvanStr;
          }
        }
        result.profiles.push({
          name: nameStr,
          role: foundRole || "Sanık",
          organization: organization,
          title: titleVal
        });
      } else {
        result.profiles.push({
          name: personPart.trim(),
          role: foundRole || "Sanık",
          organization: "",
          title: ""
        });
      }
    }
  }

  const summaryMatch = textBlock.match(/\u{1F6A9}\s*İddianame Özeti:\s*([\s\S]*?)(?=\u{1F6A8}|$)/u);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  const sentencePatterns = [
    /Talep edilen ceza:\s*([^\n]+)/i,
    /(\d+[-\u2013]\d+\s*yıl(?:\s*(?:ve|ile)\s*\d+[-\u2013]\d+\s*ay)?\s*(?:hapis|ağır hapis)(?:\s*cezası)?)/i,
    /hapis cezası talep/i
  ];
  for (const pat of sentencePatterns) {
    const m = textBlock.match(pat);
    if (m) {
      result.sentenceDemand = m[1] ? m[1].trim() : m[0].trim();
      break;
    }
  }

  const actionMentions = textBlock.match(/Eylem\s*\d+/gi) || [];
  actionMentions.forEach((item) => {
    const num = item.replace(/Eylem/i, "").trim();
    if (num) result.actionNumbers.push(num);
  });
  result.actionNumbers = Array.from(new Set(result.actionNumbers));

  const accBlocks = textBlock.split(/\u{1F6A8}\s*Suçlama\s*\d+:/u).slice(1);
  accBlocks.forEach((block) => {
    const titleLine = block.split("\n").find((l) => l.trim()).trim();
    const claimMatch = block.match(/İDDİA:\s*([\s\S]*?)(?=DELİL:|SAVUNMA:|$)/);
    const evidenceMatch = block.match(/DELİL:\s*([\s\S]*?)(?=SAVUNMA:|$)/);
    const defenseMatch = block.match(/SAVUNMA:\s*([\s\S]*?)$/);

    const blockTckCodes = parseTck(block);

    const blockActionNums = [];
    const actionRefs = block.match(/Eylem\s*(\d+)/gi) || [];
    actionRefs.forEach((ref) => {
      const n = ref.replace(/Eylem/i, "").trim();
      if (n) blockActionNums.push(n);
    });

    const blockText = [
      claimMatch ? claimMatch[1] : "",
      evidenceMatch ? evidenceMatch[1] : "",
      defenseMatch ? defenseMatch[1] : "",
      titleLine || ""
    ].join(" ");
    const extractedNames = extractNamesFromText(blockText);
    const mentionedNames = extractedNames.map(n => ({ name: n, role: "unknown" }));

    result.accusations.push({
      title: titleLine || "",
      actionNums: Array.from(new Set(blockActionNums)),
      tckCodes: blockTckCodes,
      claim: claimMatch ? claimMatch[1].trim() : "",
      evidence: evidenceMatch ? evidenceMatch[1].trim() : "",
      defense: defenseMatch ? defenseMatch[1].trim() : "",
      mentionedNames
    });
  });

  result.tckCodes = parseTck(text);
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

function renderActionCards(parsed) {
  actionsContainer.innerHTML = "";
  if (!parsed || !parsed.accusations || parsed.accusations.length === 0) return;

  parsed.accusations.forEach((acc, idx) => {
    const card = document.createElement("div");
    card.className = "accusation-card";

    const num = idx + 1;
    const actionsLabel = acc.actionNums && acc.actionNums.length > 0
      ? acc.actionNums.map((n) => `Eylem ${n}`).join(", ")
      : "\u2014";
    const tckList = acc.tckCodes.length > 0 ? acc.tckCodes.join(", ") : "\u2014";

    card.innerHTML = `
      <div class="accusation-card-header">
        <span class="accusation-num">Suçlama ${num}</span>
        <span class="accusation-title">${acc.title || ""}</span>
      </div>
      <div class="accusation-card-body">
        <div class="accusation-row">
          <span class="accusation-label">İddia</span>
          <p class="accusation-text">${formatNumberedItems(acc.claim)}</p>
        </div>
        <div class="accusation-row">
          <span class="accusation-label">Deliller</span>
          <p class="accusation-text">${formatNumberedItems(acc.evidence)}</p>
        </div>
        <div class="accusation-row">
          <span class="accusation-label">Savunma</span>
          <p class="accusation-text">${formatNumberedItems(acc.defense)}</p>
        </div>
        <div class="accusation-meta">
          <span class="accusation-meta-item"><strong>Eylem:</strong> ${actionsLabel}</span>
          <span class="accusation-meta-item"><strong>TCK:</strong> <span class="tck-highlight">${tckList}</span></span>
          ${acc.mentionedNames && acc.mentionedNames.length > 0 ? `
            <div class="mentioned-names-section">
              <strong>Geçen İsimler:</strong>
              <div class="mentioned-names-list" data-acc-idx="${idx}">
                ${acc.mentionedNames.map((mn, mnIdx) => {
                  const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
                  return `<div class="mentioned-name-item">
                    <span class="mentioned-name-text">${entry.name}</span>
                    <select class="mentioned-role-select" data-acc="${idx}" data-mn="${mnIdx}">
                      <option value="unknown"${entry.role === "unknown" ? " selected" : ""}>Bilinmiyor</option>
                      <option value="defendant"${entry.role === "defendant" ? " selected" : ""}>Sanık</option>
                      <option value="informant"${entry.role === "informant" ? " selected" : ""}>İtirafçı</option>
                      <option value="witness"${entry.role === "witness" ? " selected" : ""}>Tanık</option>
                      <option value="secretWitness"${entry.role === "secretWitness" ? " selected" : ""}>Gizli Tanık</option>
                      <option value="victim"${entry.role === "victim" ? " selected" : ""}>Mağdur</option>
                      <option value="fugitive"${entry.role === "fugitive" ? " selected" : ""}>Firari</option>
                      <option value="detained"${entry.role === "detained" ? " selected" : ""}>Tutuklu</option>
                    </select>
                  </div>`;
                }).join("")}
              </div>
            </div>
          ` : ""}
        </div>
      </div>
    `;
    actionsContainer.appendChild(card);
  });

  actionsContainer.addEventListener("change", (e) => {
    if (e.target.classList.contains("mentioned-role-select")) {
      const accIdx = parseInt(e.target.dataset.acc, 10);
      const mnIdx = parseInt(e.target.dataset.mn, 10);
      if (lastParsed && lastParsed.accusations[accIdx] && lastParsed.accusations[accIdx].mentionedNames[mnIdx]) {
        const entry = lastParsed.accusations[accIdx].mentionedNames[mnIdx];
        if (typeof entry === "string") {
          lastParsed.accusations[accIdx].mentionedNames[mnIdx] = { name: entry, role: e.target.value };
        } else {
          entry.role = e.target.value;
        }
      }
    }
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
    setInput(profileForm, "role", roleMap[rawRole] || "defendant");
  }

  setInput(profileForm, "sentenceDemand", parsed.sentenceDemand || "");

  currentTckCodes = [...(parsed.tckCodes || [])];
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

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(caseForm);
  const editId = formData.get("editId");

  const judgeType = formData.get("judgeType");

  const payload = {
    title: formData.get("title"),
    summary: formData.get("summary"),
    case_number: formData.get("caseNumber"),
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

  const profilePayload = {
    name: formData.get("name"),
    role: formData.get("role"),
    organization: formData.get("organization"),
    title: formData.get("title"),
    photo_url: formData.get("photo"),
    tck_articles: currentTckCodes,
    sentence_demand: formData.get("sentenceDemand"),
    action_numbers: currentActionNums,
    charge: formData.get("summary")
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
        for (const acc of lastParsed.accusations) {
          await fetch("/api/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              caseId,
              personId: person.id,
              actionNum: (acc.actionNums || []).join(", "),
              title: acc.title || "",
              claim: acc.claim || "",
              evidence: acc.evidence || "",
              defense: acc.defense || "",
              tckCodes: acc.tckCodes || [],
              sentenceDemand: lastParsed.sentenceDemand || "",
              mentionedNames: acc.mentionedNames || []
            })
          });
        }
      }
    } else {
      alert("Profil sunucuya kaydedilemedi.");
    }
  } catch (err) {
    alert("Sunucuya bağlantı hatası.");
  }

  resetProfileForm();
  sync();
});

// ── İddianame Functions ──

function addIndictmentActionCard(action) {
  indictmentActionCount++;
  const idx = indictmentActionCount;
  const card = document.createElement("div");
  card.className = "accusation-card indictment-action-card";
  card.dataset.idx = idx;
  card.innerHTML = `
    <div class="accusation-card-header">
      <span class="accusation-num">Eylem ${idx}</span>
      <button type="button" class="chip-remove remove-ind-action" title="Kaldır">&times;</button>
    </div>
    <div class="accusation-card-body">
      <label>Eylem Başlığı<input name="ind-action-title-${idx}" value="${action ? (action.title || '') : ''}" placeholder="Örn: Örgüt üyeliği" /></label>
      <label>TCK Maddeleri
        <div class="tck-input-row">
          <input id="ind-tck-input-${idx}" placeholder="Örn: TCK 314/2" />
          <button type="button" class="btn ghost ind-tck-add" data-idx="${idx}">Ekle</button>
        </div>
        <div id="ind-tck-chips-${idx}" class="chips-container"></div>
      </label>
      <label>Deliller<textarea name="ind-action-evidence-${idx}" rows="3" placeholder="Deliller...">${action ? (action.evidence || '') : ''}</textarea></label>
    </div>
  `;
  indictmentActionsContainer.appendChild(card);

  const tckCodes = action && action.tck_codes ? [...action.tck_codes] : [];
  card._tckCodes = tckCodes;
  renderIndTckChips(card, idx);

  card.querySelector(".remove-ind-action").addEventListener("click", () => {
    card.remove();
  });

  card.querySelector(`.ind-tck-add`).addEventListener("click", () => {
    const input = card.querySelector(`#ind-tck-input-${idx}`);
    let val = input.value.trim();
    if (!val) return;
    val = val.replace(/^TCK\s*/i, "").trim();
    val = `TCK ${val}`;
    if (!card._tckCodes.includes(val)) {
      card._tckCodes.push(val);
      renderIndTckChips(card, idx);
    }
    input.value = "";
  });

  const tckInputEl = card.querySelector(`#ind-tck-input-${idx}`);
  tckInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      card.querySelector(`.ind-tck-add`).click();
    }
  });
}

function renderIndTckChips(card, idx) {
  const container = card.querySelector(`#ind-tck-chips-${idx}`);
  container.innerHTML = "";
  card._tckCodes.forEach((code, i) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${code} <button type="button" class="chip-remove">&times;</button>`;
    chip.querySelector(".chip-remove").addEventListener("click", () => {
      card._tckCodes.splice(i, 1);
      renderIndTckChips(card, idx);
    });
    container.appendChild(chip);
  });
}

function collectIndictmentActions() {
  const cards = indictmentActionsContainer.querySelectorAll(".indictment-action-card");
  const actions = [];
  cards.forEach((card) => {
    const idx = card.dataset.idx;
    const title = card.querySelector(`[name="ind-action-title-${idx}"]`)?.value || "";
    const evidence = card.querySelector(`[name="ind-action-evidence-${idx}"]`)?.value || "";
    const tckCodes = card._tckCodes || [];
    actions.push({
      action_num: String(actions.length + 1),
      title,
      tck_codes: tckCodes.map(c => c.replace(/^TCK\s*/i, "").trim()),
      evidence
    });
  });
  return actions;
}

function editIndictment(ind) {
  indictmentFormTitle.textContent = `Düzenleniyor: İddianame`;
  indictmentFormReset.style.display = "inline-block";
  indictmentSubmitBtn.textContent = "Güncelle";

  setInput(indictmentForm, "editId", ind.id);
  setInput(indictmentForm, "summary", ind.summary || "");
  setInput(indictmentForm, "sorusturma_no", ind.sorusturma_no || "");
  setInput(indictmentForm, "esas_no", ind.esas_no || "");
  setInput(indictmentForm, "iddianame_no", ind.iddianame_no || "");
  setInput(indictmentForm, "mahkeme", ind.mahkeme || "");
  setInput(indictmentForm, "iddianame_tarihi", ind.iddianame_tarihi || "");
  setInput(indictmentForm, "kabul_tarihi", ind.kabul_tarihi || "");

  indictmentActionsContainer.innerHTML = "";
  indictmentActionCount = 0;
  if (ind.actions && ind.actions.length > 0) {
    ind.actions.forEach(act => {
      const codes = (act.tck_codes || []).map(c => `TCK ${c}`);
      addIndictmentActionCard({ ...act, tck_codes: codes });
    });
  }

  indictmentForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetIndictmentForm() {
  indictmentForm.reset();
  setInput(indictmentForm, "editId", "");
  indictmentFormTitle.textContent = "İddianame Girişi";
  indictmentFormReset.style.display = "none";
  indictmentSubmitBtn.textContent = "Kaydet";
  indictmentActionsContainer.innerHTML = "";
  indictmentActionCount = 0;
}

async function deleteIndictment(id) {
  if (!confirm("Bu iddianameyi silmek istediğinize emin misiniz?")) return;
  try {
    await fetch(`/api/indictments/${id}`, { method: "DELETE" });
  } catch (e) {}
  resetIndictmentForm();
  sync();
}

async function loadServerIndictments() {
  try {
    const res = await fetch("/api/indictments");
    if (res.ok) return await res.json();
  } catch (e) {}
  return [];
}

function renderIndictmentList() {
  indictmentList.innerHTML = "";
  cachedIndictments.forEach((ind) => {
    const div = document.createElement("div");
    div.className = "list-item";
    const editId = indictmentForm.querySelector('[name="editId"]').value;
    if (editId === ind.id) div.classList.add("list-item-active");
    const actionCount = ind.actions ? ind.actions.length : 0;
    const label = ind.iddianame_no || ind.esas_no || ind.sorusturma_no || "İddianame";
    const mahkeme = ind.mahkeme ? ` — ${ind.mahkeme}` : "";
    div.innerHTML = `<div class="list-item-content"><strong>${label}${mahkeme}</strong><br /><span class="muted">${ind.summary ? ind.summary.substring(0, 60) + '...' : '—'}</span><span class="list-item-meta">${actionCount} eylem</span></div><button class="btn-delete" title="Sil">&times;</button>`;
    div.querySelector(".list-item-content").addEventListener("click", () => editIndictment(ind));
    div.querySelector(".btn-delete").addEventListener("click", (e) => { e.stopPropagation(); deleteIndictment(ind.id); });
    indictmentList.appendChild(div);
  });
}

indictmentFormReset.addEventListener("click", resetIndictmentForm);

addIndictmentActionBtn.addEventListener("click", () => {
  addIndictmentActionCard(null);
});

indictmentParseBtn.addEventListener("click", () => {
  const text = indictmentParseInput.value.trim();
  if (!text) return;
  parseIndictmentText(text);
});

indictmentClearBtn.addEventListener("click", () => {
  indictmentParseInput.value = "";
  resetIndictmentForm();
});

function parseIndictmentText(text) {
  const sorusturmaMatch = text.match(/Soruşturma\s*(?:No|Numarası)?\s*[:\-]?\s*([\d\/\-]+)/i);
  const esasMatch = text.match(/Esas\s*(?:No|Numarası)?\s*[:\-]?\s*([\d\/\-]+)/i);
  const iddianameNoMatch = text.match(/İddianame\s*(?:No|Numarası)?\s*[:\-]?\s*([\d\/\-]+)/i);
  const mahkemeMatch = text.match(/Mahkeme\s*[:\-]?\s*([^\n]+)/i) || text.match(/([\wİıÖöÜüÇçŞşĞğ\s]+(?:Ağır\s*Ceza|Asliye\s*Ceza|Sulh\s*Ceza)[^\n]*)/i);
  const tarihMatch = text.match(/İddianame\s*Tarihi\s*[:\-]?\s*([\d\.\/\-]+)/i);
  const kabulMatch = text.match(/Kabul\s*Tarihi\s*[:\-]?\s*([\d\.\/\-]+)/i);

  if (sorusturmaMatch) setInput(indictmentForm, "sorusturma_no", sorusturmaMatch[1].trim());
  if (esasMatch) setInput(indictmentForm, "esas_no", esasMatch[1].trim());
  if (iddianameNoMatch) setInput(indictmentForm, "iddianame_no", iddianameNoMatch[1].trim());
  if (mahkemeMatch) setInput(indictmentForm, "mahkeme", mahkemeMatch[1].trim());
  if (tarihMatch) setInput(indictmentForm, "iddianame_tarihi", formatDateForInput(tarihMatch[1].trim()));
  if (kabulMatch) setInput(indictmentForm, "kabul_tarihi", formatDateForInput(kabulMatch[1].trim()));

  const eylemBlocks = text.split(/Eylem\s*\d+/i).slice(1);
  if (eylemBlocks.length > 0) {
    indictmentActionsContainer.innerHTML = "";
    indictmentActionCount = 0;
    eylemBlocks.forEach(block => {
      const titleMatch = block.match(/[:\-]?\s*([^\n]+)/);
      const tckMatches = [...block.matchAll(/TCK\s*([\d\/]+(?:\s*-\s*\d+)?)/gi)];
      const delilMatch = block.match(/Delil(?:ler)?\s*[:\-]?\s*([\s\S]*?)(?=TCK|Eylem|$)/i);
      const tckCodes = tckMatches.map(m => `TCK ${m[1].trim()}`);
      addIndictmentActionCard({
        title: titleMatch ? titleMatch[1].trim() : "",
        tck_codes: tckCodes,
        evidence: delilMatch ? delilMatch[1].trim() : ""
      });
    });
  }
}

function formatDateForInput(dateStr) {
  const parts = dateStr.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{4})/);
  if (parts) return `${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
  const parts2 = dateStr.match(/(\d{4})[\.\/\-](\d{1,2})[\.\/\-](\d{1,2})/);
  if (parts2) return `${parts2[1]}-${parts2[2].padStart(2,'0')}-${parts2[3].padStart(2,'0')}`;
  return dateStr;
}

indictmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(indictmentForm);
  const editId = formData.get("editId");
  const summary = formData.get("summary");
  const actions = collectIndictmentActions();

  const payload = {
    summary,
    sorusturma_no: formData.get("sorusturma_no") || "",
    esas_no: formData.get("esas_no") || "",
    iddianame_no: formData.get("iddianame_no") || "",
    mahkeme: formData.get("mahkeme") || "",
    iddianame_tarihi: formData.get("iddianame_tarihi") || "",
    kabul_tarihi: formData.get("kabul_tarihi") || "",
    actions
  };

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/indictments/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch("/api/indictments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
    if (!res.ok) {
      alert("İddianame kaydedilemedi.");
    }
  } catch (err) {
    alert("Sunucuya bağlantı hatası.");
  }

  resetIndictmentForm();
  sync();
});

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

initAuth();
sync();
