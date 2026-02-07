const LOGIN_USER = "admin";
const LOGIN_PASS = "Couragea1!";
const STORAGE_KEY = "dcc_data";

const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout");

const menuItems = document.querySelectorAll(".menu-item");
const sections = document.querySelectorAll("[data-section]");

const caseForm = document.getElementById("case-form");
const caseList = document.getElementById("case-list");

const actionForm = document.getElementById("action-form");
const actionList = document.getElementById("action-list");
const actionCaseSelect = document.getElementById("action-case");

const profileForm = document.getElementById("profile-form");
const profileList = document.getElementById("profile-list");
const profileCaseSelect = document.getElementById("profile-case");
const profileActionsSelect = document.getElementById("profile-actions");
const profileTckSelect = document.getElementById("profile-tcks");

const connectionForm = document.getElementById("connection-form");
const connectionList = document.getElementById("connection-list");
const connectionCaseSelect = document.getElementById("connection-case");
const connectionFromSelect = document.getElementById("connection-from");
const connectionToSelect = document.getElementById("connection-to");
const connectionActionSelect = document.getElementById("connection-action");

const infoCaseSelect = document.getElementById("info-case-select");
const caseInfoDisplay = document.getElementById("case-info-display");

const exportBtn = document.getElementById("export-json");
const importInput = document.getElementById("import-json");

const parseInput = document.getElementById("parse-input");
const parseBtn = document.getElementById("parse-btn");
const applyBtn = document.getElementById("apply-btn");
const clearBtn = document.getElementById("clear-btn");
const parseResults = document.getElementById("parse-results");
const activeCaseSelect = document.getElementById("active-case");

let lastParsed = null;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = { cases: [], actions: [], profiles: [], connections: [] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    return { cases: [], actions: [], profiles: [], connections: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function setSection(tab) {
  menuItems.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  sections.forEach((section) => {
    section.hidden = section.dataset.section !== tab;
  });
}

function fillSelect(select, items, labelKey = "title") {
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item[labelKey];
    select.appendChild(option);
  });
}

function fillMulti(select, items, labelKey = "title") {
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item[labelKey];
    select.appendChild(option);
  });
}

function renderLists(data) {
  caseList.innerHTML = "";
  data.cases.forEach((c) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${c.title}</strong><br /><span class="muted">${c.caseNumber}</span>`;
    caseList.appendChild(div);
  });

  actionList.innerHTML = "";
  data.actions.forEach((a) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${a.title}</strong><br /><span class="muted">${a.tckCodes.join(", ")}</span>`;
    actionList.appendChild(div);
  });

  profileList.innerHTML = "";
  data.profiles.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${p.name}</strong><br /><span class="muted">${p.role}</span>`;
    profileList.appendChild(div);
  });

  connectionList.innerHTML = "";
  data.connections.forEach((c) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${c.fromId} → ${c.toId}</strong><br /><span class="muted">${c.direction}</span>`;
    connectionList.appendChild(div);
  });
}

function renderCaseInfo(data) {
  const selectedId = infoCaseSelect.value;
  if (!selectedId) {
    caseInfoDisplay.innerHTML = `<p class="muted">Bir dava seçin.</p>`;
    return;
  }
  const c = data.cases.find((item) => item.id === selectedId);
  if (!c) {
    caseInfoDisplay.innerHTML = `<p class="muted">Dava bulunamadı.</p>`;
    return;
  }

  const statusClass = (c.status || "").toLowerCase().includes("devam") ? "active" : "closed";
  const panelText = Array.isArray(c.panel) ? c.panel.join(", ") : (c.panel || "");

  caseInfoDisplay.innerHTML = `
    <div class="locked-notice">
      <span>&#128274;</span> Bu bilgiler dava oluşturulurken girilmiştir ve değiştirilemez.
    </div>
    <div class="info-card">
      <div class="info-card-header">
        <div class="info-card-icon">&#9878;</div>
        <h3>${c.title || "Adsız Dava"}</h3>
      </div>
      <div class="info-rows">
        <div class="info-row">
          <span class="info-label">Esas No</span>
          <span class="info-value${c.caseNumber ? '' : ' empty'}">${c.caseNumber || 'Belirtilmemiş'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Mahkeme</span>
          <span class="info-value${c.courtName ? '' : ' empty'}">${c.courtName || 'Belirtilmemiş'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Savcı</span>
          <span class="info-value${c.prosecutor ? '' : ' empty'}">${c.prosecutor || 'Belirtilmemiş'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Hakim</span>
          <span class="info-value${c.judge ? '' : ' empty'}">${c.judge || 'Belirtilmemiş'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Heyet</span>
          <span class="info-value${panelText ? '' : ' empty'}">${panelText || 'Belirtilmemiş'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Tarih</span>
          <span class="info-value${c.date ? '' : ' empty'}">${c.date || 'Belirtilmemiş'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Durum</span>
          <span class="info-value"><span class="info-badge ${statusClass}">${c.status || 'Belirtilmemiş'}</span></span>
        </div>
      </div>
    </div>
    ${c.summary ? `
    <div class="info-card">
      <div class="info-card-header">
        <div class="info-card-icon">&#128196;</div>
        <h3>İddianame Özeti</h3>
      </div>
      <div class="info-value" style="white-space: pre-line;">${c.summary}</div>
    </div>` : ''}
    ${c.sentenceDemand ? `
    <div class="info-card">
      <div class="info-card-header">
        <div class="info-card-icon">&#9881;</div>
        <h3>Talep Edilen Ceza</h3>
      </div>
      <div class="info-value">${c.sentenceDemand}</div>
    </div>` : ''}
  `;
}

function refreshSelectors(data) {
  fillSelect(actionCaseSelect, data.cases, "title");
  fillSelect(profileCaseSelect, data.cases, "title");
  fillSelect(connectionCaseSelect, data.cases, "title");
  fillSelect(activeCaseSelect, data.cases, "title");
  fillSelect(infoCaseSelect, data.cases, "title");

  const selectedCaseId = profileCaseSelect.value || (data.cases[0] && data.cases[0].id);
  const actionsForCase = data.actions.filter((a) => a.caseId === selectedCaseId);
  const profilesForCase = data.profiles.filter((p) => p.caseId === selectedCaseId);

  fillMulti(profileActionsSelect, actionsForCase, "title");
  const tckOptions = actionsForCase
    .flatMap((a) => a.tckCodes)
    .filter(Boolean)
    .map((code) => ({ id: code, title: code }))
    .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  fillMulti(profileTckSelect, tckOptions, "title");

  fillSelect(connectionActionSelect, actionsForCase, "title");
  fillSelect(connectionFromSelect, profilesForCase, "name");
  fillSelect(connectionToSelect, profilesForCase, "name");
}

function sync() {
  const data = loadData();
  renderLists(data);
  refreshSelectors(data);
  renderCaseInfo(data);
}

function setInput(form, name, value) {
  const el = form.querySelector(`[name="${name}"]`);
  if (el) el.value = value || "";
}

function parseTck(text) {
  const codes = new Set();
  const regex = /TCK\s*(\d{3})(?:\/([\w.-]+))?/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const base = match[1];
    const suffix = match[2];
    if (suffix) {
      codes.add(`${base}/${suffix}`);
    } else {
      codes.add(base);
    }
    const rest = text.slice(match.index + match[0].length);
    const lineRest = rest.split(/\n/)[0];
    const shortMatches = lineRest.match(/\b(\d+\.[a-z0-9-]+)\b/gi);
    if (shortMatches) {
      shortMatches.forEach((seg) => codes.add(`${base}/${seg}`));
    }
  }
  const standalone = text.match(/\b\d{3}\/[0-9a-zA-Z.-]+\b/g) || [];
  standalone.forEach((seg) => codes.add(seg));
  return Array.from(codes);
}

function parsePastedText(text) {
  const lines = text.split("\n");
  const result = {
    caseNumber: "",
    title: "",
    summary: "",
    actionNumbers: [],
    profiles: [],
    accusations: []
  };

  const textBlock = lines.join("\n");
  const fileLine = lines.find((l) => l.trim().startsWith("📂"));
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

  const actionLine = lines.find((l) => l.trim().startsWith("⚖️"));
  if (actionLine) {
    const value = actionLine.split(":").slice(1).join(":").trim();
    const [actionsPart] = value.split("|").map((v) => v.trim());
    if (actionsPart) {
      const parts = actionsPart.split(/,|&/).map((v) => v.trim()).filter(Boolean);
      result.actionNumbers = parts;
    }
    if (actionLine.includes("Sanık:")) {
      const valuePart = actionLine.split("Sanık:").pop().trim();
      const roleMatch = valuePart.match(/\(([^)]+)\)/);
      const role = roleMatch ? roleMatch[1].trim() : "Sanık";
      const name = valuePart.replace(/\(([^)]+)\)/, "").trim();
      result.profiles.push({ name, role });
    }
  }

  const summaryMatch = textBlock.match(/🚩\s*İddianame Özeti:\s*([\s\S]*?)(?=🚨|$)/);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
  }

  const actionMentions = textBlock.match(/Eylem\s*\d+/gi) || [];
  actionMentions.forEach((item) => {
    const num = item.replace(/Eylem/i, "").trim();
    if (num) result.actionNumbers.push(num);
  });
  result.actionNumbers = Array.from(new Set(result.actionNumbers));

  const accBlocks = textBlock.split(/🚨\s*Suçlama\s*\d+:/).slice(1);
  accBlocks.forEach((block) => {
    const titleLine = block.split("\n").find((l) => l.trim()).trim();
    const claimMatch = block.match(/İDDİA:\s*([\s\S]*?)(?=DELİL:|SAVUNMA:|$)/);
    const evidenceMatch = block.match(/DELİL:\s*([\s\S]*?)(?=SAVUNMA:|$)/);
    const defenseMatch = block.match(/SAVUNMA:\s*([\s\S]*?)$/);
    result.accusations.push({
      title: titleLine || "",
      claim: claimMatch ? claimMatch[1].trim() : "",
      evidence: evidenceMatch ? evidenceMatch[1].trim() : "",
      defense: defenseMatch ? defenseMatch[1].trim() : ""
    });
  });

  const sentenceMatch = textBlock.match(/Talep edilen ceza:\s*([^\n]+)/i);
  result.sentenceDemand = sentenceMatch ? sentenceMatch[1].trim() : "";
  result.tckCodes = parseTck(text);
  return result;
}

function applyParsed(parsed) {
  if (!parsed) return;
  setInput(caseForm, "caseNumber", parsed.caseNumber);
  setInput(caseForm, "title", parsed.title || "Beşiktaş Davası");
  setInput(caseForm, "summary", parsed.summary || "");
  setInput(caseForm, "courtName", "");
  setInput(caseForm, "prosecutor", "");
  setInput(caseForm, "judge", "");
  setInput(caseForm, "panel", "");
  setInput(caseForm, "sentenceDemand", parsed.sentenceDemand || "");

  setInput(
    actionForm,
    "title",
    parsed.actionNumbers.length ? `Eylem ${parsed.actionNumbers[0]}` : "Örgüt Toplantısı"
  );
  setInput(actionForm, "tckCodes", parsed.tckCodes.join(", "));

  if (parsed.profiles[0]) {
    const rawRole = parsed.profiles[0].role || "Sanık";
    const nameWithRole = rawRole && !/sanık|tanık|itiraf|mağdur|firari|tutuk/i.test(rawRole)
      ? `${parsed.profiles[0].name} (${rawRole})`
      : parsed.profiles[0].name;
    setInput(profileForm, "name", nameWithRole);
    const roleMap = {
      Sanık: "defendant",
      İtirafçı: "informant",
      Tanık: "witness",
      "Gizli Tanık": "secretWitness",
      Mağdur: "victim",
      Firari: "fugitive",
      Tutuklu: "detained"
    };
    setInput(profileForm, "role", roleMap[rawRole] || "defendant");
  }
  const claimText = parsed.accusations
    .map((a, idx) => (a.claim.includes("\n") ? a.claim : `${idx + 1}) ${a.claim}`))
    .filter(Boolean)
    .join("\n");
  const evidenceText = parsed.accusations
    .map((a, idx) => (a.evidence.includes("\n") ? a.evidence : `${idx + 1}) ${a.evidence}`))
    .filter(Boolean)
    .join("\n");
  const defenseText = parsed.accusations
    .map((a, idx) => (a.defense.includes("\n") ? a.defense : `${idx + 1}) ${a.defense}`))
    .filter(Boolean)
    .join("\n\n");

  setInput(profileForm, "accusations", claimText);
  setInput(profileForm, "evidence", evidenceText);
  setInput(profileForm, "defense", defenseText);
}

function applyParsedToData(parsed) {
  const data = loadData();
  let caseItem = data.cases.find((c) => c.caseNumber === parsed.caseNumber);
  const activeCaseId = activeCaseSelect.value;
  if (activeCaseId) {
    const selected = data.cases.find((c) => c.id === activeCaseId);
    if (selected) {
      caseItem = selected;
    }
  }
  if (!caseItem) {
    caseItem = {
      id: `case_${Date.now()}`,
      title: parsed.title || "Beşiktaş Dosyası",
      caseNumber: parsed.caseNumber,
      courtName: "",
      prosecutor: "",
      judge: "",
      panel: [],
      date: "",
      status: "Devam Ediyor",
      summary: parsed.summary || "",
      sentenceDemand: parsed.sentenceDemand || ""
    };
    data.cases.push(caseItem);
  } else {
    caseItem.title = parsed.title || caseItem.title;
    caseItem.summary = parsed.summary || caseItem.summary;
    caseItem.sentenceDemand = parsed.sentenceDemand || caseItem.sentenceDemand;
  }

  const actionIds = [];
  parsed.actionNumbers.forEach((num) => {
    const title = `Eylem ${num}`;
    let action = data.actions.find((a) => a.caseId === caseItem.id && a.title === title);
    if (!action) {
      action = {
        id: `action_${caseItem.id}_${num}`,
        caseId: caseItem.id,
        title,
        description: "",
        date: "",
        tckCodes: parsed.tckCodes
      };
      data.actions.push(action);
    } else {
      action.tckCodes = parsed.tckCodes;
    }
    actionIds.push(action.id);
  });

  if (parsed.profiles[0]) {
    const rawRole = parsed.profiles[0].role || "Sanık";
    const roleMap = {
      Sanık: "defendant",
      İtirafçı: "informant",
      Tanık: "witness",
      "Gizli Tanık": "secretWitness",
      Mağdur: "victim",
      Firari: "fugitive",
      Tutuklu: "detained"
    };
    const roleCode = roleMap[rawRole] || "defendant";
    const name = parsed.profiles[0].name;
    const displayName =
      rawRole && !/sanık|tanık|itiraf|mağdur|firari|tutuk/i.test(rawRole)
        ? `${name} (${rawRole})`
        : name;
    let profile = data.profiles.find((p) => p.caseId === caseItem.id && p.name === displayName);
    if (!profile) {
      profile = {
        id: `profile_${caseItem.id}_${Date.now()}`,
        caseId: caseItem.id,
        name: displayName,
        photo: "",
        role: roleCode,
        actionIds,
        tckCodes: parsed.tckCodes,
        accusations: "",
        evidence: "",
        defense: ""
      };
      data.profiles.push(profile);
    }
    profile.actionIds = actionIds;
    profile.tckCodes = parsed.tckCodes;
    profile.accusations = parsed.accusations
      .map((a, idx) => `${idx + 1}) ${a.title ? a.title + " - " : ""}${a.claim}`.trim())
      .filter(Boolean)
      .join("\n");
    profile.evidence = parsed.accusations
      .map((a, idx) => `${idx + 1}) ${a.evidence}`.trim())
      .filter(Boolean)
      .join("\n");
    profile.defense = parsed.accusations
      .map((a, idx) => `${idx + 1}) ${a.defense}`.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  saveData(data);
  sync();
}

function renderParseResults(parsed) {
  parseResults.innerHTML = "";
  if (!parsed) return;

  const info = document.createElement("div");
  info.className = "list-item";
  info.innerHTML = `
    <strong>Özet</strong><br />
    <span class="muted">Dosya: ${parsed.caseNumber || "—"} · ${parsed.title || ""}</span><br />
    <span class="muted">Eylem: ${parsed.actionNumbers.join(", ") || "—"}</span><br />
    <span class="muted">TCK: ${parsed.tckCodes.join(", ") || "—"}</span><br />
    <span class="muted">Suçlama sayısı: ${parsed.accusations.length}</span>
  `;
  parseResults.appendChild(info);

  parsed.profiles.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${p.name}</strong><br /><span class="muted">${p.role}</span>`;
    parseResults.appendChild(div);
  });
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = formData.get("username");
  const password = formData.get("password");
  if (username === LOGIN_USER && password === LOGIN_PASS) {
    localStorage.setItem("dcc_admin_authed", "1");
    loginScreen.style.display = "none";
  } else {
    loginError.textContent = "Hatalı kullanıcı adı veya şifre.";
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("dcc_admin_authed");
  loginScreen.style.display = "grid";
});

menuItems.forEach((btn) => {
  btn.addEventListener("click", () => setSection(btn.dataset.tab));
});

parseBtn.addEventListener("click", () => {
  lastParsed = parsePastedText(parseInput.value || "");
  renderParseResults(lastParsed);
});

applyBtn.addEventListener("click", () => {
  if (!lastParsed) return;
  const ok = window.confirm(
    `Dosya: ${lastParsed.caseNumber || "-"} ${lastParsed.title || ""}\n` +
      `Eylemler: ${lastParsed.actionNumbers.join(", ") || "-"}\n` +
      `Sanık: ${lastParsed.profiles[0] ? lastParsed.profiles[0].name : "-"}\n` +
      `TCK: ${lastParsed.tckCodes.join(", ") || "-"}\n\nUygulansın mı?`
  );
  if (ok) {
    applyParsed(lastParsed);
    applyParsedToData(lastParsed);
  }
});

clearBtn.addEventListener("click", () => {
  parseInput.value = "";
  lastParsed = null;
  parseResults.innerHTML = "";
});

caseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = loadData();
  const formData = new FormData(caseForm);
  const id = `case_${Date.now()}`;
  const panel = formData.get("panel")
    ? formData.get("panel").split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  data.cases.push({
    id,
    title: formData.get("title"),
    caseNumber: formData.get("caseNumber"),
    courtName: formData.get("courtName"),
    prosecutor: formData.get("prosecutor"),
    judge: formData.get("judge"),
    panel,
    date: formData.get("date"),
    status: formData.get("status"),
    summary: formData.get("summary"),
    sentenceDemand: formData.get("sentenceDemand")
  });
  saveData(data);
  caseForm.reset();
  sync();
});

actionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = loadData();
  const formData = new FormData(actionForm);
  const id = `action_${Date.now()}`;
  const tckCodes = formData.get("tckCodes")
    ? formData.get("tckCodes").split(",").map((v) => v.trim()).filter(Boolean)
    : [];
  data.actions.push({
    id,
    caseId: formData.get("caseId"),
    title: formData.get("title"),
    description: formData.get("description"),
    date: formData.get("date"),
    tckCodes
  });
  saveData(data);
  actionForm.reset();
  sync();
});

profileCaseSelect.addEventListener("change", sync);
connectionCaseSelect.addEventListener("change", sync);
infoCaseSelect.addEventListener("change", sync);

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = loadData();
  const formData = new FormData(profileForm);
  const id = `profile_${Date.now()}`;
  const actionIds = Array.from(profileActionsSelect.selectedOptions).map((o) => o.value);
  const tckCodes = Array.from(profileTckSelect.selectedOptions).map((o) => o.value);
  data.profiles.push({
    id,
    caseId: formData.get("caseId"),
    name: formData.get("name"),
    photo: formData.get("photo"),
    role: formData.get("role"),
    actionIds,
    tckCodes,
    accusations: formData.get("accusations"),
    evidence: formData.get("evidence"),
    defense: formData.get("defense")
  });
  saveData(data);
  profileForm.reset();
  sync();
});

connectionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = loadData();
  const formData = new FormData(connectionForm);
  const id = `connection_${Date.now()}`;
  data.connections.push({
    id,
    caseId: formData.get("caseId"),
    fromId: formData.get("fromId"),
    toId: formData.get("toId"),
    actionId: formData.get("actionId"),
    direction: formData.get("direction")
  });
  saveData(data);
  connectionForm.reset();
  sync();
});

exportBtn.addEventListener("click", () => {
  const data = loadData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dava-analiz.json";
  link.click();
  URL.revokeObjectURL(url);
});

importInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text);
    saveData(parsed);
    sync();
  } catch (err) {
    alert("JSON okunamadı.");
  }
});

function initAuth() {
  const authed = localStorage.getItem("dcc_admin_authed") === "1";
  loginScreen.style.display = authed ? "none" : "grid";
}

initAuth();
sync();
