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

const profileForm = document.getElementById("profile-form");
const profileList = document.getElementById("profile-list");
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

async function deleteCase(id) {
  if (!confirm("Bu davayı silmek istediğinize emin misiniz?\nDavaya bağlı tüm profil bağlantıları ve suçlama kayıtları da silinecektir.")) return;
  try {
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
  } catch (e) {}
  const data = loadData();
  data.cases = data.cases.filter((c) => c.id !== id);
  saveData(data);
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
  sync();
}

function renderLists(data, serverCases, serverPeople) {
  caseList.innerHTML = "";
  const casesToRender = serverCases && serverCases.length > 0 ? serverCases : data.cases;
  casesToRender.forEach((c) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<div class="list-item-content"><strong>${c.title}</strong><br /><span class="muted">${c.case_number || c.caseNumber || ''}</span></div><button class="btn-delete" title="Sil">&times;</button>`;
    div.querySelector(".btn-delete").addEventListener("click", () => deleteCase(c.id));
    caseList.appendChild(div);
  });

  profileList.innerHTML = "";
  const profilesToRender = serverPeople && serverPeople.length > 0 ? serverPeople : data.profiles;
  profilesToRender.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<div class="list-item-content"><strong>${p.name}</strong><br /><span class="muted">${p.role || ''}</span></div><button class="btn-delete" title="Sil">&times;</button>`;
    div.querySelector(".btn-delete").addEventListener("click", () => deleteProfile(p.id));
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
  const serverCases = await loadServerCases();
  const serverPeople = await loadServerPeople();

  renderLists(data, serverCases, serverPeople);

  if (serverCases.length > 0) {
    activeCaseSelect.innerHTML = "";
    serverCases.forEach((c) => {
      const option = document.createElement("option");
      option.value = c.id;
      option.textContent = c.title;
      activeCaseSelect.appendChild(option);
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

    const roleKeywords = ["San\u0131k", "\u0130tiraf\u00E7\u0131", "Tan\u0131k", "Gizli Tan\u0131k", "Ma\u011fdur", "Firari", "Tutuklu"];
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
          "M\u00FCd\u00FCrl\u00FC\u011F\u00FC", "M\u00FCd\u00FCrl\u00FCg\u00FC",
          "Bakanl\u0131\u011F\u0131", "Bakanl\u0131g\u0131",
          "Belediyesi", "Belediye",
          "Ba\u015Fkanl\u0131\u011F\u0131", "Ba\u015Fkanl\u0131g\u0131",
          "A.\u015E.", "A.S.", "A.\u015E",
          "Ltd.", "Ltd",
          "\u015Eirketi", "Sirketi",
          "Holding",
          "Kurumu",
          "Genel M\u00FCd\u00FCrl\u00FC\u011F\u00FC",
          "Daire Ba\u015Fkanl\u0131\u011F\u0131",
          "Emniyet",
          "\u00DCniversitesi",
          "Hastanesi",
          "Vak\u0131f\u0131", "Vakfi",
          "Derne\u011Fi", "Dernegi",
          "Ajans\u0131",
          "Gazetesi",
          "Bankas\u0131",
          "Odas\u0131"
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
          role: foundRole || "San\u0131k",
          organization: organization,
          title: titleVal
        });
      } else {
        result.profiles.push({
          name: personPart.trim(),
          role: foundRole || "San\u0131k",
          organization: "",
          title: ""
        });
      }
    }
  }

  const summaryMatch = textBlock.match(/\u{1F6A9}\s*\u0130ddianame \u00D6zeti:\s*([\s\S]*?)(?=\u{1F6A8}|$)/u);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  const sentencePatterns = [
    /Talep edilen ceza:\s*([^\n]+)/i,
    /(\d+[-\u2013]\d+\s*y\u0131l(?:\s*(?:ve|ile)\s*\d+[-\u2013]\d+\s*ay)?\s*(?:hapis|a\u011f\u0131r hapis)(?:\s*cezas\u0131)?)/i,
    /hapis cezas\u0131 talep/i
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

  const accBlocks = textBlock.split(/\u{1F6A8}\s*Su\u00E7lama\s*\d+:/u).slice(1);
  accBlocks.forEach((block) => {
    const titleLine = block.split("\n").find((l) => l.trim()).trim();
    const claimMatch = block.match(/\u0130DD\u0130A:\s*([\s\S]*?)(?=DEL\u0130L:|SAVUNMA:|$)/);
    const evidenceMatch = block.match(/DEL\u0130L:\s*([\s\S]*?)(?=SAVUNMA:|$)/);
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
        <span class="accusation-num">Su\u00E7lama ${num}</span>
        <span class="accusation-title">${acc.title || ""}</span>
      </div>
      <div class="accusation-card-body">
        <div class="accusation-row">
          <span class="accusation-label">\u0130ddia</span>
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
    const rawRole = profile.role || "San\u0131k";

    setInput(profileForm, "name", profile.name);
    setInput(profileForm, "organization", profile.organization || "");
    setInput(profileForm, "title", profile.title || "");

    const roleMap = {
      "San\u0131k": "defendant",
      "\u0130tiraf\u00E7\u0131": "informant",
      "Tan\u0131k": "witness",
      "Gizli Tan\u0131k": "secretWitness",
      "Ma\u011fdur": "victim",
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
      loginError.textContent = "Hatal\u0131 kullan\u0131c\u0131 ad\u0131 veya \u015fifre.";
    }
  } catch (err) {
    loginError.textContent = "Sunucuya ba\u011flan\u0131lamad\u0131.";
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
  lastParsed = null;
  parseResults.innerHTML = "";
  actionsContainer.innerHTML = "";
  profileForm.reset();
  currentTckCodes = [];
  currentActionNums = [];
  renderTckChips();
  renderActionChips();
});

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = loadData();
  const formData = new FormData(caseForm);
  const id = `case_${Date.now()}`;
  const panel = formData.get("panel")
    ? formData.get("panel").split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  const caseObj = {
    id,
    title: formData.get("title"),
    caseNumber: formData.get("caseNumber"),
    courtName: formData.get("courtName"),
    prosecutor: formData.get("prosecutor"),
    judge: formData.get("judge"),
    panel,
    date: formData.get("date"),
    status: formData.get("status"),
    summary: formData.get("summary")
  };
  data.cases.push(caseObj);
  saveData(data);

  try {
    const res = await fetch("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: caseObj.title,
        summary: caseObj.summary,
        date: caseObj.date,
        status: caseObj.status,
        case_number: caseObj.caseNumber,
        court_name: caseObj.courtName,
        judge: caseObj.judge,
        court_panel: panel.join(", "),
        prosecutor: caseObj.prosecutor
      })
    });
    if (!res.ok) {
      alert("Dava sunucuya kaydedilemedi. L\u00FCtfen tekrar giri\u015f yap\u0131n.");
    }
  } catch (err) {
    alert("Sunucuya ba\u011flant\u0131 hatas\u0131.");
  }

  caseForm.reset();
  sync();
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(profileForm);
  const caseId = activeCaseSelect.value;

  const profileObj = {
    name: formData.get("name"),
    role: formData.get("role"),
    organization: formData.get("organization"),
    title: formData.get("title"),
    photo: formData.get("photo"),
    summary: formData.get("summary"),
    sentenceDemand: formData.get("sentenceDemand"),
    tckCodes: [...currentTckCodes],
    actionNumbers: [...currentActionNums]
  };

  try {
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profileObj.name,
        role: profileObj.role,
        organization: profileObj.organization,
        title: profileObj.title,
        photo_url: profileObj.photo,
        tck_articles: profileObj.tckCodes,
        sentence_demand: profileObj.sentenceDemand,
        action_numbers: profileObj.actionNumbers,
        charge: profileObj.summary
      })
    });
    if (res.ok) {
      const person = await res.json();
      if (caseId) {
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
    alert("Sunucuya ba\u011flant\u0131 hatas\u0131.");
  }

  const data = loadData();
  data.profiles.push({
    id: `profile_${Date.now()}`,
    caseId,
    ...profileObj
  });
  saveData(data);

  profileForm.reset();
  actionsContainer.innerHTML = "";
  parseResults.innerHTML = "";
  lastParsed = null;
  currentTckCodes = [];
  currentActionNums = [];
  renderTckChips();
  renderActionChips();
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
