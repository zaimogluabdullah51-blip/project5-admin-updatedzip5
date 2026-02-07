const STORAGE_KEY = "dcc_data";

const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const menuItems = document.querySelectorAll(".menu-item[data-tab]");
const tabPanels = {
  cases: document.getElementById("tab-cases"),
  profiles: document.getElementById("tab-profiles")
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

let lastParsed = null;
let currentTckCodes = [];
let currentActionNums = [];
let cachedServerCases = [];
let cachedServerPeople = [];
let cachedTckDefinitions = [];

async function loadTckDefinitions() {
  try {
    const res = await fetch("/api/tck-definitions");
    if (res.ok) cachedTckDefinitions = await res.json();
  } catch (e) {}
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

  setRoleCheckboxes(p.role || "defendant");

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
            tckCodes: Array.isArray(a.tck_codes) ? a.tck_codes : [],
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
}

function setInput(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value || "";
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

  const section = textBlock.match(/👤\s*SANIK\s*KİMLİĞİ\s*:\s*([\s\S]*?)(?=⚖️|🚨|🖼️?\s*FOTOĞRAF|$)/u);
  if (!section) return null;
  const body = section[1].trim();

  const firstSentence = body.split(/[.,;]/)[0].trim();
  const nameMatch = firstSentence.match(/^([A-ZÇĞİÖŞÜa-zçğıöşü\s]+?)(?:,|\s+(?:bünyesinde|tarafından|hakkında|eski|Eski))/i);
  let name = "";
  if (nameMatch) {
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
  const mnSection = block.match(/👥\s*GEÇEN\s*İSİMLER\s*:\s*([\s\S]*?)(?=🚨|📂|👤|🚩|🖼|$)/u);
  if (!mnSection) {
    const blockText = block.replace(/👥[\s\S]*$/u, "");
    const autoNames = extractNamesFromText(blockText);
    return autoNames.map(n => ({ name: n, role: "unknown", context: "" }));
  }

  const mnBody = mnSection[1].trim();
  const mnLines = mnBody.split("\n").map(l => l.trim()).filter(l => l && !/^(🚨|📂|👤|🚩)/.test(l));

  for (const line of mnLines) {
    const match = line.match(/^([A-ZÇĞİÖŞÜa-zçğıöşü\s]+)\s*\[([^\]]+)\]\s*:\s*(.*)/i);
    if (match) {
      const mnName = match[1].trim();
      const mnRoleTr = match[2].trim();
      const mnContext = match[3].trim().replace(/[.;,]$/, "").trim();
      mentionedNames.push({
        name: mnName,
        role: roleMap[mnRoleTr] || "unknown",
        context: mnContext
      });
    } else {
      const simpleName = line.replace(/^[-•]\s*/, "").trim();
      if (simpleName && /[A-ZÇĞİÖŞÜ]/.test(simpleName[0])) {
        mentionedNames.push({ name: simpleName, role: "unknown", context: "" });
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
    const sentencePatterns = [
      /toplam\s+(.*?hapis\s*cezası)\s*talep/i,
      /Talep edilen ceza:\s*([^\n]+)/i,
      /(\d+[-–]\d+\s*yıl(?:\s*(?:ve|ile)\s*\d+[-–]\d+\s*ay)?\s*(?:hapis|ağır hapis)(?:\s*cezası)?)/i
    ];
    for (const pat of sentencePatterns) {
      const m = textBlock.match(pat);
      if (m) { result.sentenceDemand = m[1] ? m[1].trim() : m[0].trim(); break; }
    }
  }

  const accBlocks = textBlock.split(/🚨\s*SUÇLAMA\s*\d+\s*:/u).slice(1);
  accBlocks.forEach((block) => {
    const firstLine = block.split("\n").find((l) => l.trim())?.trim() || "";

    const eylemMatch = block.match(/EYLEM\s*:\s*([^\n]+)/i);
    const tckMatch = block.match(/TCK\s*:\s*([^\n]+)/i);
    const claimMatch = block.match(/İDDİA\s*:\s*([\s\S]*?)(?=DELİL|SAVUNMA|👥|$)/i);
    const evidenceMatch = block.match(/DELİLLER?\s*:\s*([\s\S]*?)(?=SAVUNMA|👥|$)/i);
    const defenseMatch = block.match(/SAVUNMA\s*:\s*([\s\S]*?)(?=👥|$)/i);

    const blockActionNums = [];
    const eylemSource = eylemMatch ? eylemMatch[1].trim() : block;
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

function renderMentionedNamesForCard(container, accIdx) {
  if (!lastParsed || !lastParsed.accusations[accIdx]) return;
  const names = lastParsed.accusations[accIdx].mentionedNames || [];
  container.innerHTML = "";

  names.forEach((mn, mnIdx) => {
    const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
    if (typeof mn === "string") lastParsed.accusations[accIdx].mentionedNames[mnIdx] = entry;

    const item = document.createElement("div");
    item.className = "mentioned-name-item";
    item.innerHTML = `
      <div class="mentioned-name-top-row">
        <span class="mentioned-name-text">${entry.name}</span>
        <select class="mentioned-role-select" data-acc="${accIdx}" data-mn="${mnIdx}">
          <option value="unknown"${entry.role === "unknown" ? " selected" : ""}>Bilinmiyor</option>
          <option value="defendant"${entry.role === "defendant" ? " selected" : ""}>Sanık</option>
          <option value="informant"${entry.role === "informant" ? " selected" : ""}>İtirafçı</option>
          <option value="witness"${entry.role === "witness" ? " selected" : ""}>Tanık</option>
          <option value="secretWitness"${entry.role === "secretWitness" ? " selected" : ""}>Gizli Tanık</option>
          <option value="victim"${entry.role === "victim" ? " selected" : ""}>Mağdur</option>
          <option value="fugitive"${entry.role === "fugitive" ? " selected" : ""}>Firari</option>
          <option value="detained"${entry.role === "detained" ? " selected" : ""}>Tutuklu</option>
        </select>
        <button type="button" class="btn-remove-name" title="Çıkar">&times;</button>
      </div>
      <input type="text" class="mentioned-context-input" placeholder="Olayla dahili (örn: para transferi yapılan kişi)" value="${(entry.context || "").replace(/"/g, "&quot;")}">
    `;
    item.querySelector(".mentioned-role-select").addEventListener("change", (e) => {
      entry.role = e.target.value;
    });
    item.querySelector(".mentioned-context-input").addEventListener("input", (e) => {
      entry.context = e.target.value;
    });
    item.querySelector(".btn-remove-name").addEventListener("click", () => {
      lastParsed.accusations[accIdx].mentionedNames.splice(mnIdx, 1);
      renderMentionedNamesForCard(container, accIdx);
    });
    container.appendChild(item);
  });

  const addRow = document.createElement("div");
  addRow.className = "mentioned-name-add-row";
  addRow.innerHTML = `
    <input type="text" class="add-name-input" placeholder="İsim Soyad">
    <select class="add-name-role-select">
      <option value="unknown">Bilinmiyor</option>
      <option value="defendant">Sanık</option>
      <option value="informant">İtirafçı</option>
      <option value="witness">Tanık</option>
      <option value="secretWitness">Gizli Tanık</option>
      <option value="victim">Mağdur</option>
      <option value="fugitive">Firari</option>
      <option value="detained">Tutuklu</option>
    </select>
    <button type="button" class="btn-add-name">+</button>
  `;
  const mnNameInput = addRow.querySelector(".add-name-input");
  const roleSelect = addRow.querySelector(".add-name-role-select");
  const addBtn = addRow.querySelector(".btn-add-name");
  addBtn.addEventListener("click", () => {
    const name = mnNameInput.value.trim();
    if (!name) return;
    if (!lastParsed.accusations[accIdx].mentionedNames) lastParsed.accusations[accIdx].mentionedNames = [];
    lastParsed.accusations[accIdx].mentionedNames.push({ name, role: roleSelect.value, context: "" });
    renderMentionedNamesForCard(container, accIdx);
  });
  mnNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !mnNameInput._acSelected) { e.preventDefault(); addBtn.click(); }
    mnNameInput._acSelected = false;
  });
  container.appendChild(addRow);

  setupAutocomplete(mnNameInput, (query) => {
    const q = query.toLowerCase();
    return cachedServerPeople
      .filter(p => p.name && p.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map(p => ({
        label: p.name,
        fillValue: p.name,
        html: `<div>${highlightMatch(p.name, query)}<div class="ac-meta">${roleLabelsMap[(p.role || "").split(",")[0].trim()] || ""}</div></div>`,
        person: p
      }));
  }, (item) => {
    mnNameInput._acSelected = true;
    mnNameInput.value = item.fillValue;
    const personRole = (item.person.role || "").split(",")[0].trim();
    if (personRole && roleSelect.querySelector(`option[value="${personRole}"]`)) {
      roleSelect.value = personRole;
    }
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
      val = val.replace(/^TCK\s*/i, "").trim();
      val = `TCK ${val}`;
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
      const results = cachedTckDefinitions
        .filter(d => d.code.toLowerCase().includes(q) || (d.short_desc || "").toLowerCase().includes(q))
        .slice(0, 6)
        .map(d => ({
          label: d.code,
          fillValue: d.code.startsWith("TCK") ? d.code : `TCK ${d.code}`,
          html: `<div>${highlightMatch(d.code, q)}${d.short_desc ? '<div class="ac-meta">' + d.short_desc + '</div>' : ''}</div>`
        }));
      const existingCodes = new Set(results.map(r => r.label));
      cachedServerPeople.forEach(p => {
        (p.tck_articles || []).forEach(code => {
          const c = String(code).trim();
          if (c && !existingCodes.has(c) && c.toLowerCase().includes(q)) {
            existingCodes.add(c);
            results.push({ label: c, fillValue: c.startsWith("TCK") ? c : `TCK ${c}`, html: `<div>${highlightMatch(c, q)}</div>` });
          }
        });
      });
      return results.slice(0, 6);
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

  const selectedRoles = getSelectedRoles();
  if (selectedRoles.length === 0) selectedRoles.push("defendant");
  const profilePayload = {
    name: formData.get("name"),
    role: selectedRoles.join(","),
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
        if (editId) {
          await fetch(`/api/actions?personId=${person.id}${caseId ? '&caseId=' + caseId : ''}`, { method: "DELETE" });
        }
        const allMentionedNames = new Map();
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
          (acc.mentionedNames || []).forEach(mn => {
            const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
            if (entry.name) {
              const key = entry.name.toLowerCase().trim();
              if (!allMentionedNames.has(key)) allMentionedNames.set(key, entry);
            }
          });
        }
        for (const [, mn] of allMentionedNames) {
          const roleMap = { defendant: "defendant", informant: "informant", witness: "witness", secretWitness: "secretWitness", victim: "victim", fugitive: "fugitive", detained: "detained" };
          try {
            await fetch("/api/people/find-or-create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: mn.name, role: roleMap[mn.role] || mn.role, caseId })
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
  return cachedServerPeople
    .filter(p => p.name && p.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map(p => ({
      label: p.name,
      fillValue: p.name,
      html: `<div>${highlightMatch(p.name, query)}<div class="ac-meta">${roleLabelsMap[(p.role || "defendant").split(",")[0].trim()] || p.role || ""}${p.organization ? ' · ' + p.organization : ''}</div></div>`,
      person: p
    }));
}, (item) => {
  editProfile(item.person);
}, { minLength: 2 });

setupAutocomplete(tckInput, (query) => {
  const q = query.toLowerCase().replace(/^tck\s*/i, "").trim();
  if (!q) return [];
  const fromDefs = cachedTckDefinitions
    .filter(d => d.code.toLowerCase().includes(q) || (d.short_desc || "").toLowerCase().includes(q))
    .slice(0, 8)
    .map(d => ({
      label: d.code,
      fillValue: d.code.startsWith("TCK") ? d.code : `TCK ${d.code}`,
      html: `<div>${highlightMatch(d.code, q)}${d.short_desc ? '<div class="ac-meta">' + d.short_desc + '</div>' : ''}</div>`
    }));
  const existingCodes = new Set(fromDefs.map(d => d.label));
  const fromPeople = [];
  cachedServerPeople.forEach(p => {
    (p.tck_articles || []).forEach(code => {
      const c = String(code).trim();
      if (c && !existingCodes.has(c) && c.toLowerCase().includes(q)) {
        existingCodes.add(c);
        fromPeople.push({
          label: c,
          fillValue: c.startsWith("TCK") ? c : `TCK ${c}`,
          html: `<div>${highlightMatch(c, q)}</div>`
        });
      }
    });
  });
  return [...fromDefs, ...fromPeople].slice(0, 8);
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

initAuth();
loadTckDefinitions();
sync();
