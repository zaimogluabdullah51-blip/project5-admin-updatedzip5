const STORAGE_KEY = "dcc_data";

const loginScreen = document.getElementById("login-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout");

const menuItems = document.querySelectorAll(".menu-item");
const tabPanels = {
  cases: document.getElementById("tab-cases"),
  profiles: document.getElementById("tab-profiles")
};

const caseForm = document.getElementById("case-form");
const caseList = document.getElementById("case-list");

const profileForm = document.getElementById("profile-form");
const profileList = document.getElementById("profile-list");
const actionsContainer = document.getElementById("actions-container");

const exportBtn = document.getElementById("export-json");
const importInput = document.getElementById("import-json");

const parseInput = document.getElementById("parse-input");
const parseBtn = document.getElementById("parse-btn");
const clearBtn = document.getElementById("clear-btn");
const parseResults = document.getElementById("parse-results");
const activeCaseSelect = document.getElementById("active-case");

let lastParsed = null;

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

function renderLists(data) {
  caseList.innerHTML = "";
  data.cases.forEach((c) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${c.title}</strong><br /><span class="muted">${c.caseNumber || ''}</span>`;
    caseList.appendChild(div);
  });

  profileList.innerHTML = "";
  data.profiles.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${p.name}</strong><br /><span class="muted">${p.role}</span>`;
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

async function sync() {
  const data = loadData();
  renderLists(data);

  const serverCases = await loadServerCases();
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

function parseTck(text) {
  const codes = new Set();
  const regex = /TCK\s*(\d{2,3})(?:\/([\w.-]+))?/gi;
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
  const standalone = text.match(/\b\d{2,3}\/[0-9a-zA-Z.-]+\b/g) || [];
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
    if (actionLine.includes("San\u0131k:")) {
      const valuePart = actionLine.split("San\u0131k:").pop().trim();
      const roleMatch = valuePart.match(/\(([^)]+)\)/);
      const role = roleMatch ? roleMatch[1].trim() : "San\u0131k";
      const name = valuePart.replace(/\(([^)]+)\)/, "").trim();
      result.profiles.push({ name, role });
    }
  }

  const summaryMatch = textBlock.match(/\u{1F6A9}\s*\u0130ddianame \u00D6zeti:\s*([\s\S]*?)(?=\u{1F6A8}|$)/u);
  if (summaryMatch) {
    result.summary = summaryMatch[1].trim();
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

    const actionMatch = titleLine ? titleLine.match(/Eylem\s*(\d+)/i) : null;
    const actionNum = actionMatch ? actionMatch[1] : "";

    result.accusations.push({
      title: titleLine || "",
      actionNum,
      tckCodes: blockTckCodes,
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

function renderActionCards(parsed) {
  actionsContainer.innerHTML = "";
  if (!parsed || !parsed.accusations || parsed.accusations.length === 0) return;

  parsed.accusations.forEach((acc, idx) => {
    const card = document.createElement("div");
    card.className = "action-card";

    const actionLabel = acc.actionNum ? `Eylem ${acc.actionNum}` : `Suçlama ${idx + 1}`;
    const tckList = acc.tckCodes.length > 0 ? acc.tckCodes.join(", ") : "\u2014";

    card.innerHTML = `
      <div class="action-card-header">
        <strong>${actionLabel}</strong>
        <span class="muted">${acc.title || ""}</span>
      </div>
      <div class="action-card-body">
        <span class="action-tck-label">TCK:</span>
        <span class="action-tck-codes">${tckList}</span>
      </div>
    `;
    actionsContainer.appendChild(card);
  });
}

function applyParsedToForm(parsed) {
  if (!parsed) return;

  setInput(profileForm, "summary", parsed.summary || "");

  if (parsed.profiles[0]) {
    const rawRole = parsed.profiles[0].role || "San\u0131k";
    const name = parsed.profiles[0].name;
    const displayName =
      rawRole && !/san\u0131k|tan\u0131k|itiraf|ma\u011fdur|firari|tutuk/i.test(rawRole)
        ? `${name} (${rawRole})`
        : name;

    if (parsed.title) {
      setInput(profileForm, "name", `${displayName} — ${parsed.title}`);
    } else {
      setInput(profileForm, "name", displayName);
    }

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

  renderActionCards(parsed);
}

function renderParseResults(parsed) {
  parseResults.innerHTML = "";
  if (!parsed) return;

  const info = document.createElement("div");
  info.className = "list-item";

  let tckSummary = "";
  if (parsed.accusations.length > 0) {
    tckSummary = parsed.accusations.map((acc, idx) => {
      const label = acc.actionNum ? `Eylem ${acc.actionNum}` : `Suçlama ${idx + 1}`;
      const codes = acc.tckCodes.length > 0 ? acc.tckCodes.join(", ") : "\u2014";
      return `${label}: ${codes}`;
    }).join("<br />");
  } else {
    tckSummary = parsed.tckCodes.join(", ") || "\u2014";
  }

  info.innerHTML = `
    <strong>\u00D6zet</strong><br />
    <span class="muted">Dosya: ${parsed.caseNumber || "\u2014"} \u00B7 ${parsed.title || ""}</span><br />
    <span class="muted">Eylem: ${parsed.actionNumbers.join(", ") || "\u2014"}</span><br />
    <span class="muted">TCK:<br />${tckSummary}</span><br />
    <span class="muted">Su\u00E7lama say\u0131s\u0131: ${parsed.accusations.length}</span>
  `;
  parseResults.appendChild(info);

  parsed.profiles.forEach((p) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${p.name}</strong><br /><span class="muted">${p.role}</span>`;
    parseResults.appendChild(div);
  });
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

logoutBtn.addEventListener("click", async () => {
  try { await fetch("/api/logout", { method: "POST" }); } catch (e) {}
  localStorage.removeItem("dcc_admin_authed");
  loginScreen.style.display = "grid";
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

  const allTckCodes = lastParsed
    ? lastParsed.accusations.flatMap((a) => a.tckCodes)
    : [];
  const uniqueTck = Array.from(new Set(allTckCodes));

  const actionsWithTck = lastParsed
    ? lastParsed.accusations.map((acc, idx) => ({
        actionNum: acc.actionNum || String(idx + 1),
        tckCodes: acc.tckCodes
      }))
    : [];

  const profileObj = {
    name: formData.get("name"),
    role: formData.get("role"),
    photo: formData.get("photo"),
    summary: formData.get("summary"),
    sentenceDemand: formData.get("sentenceDemand"),
    tckCodes: uniqueTck,
    actionsWithTck
  };

  try {
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profileObj.name,
        role: profileObj.role,
        photo_url: profileObj.photo,
        tck_articles: profileObj.tckCodes
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
              actionNum: acc.actionNum || "",
              title: acc.title || "",
              claim: acc.claim || "",
              evidence: acc.evidence || "",
              defense: acc.defense || "",
              tckCodes: acc.tckCodes || []
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
    alert("JSON okunamad\u0131.");
  }
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
