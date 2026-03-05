const caseSelect = document.getElementById("case-select");
const eylemFilter = document.getElementById("eylem-filter");
const nameSearch = document.getElementById("name-search");
const timelineToggle = document.getElementById("timeline-toggle");
const networkToggle = document.getElementById("network-toggle");
const eylemToggle = document.getElementById("eylem-toggle");
const caseDetailToggle = document.getElementById("case-detail-toggle");

const caseTitle = document.getElementById("case-title");
const caseNumber = document.getElementById("case-number");
const caseCourt = document.getElementById("case-court");
const caseJudge = document.getElementById("case-judge");
const caseJudgeLabel = document.getElementById("case-judge-label");
const casePanelEl = document.getElementById("case-panel");
const casePanelRow = document.getElementById("case-panel-row");
const caseProsecutor = document.getElementById("case-prosecutor");
const caseDefendants = document.getElementById("case-defendants");
const caseDates = document.getElementById("case-dates");
const caseStatusEl = document.getElementById("case-status");
const casePanelContainer = document.getElementById("case-panel-container");
const casePanelClose = document.getElementById("case-panel-close");
const casePanelToggle = document.getElementById("case-panel-toggle");
const caseSummaryText = document.getElementById("case-summary-text");
const mapInlineTimeline = document.getElementById("map-inline-timeline");
const mapInlineTrack = document.getElementById("map-inline-track");
const detailDrawer = document.getElementById("detail-drawer");
const mapTopbar = document.querySelector(".map-topbar");
const detailDrawerTitle = document.getElementById("detail-drawer-title");
const detailDrawerBody = document.getElementById("detail-drawer-body");
const detailDrawerClose = document.getElementById("detail-drawer-close");

const caseModal = document.getElementById("case-modal");
const caseClose = document.getElementById("case-close");
const caseDetailTitle = document.getElementById("case-detail-title");
const caseDetailNumber = document.getElementById("case-detail-number");
const caseDetailCourt = document.getElementById("case-detail-court");
const caseDetailJudge = document.getElementById("case-detail-judge");
const caseDetailJudgeLabel = document.getElementById("case-detail-judge-label");
const caseDetailPanel = document.getElementById("case-detail-panel");
const caseDetailPanelRow = document.getElementById("case-detail-panel-row");
const caseDetailProsecutor = document.getElementById("case-detail-prosecutor");
const caseDetailTrialProsecutor = document.getElementById("case-detail-trial-prosecutor");
const caseDetailIndictmentDate = document.getElementById("case-detail-indictment-date");
const caseDetailAcceptanceDate = document.getElementById("case-detail-acceptance-date");
const caseDetailVerdictDate = document.getElementById("case-detail-verdict-date");
const caseDetailStatus = document.getElementById("case-detail-status");
const caseDetailSummary = document.getElementById("case-detail-summary");

const personModal = document.getElementById("person-modal");
const personClose = document.getElementById("person-close");
const personName = document.getElementById("person-name");
const personOrg = document.getElementById("person-org");
const personTitle = document.getElementById("person-title");
const personRole = document.getElementById("person-role");
const personSentence = document.getElementById("person-sentence");
const personSummarySection = document.getElementById("person-summary-section");
const personSummaryText = document.getElementById("person-summary-text");
const personPhoto = document.getElementById("person-photo");
const personActionsList = document.getElementById("person-actions-list");
const personEditBtn = document.getElementById("person-edit-btn");
const personEditCancel = document.getElementById("person-edit-cancel");
const personEditForm = document.getElementById("person-edit-form");
const personViewMode = document.getElementById("person-view-mode");
const personEditMode = document.getElementById("person-edit-mode");

let currentPerson = null;
let network = null;
let cases = [];
let selectedCase = null;
let people = [];
let allActions = [];
let eylemSummaries = {};
let nodesCache = [];
let edgesCache = [];
let timelineVisible = true;
let timelineHasData = false;
let networkPanelVisible = true;
let hierarchyLayerVisible = true;
let actionLayerVisible = true;
let detailPanelVisible = false;
let currentLayoutMode = "none";
let previousLayoutMode = "none";
let tckDefinitionsCache = null;

const fallbackImage = "/assets/default-avatar.svg";

const timelineUtils = window.TimelineUtils || {
  DEFAULT_TRANSITION_YEAR: 2016,
  FEATURED_TRANSITION_PAGE: 657,
  formatDate: (d) => String(d || ""),
  coerceTimelineConfig: (raw) => ({
    enabled: !!(raw && raw.enabled),
    transitionYear: 2016,
    events: Array.isArray(raw && raw.events) ? raw.events : []
  }),
  toneForEvent: () => "cold",
  isFeaturedTransitionEvent: () => false
};

const roleLabels = {
  defendant: "Sanık",
  informant: "İtirafçı",
  witness: "Tanık",
  secretWitness: "Gizli Tanık",
  victim: "Mağdur",
  fugitive: "Firari",
  detained: "Tutuklu"
};

function getRoles(entry) {
  if (entry.roles && Array.isArray(entry.roles)) return entry.roles.filter(r => r !== "unknown");
  if (entry.role && entry.role !== "unknown") {
    return entry.role.split(",").map(r => r.trim()).filter(Boolean);
  }
  return [];
}

function getRolesLabel(entry) {
  const roles = getRoles(entry);
  if (!roles.length) return "";
  return roles.map(r => roleLabels[r] || r).join(" | ");
}

function getPrimaryRole(entry) {
  const roles = getRoles(entry);
  return roles.length ? roles[0] : "unknown";
}

const roleColors = {
  defendant: { border: "#d1d5db", background: "#111827" },
  informant: { border: "#eab308", background: "#111827" },
  witness: { border: "#3b82f6", background: "#111827" },
  secretWitness: { border: "#e5e7eb", background: "#111827" },
  victim: { border: "#a855f7", background: "#111827" },
  fugitive: { border: "#ef4444", background: "#111827" },
  detained: { border: "#9ca3af", background: "#111827" }
};

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setCaseOptions() {
  caseSelect.innerHTML = "";
  for (const item of cases) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.title;
    caseSelect.appendChild(option);
  }
}

function setEylemOptions(eylemNums) {
  eylemFilter.innerHTML = `<option value="all">Tüm Eylemler</option>`;
  for (const num of eylemNums) {
    const option = document.createElement("option");
    option.value = num;
    option.textContent = `Eylem ${num}`;
    eylemFilter.appendChild(option);
  }
}

function renderCaseInfo(caseData) {
  const isPanel = caseData.judge_type === "panel";
  const prosecutor = caseData.indictment_prosecutor || caseData.prosecutor || "—";
  const judgeName = isPanel
    ? (caseData.panel_president || "—")
    : (caseData.judge_name || caseData.judge || "—");
  const panelMembers = caseData.panel_members || caseData.court_panel || "—";
  const acceptanceDate = caseData.acceptance_date || caseData.date || "—";

  caseTitle.textContent = caseData.title || "—";
  caseNumber.textContent = caseData.case_number || "—";
  caseCourt.textContent = caseData.court_name || "—";
  caseProsecutor.textContent = prosecutor;

  if (caseJudgeLabel) caseJudgeLabel.textContent = isPanel ? "Heyet Başkanı" : "Hakim";
  caseJudge.textContent = judgeName;

  if (casePanelRow) casePanelRow.style.display = isPanel ? "" : "none";
  casePanelEl.textContent = panelMembers;

  const defendantCount = (caseData.people || []).filter((p) => !p.is_external).length;
  caseDefendants.textContent = defendantCount || "—";
  caseDates.textContent = acceptanceDate;
  if (caseStatusEl) caseStatusEl.textContent = caseData.status || "—";
  caseSummaryText.textContent = caseData.summary || "—";

  caseDetailTitle.textContent = caseData.title || "—";
  caseDetailNumber.textContent = caseData.case_number || "—";
  caseDetailCourt.textContent = caseData.court_name || "—";
  caseDetailProsecutor.textContent = prosecutor;
  if (caseDetailTrialProsecutor) caseDetailTrialProsecutor.textContent = caseData.trial_prosecutor || "—";

  if (caseDetailJudgeLabel) caseDetailJudgeLabel.textContent = isPanel ? "Heyet Başkanı" : "Hakim";
  caseDetailJudge.textContent = judgeName;
  if (caseDetailPanelRow) caseDetailPanelRow.style.display = isPanel ? "" : "none";
  caseDetailPanel.textContent = panelMembers;

  if (caseDetailIndictmentDate) caseDetailIndictmentDate.textContent = caseData.indictment_date || "—";
  if (caseDetailAcceptanceDate) caseDetailAcceptanceDate.textContent = acceptanceDate;
  if (caseDetailVerdictDate) caseDetailVerdictDate.textContent = caseData.verdict_date || "—";
  if (caseDetailStatus) caseDetailStatus.textContent = caseData.status || "—";
  caseDetailSummary.textContent = caseData.summary || "—";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setToggleActive(button, isActive) {
  if (!button) return;
  button.classList.toggle("active", !!isActive);
}

function showInlineTimeline(visible) {
  if (!mapInlineTimeline) return;
  timelineVisible = !!visible;
  mapInlineTimeline.classList.toggle("is-hidden", !timelineVisible);
  setToggleActive(timelineToggle, timelineVisible);
}

function showNetworkPanel(visible) {
  if (!casePanelContainer) return;
  networkPanelVisible = !!visible;
  casePanelContainer.classList.toggle("collapsed", !networkPanelVisible);
  if (casePanelToggle) casePanelToggle.style.display = networkPanelVisible ? "none" : "block";
  setToggleActive(caseDetailToggle, networkPanelVisible);
}

function syncFloatingPanelOffsets() {
  const topbarHeight = mapTopbar ? Math.ceil(mapTopbar.getBoundingClientRect().height) : 96;
  document.documentElement.style.setProperty("--map-topbar-offset", `${Math.max(topbarHeight, 72)}px`);
}

function showHierarchyLayer(visible) {
  hierarchyLayerVisible = !!visible;
  setToggleActive(networkToggle, hierarchyLayerVisible);
  if (selectedCase) {
    loadCase(selectedCase.id, true);
  } else {
    filterGraph();
  }
}

function showActionLayer(visible) {
  actionLayerVisible = !!visible;
  setToggleActive(eylemToggle, actionLayerVisible);
  if (selectedCase) {
    loadCase(selectedCase.id, true);
  } else {
    filterGraph();
  }
}

function showDetailPanel(visible) {
  if (!detailDrawer) return;
  detailPanelVisible = !!visible;
  detailDrawer.classList.toggle("is-hidden", !detailPanelVisible);
}

function openDetailPanel(title, html) {
  if (detailDrawerTitle) detailDrawerTitle.textContent = title || "Detay";
  if (detailDrawerBody) detailDrawerBody.innerHTML = html || "";
  showDetailPanel(true);
}

function normalizeTckCode(rawCode) {
  const raw = String(rawCode || "").trim();
  return raw.replace(/^TCK\s*/i, "").trim();
}

async function getTckDefinitionsCache() {
  if (tckDefinitionsCache) return tckDefinitionsCache;
  try {
    const res = await fetch("/api/tck-definitions");
    if (!res.ok) throw new Error("TCK API error");
    const rows = await res.json();
    tckDefinitionsCache = new Map();
    rows.forEach((row) => {
      const key = normalizeTckCode(row.code);
      tckDefinitionsCache.set(key, {
        short: row.short_desc || "",
        full: row.full_text || ""
      });
    });
  } catch (e) {
    tckDefinitionsCache = new Map();
  }
  return tckDefinitionsCache;
}

async function openTckPopup(rawCode) {
  const code = normalizeTckCode(rawCode);
  const defs = await getTckDefinitionsCache();
  const exact = defs.get(code) || defs.get(code.split("/")[0]) || { short: "", full: "" };
  const summary = exact.short || exact.full || "Bu TCK maddesi için özet henüz girilmemiş.";

  const old = document.getElementById("tck-quick-popup");
  if (old) old.remove();

  const popup = document.createElement("div");
  popup.id = "tck-quick-popup";
  popup.style.cssText = [
    "position:fixed",
    "right:24px",
    "bottom:24px",
    "z-index:2200",
    "max-width:380px",
    "background:#111827",
    "color:#e5e7eb",
    "border:1px solid rgba(148,163,184,.35)",
    "border-radius:10px",
    "padding:12px 14px",
    "box-shadow:0 8px 30px rgba(0,0,0,.35)"
  ].join(";");
  popup.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
      <strong>TCK ${escapeHtml(code)}</strong>
      <button type="button" id="tck-quick-popup-close" style="background:none;border:none;color:#cbd5e1;cursor:pointer;font-size:18px;line-height:1;">×</button>
    </div>
    <p style="margin:8px 0 10px 0; font-size:.9rem; line-height:1.4;">${escapeHtml(summary)}</p>
    <a href="/tck.html" style="color:#93c5fd; text-decoration:underline; font-size:.9rem;">Daha fazla bilgi için tıklayınız</a>
  `;
  document.body.appendChild(popup);

  const closeBtn = popup.querySelector("#tck-quick-popup-close");
  if (closeBtn) closeBtn.addEventListener("click", () => popup.remove());
}

function scrollToPersonEylemSection(eylemNum) {
  if (!detailDrawerBody) return;
  const target = [...detailDrawerBody.querySelectorAll("[data-eylem-section]")]
    .find((el) => String(el.getAttribute("data-eylem-section") || "") === String(eylemNum || ""));
  if (!target) return;
  target.setAttribute("open", "open");
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderInlineTimeline(config) {
  if (!mapInlineTrack) return;
  if (!config.enabled || !config.events.length) {
    timelineHasData = false;
    mapInlineTrack.innerHTML = "";
    showInlineTimeline(false);
    return;
  }
  timelineHasData = true;

  const items = config.events.map((event, index) => {
    const tone = timelineUtils.toneForEvent(event, config.transitionYear);
    const incident = escapeHtml(event.title || "Olay");
    const arrow = index < config.events.length - 1 ? `<span class="map-inline-arrow">→</span>` : "";
    return `
      <div class="map-inline-item ${tone}">
        <div class="map-inline-date">${escapeHtml(timelineUtils.formatDate(event.date))}</div>
        <div class="map-inline-incident">${incident}</div>
      </div>
      ${arrow}
    `;
  }).join("");

  mapInlineTrack.innerHTML = items;
  showInlineTimeline(timelineVisible);
}

function renderTimeline(caseData) {
  const config = timelineUtils.coerceTimelineConfig(caseData.timeline_data || {});
  renderInlineTimeline(config);
}

function normalizeHierarchyRefs(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

function splitActionNums(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return [];
  const out = [];
  raw
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .forEach((token) => {
      const m = token.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = parseInt(m[2], 10);
        if (!isNaN(start) && !isNaN(end)) {
          const min = Math.min(start, end);
          const max = Math.max(start, end);
          for (let n = min; n <= max; n++) out.push(String(n));
          return;
        }
      }
      out.push(token);
    });
  return [...new Set(out)];
}

function normalizeActionRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const out = [];
  list.forEach((row) => {
    const nums = splitActionNums(row.action_num);
    if (!nums.length) {
      out.push(row);
      return;
    }
    nums.forEach((num) => {
      out.push({ ...row, action_num: num });
    });
  });
  return out;
}

function resolvePersonIdByRef(ref, peopleList, nameToId) {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const byId = peopleList.find((person) => person.id === raw);
  if (byId) return byId.id;
  return nameToId.get(raw.toLowerCase()) || null;
}

function hasActionFocusedData(peopleList) {
  const hasActionRows = (allActions || []).some((action) => String(action.action_num || "").trim());
  const hasSummaryRows = Object.keys(eylemSummaries || {}).length > 0;
  return hasActionRows || hasSummaryRows;
}

function hasHierarchyData(peopleList) {
  return peopleList.some((person) => {
    const hierarchy = person.hierarchy || {};
    const sup = normalizeHierarchyRefs(hierarchy.superiors);
    const sub = normalizeHierarchyRefs(hierarchy.subordinates);
    return sup.length > 0 || sub.length > 0 || (person.related_profiles || []).length > 0;
  });
}

function buildPersonActionNumsMap(peopleList) {
  const map = new Map();
  peopleList.forEach((person) => map.set(person.id, new Set()));
  (allActions || []).forEach((action) => {
    const personId = action.person_id;
    if (!personId || !map.has(personId)) return;
    splitActionNums(action.action_num || "").forEach((num) => {
      const trimmed = String(num || "").trim();
      if (trimmed) map.get(personId).add(trimmed);
    });
  });
  return map;
}

function buildHierarchyGraph(caseData) {
  const peopleList = caseData.people || [];
  const nodes = [];
  const edges = [];
  const hierarchyEdgeSet = new Set();

  const nameToId = new Map();
  for (const person of peopleList) {
    const key = String(person.name || "").toLowerCase().trim();
    if (key && !nameToId.has(key)) nameToId.set(key, person.id);
  }

  const childrenById = new Map();
  const parentsById = new Map();
  const addHierarchyEdge = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) return;
    const key = `${fromId}->${toId}`;
    if (hierarchyEdgeSet.has(key)) return;
    hierarchyEdgeSet.add(key);
    if (!childrenById.has(fromId)) childrenById.set(fromId, new Set());
    if (!parentsById.has(toId)) parentsById.set(toId, new Set());
    childrenById.get(fromId).add(toId);
    parentsById.get(toId).add(fromId);
  };

  for (const person of peopleList) {
    const hierarchy = person.hierarchy || {};
    const superiors = normalizeHierarchyRefs(hierarchy.superiors);
    const subordinates = normalizeHierarchyRefs(hierarchy.subordinates);

    superiors.forEach((ref) => {
      const supId = resolvePersonIdByRef(ref, peopleList, nameToId);
      if (supId) addHierarchyEdge(supId, person.id);
    });

    subordinates.forEach((ref) => {
      const subId = resolvePersonIdByRef(ref, peopleList, nameToId);
      if (subId) addHierarchyEdge(person.id, subId);
    });
  }

  const levels = new Map();
  const indegree = new Map();
  peopleList.forEach((person) => indegree.set(person.id, (parentsById.get(person.id) || new Set()).size));

  let roots = peopleList.filter((person) => (indegree.get(person.id) || 0) === 0).map((person) => person.id);
  if (!roots.length) roots = peopleList.map((person) => person.id);

  const queue = [...roots];
  roots.forEach((id) => levels.set(id, 0));

  while (queue.length) {
    const id = queue.shift();
    const baseLevel = levels.get(id) || 0;
    const children = childrenById.get(id) || new Set();
    children.forEach((childId) => {
      const nextLevel = baseLevel + 1;
      const current = levels.get(childId);
      if (current === undefined || nextLevel > current) levels.set(childId, nextLevel);
      indegree.set(childId, Math.max(0, (indegree.get(childId) || 0) - 1));
      if ((indegree.get(childId) || 0) === 0) queue.push(childId);
    });
  }

  peopleList.forEach((person) => {
    if (!levels.has(person.id)) levels.set(person.id, 0);
  });

  const grouped = new Map();
  peopleList.forEach((person) => {
    const level = levels.get(person.id) || 0;
    if (!grouped.has(level)) grouped.set(level, []);
    grouped.get(level).push(person);
  });

  const sortedLevels = [...grouped.keys()].sort((a, b) => a - b);
  const xGap = 280;
  const yGap = 210;
  const centerX = 520;
  const startY = 120;

  sortedLevels.forEach((level) => {
    const peopleAtLevel = grouped.get(level).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    const count = peopleAtLevel.length;
    const rowStartX = centerX - ((count - 1) * xGap) / 2;
    peopleAtLevel.forEach((person, index) => {
      const y = startY + level * yGap;
      const x = rowStartX + index * xGap;
      const roleText = (person.role || "").split(",").map((r) => roleLabels[r.trim()] || r.trim()).filter(Boolean).join(" | ");
      const orgTitle = [person.organization, person.title].filter(Boolean).join(" · ");
      const lines = [person.name, roleText, orgTitle].filter(Boolean).join("\n");
      nodes.push({
        id: person.id,
        label: lines,
        shape: "box",
        x,
        y,
        fixed: { x: true, y: true },
        widthConstraint: { minimum: 190, maximum: 240 },
        margin: { top: 12, right: 12, bottom: 12, left: 12 },
        font: { color: "#e5e7eb", size: 12, multi: "md", face: "Space Grotesk" },
        borderWidth: 2,
        color: {
          border: "rgba(122, 149, 176, 0.65)",
          background: "rgba(17, 24, 39, 0.85)"
        },
        _eylemNum: "all",
        _layer: "hierarchy"
      });
    });
  });

  hierarchyEdgeSet.forEach((key) => {
    const [fromId, toId] = key.split("->");
    const fromPerson = peopleList.find((person) => person.id === fromId);
    const toPerson = peopleList.find((person) => person.id === toId);
    edges.push({
      from: fromId,
      to: toId,
      arrows: "to",
      color: { color: "rgba(96, 165, 250, 0.55)" },
      smooth: { type: "cubicBezier", roundness: 0.25 },
      width: 2,
      _fromName: fromPerson ? fromPerson.name : fromId,
      _toName: toPerson ? toPerson.name : toId,
      _type: "hierarchy",
      _layer: "hierarchy",
      _details: []
    });
  });

  // Intentionally omit generic profile-to-profile links in hierarchy mode
  // to keep the graph legible; hierarchy edges are the primary relation layer.

  nodesCache = nodes;
  edgesCache = edges;
  return { nodes, edges, eylemNums: [], layoutMode: "hiyerarsi" };
}

function addActionOverlayToHierarchyGraph(graph, caseData) {
  const peopleList = caseData.people || [];
  const peopleById = new Map(peopleList.map((p) => [p.id, p]));
  const personActionNumsMap = buildPersonActionNumsMap(peopleList);
  const nameToIds = new Map();
  peopleList.forEach((p) => {
    const key = String(p.name || "").toLowerCase().trim();
    if (!key) return;
    if (!nameToIds.has(key)) nameToIds.set(key, []);
    nameToIds.get(key).push(p.id);
  });

  const edgeSet = new Set(
    graph.edges.map((edge) => `${edge._type || "edge"}:${edge.from}->${edge.to}`)
  );

  const eylemNumsSet = new Set();
  for (const action of allActions || []) {
    const raw = String(action.action_num || "").trim();
    if (!raw) continue;
    raw.split(/[,\s]+/).filter(Boolean).forEach((v) => {
      const trimmed = v.trim();
      if (trimmed) eylemNumsSet.add(trimmed);
    });
  }

  const eylemNums = [...eylemNumsSet].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  if (eylemNums.length) {
    const nodeXs = graph.nodes.map((n) => Number(n.x)).filter((v) => Number.isFinite(v));
    const nodeYs = graph.nodes.map((n) => Number(n.y)).filter((v) => Number.isFinite(v));
    const minX = nodeXs.length ? Math.min(...nodeXs) : 0;
    const minY = nodeYs.length ? Math.min(...nodeYs) : 120;
    const startX = minX - 360;
    const startY = minY + 10;
    const yStep = 78;

    eylemNums.forEach((num, idx) => {
      const bandId = `band:${num}`;
      if (!graph.nodes.some((n) => n.id === bandId)) {
        graph.nodes.push({
          id: bandId,
          label: `Eylem ${num}`,
          shape: "box",
          x: startX,
          y: startY + idx * yStep,
          fixed: { x: true, y: true },
          widthConstraint: { minimum: 150, maximum: 180 },
          heightConstraint: { minimum: 32, maximum: 36 },
          color: {
            background: "rgba(139, 30, 30, 0.58)",
            border: "rgba(200, 60, 60, 0.46)"
          },
          font: { color: "#fecaca", size: 11, face: "Space Grotesk" },
          borderWidth: 1,
          _eylemNum: num,
          _layer: "action"
        });
      }

      for (const person of peopleList) {
        const nums = personActionNumsMap.get(person.id) || new Set();
        if (!nums.has(num)) continue;
        const relKey = `action-membership:${bandId}->${person.id}`;
        if (edgeSet.has(relKey)) continue;
        edgeSet.add(relKey);
        graph.edges.push({
          from: bandId,
          to: person.id,
          arrows: "to",
          dashes: [4, 4],
          width: 1.4,
          color: { color: "rgba(248, 113, 113, 0.5)" },
          smooth: { type: "continuous" },
          _fromName: `Eylem ${num}`,
          _toName: person.name || person.id,
          _type: "action-membership",
          _layer: "action",
          _details: []
        });
      }
    });
  }

  const mentionedRoleEdgeColors = {
    unknown: "rgba(251, 191, 36, 0.52)",
    defendant: "rgba(209, 213, 219, 0.52)",
    informant: "rgba(234, 179, 8, 0.52)",
    witness: "rgba(59, 130, 246, 0.52)",
    secretWitness: "rgba(229, 231, 235, 0.52)",
    victim: "rgba(168, 85, 247, 0.52)",
    fugitive: "rgba(239, 68, 68, 0.52)",
    detained: "rgba(156, 163, 175, 0.52)"
  };

  const showMentionLinksInOverlay = false;
  if (showMentionLinksInOverlay) for (const action of allActions) {
    const fromId = action.person_id;
    if (!fromId || !peopleById.has(fromId)) continue;
    const mentioned = action.mentioned_names || [];
    for (const mn of mentioned) {
      const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
      const mentionedName = String(entry.name || "").toLowerCase().trim();
      if (!mentionedName) continue;
      const matchedIds = nameToIds.get(mentionedName) || [];
      for (const toId of matchedIds) {
        if (!toId || toId === fromId || !peopleById.has(toId)) continue;
        const key = `mention:${fromId}->${toId}`;
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        const role = getPrimaryRole(entry);
        graph.edges.push({
          from: fromId,
          to: toId,
          dashes: true,
          color: { color: mentionedRoleEdgeColors[role] || mentionedRoleEdgeColors.unknown },
          smooth: { type: "continuous" },
          width: 1.5,
          _fromName: peopleById.get(fromId)?.name || fromId,
          _toName: peopleById.get(toId)?.name || toId,
          _type: "mention",
          _layer: "action",
          _details: [{ eylem: action.action_num || "", role: getRolesLabel(entry), context: entry.context || "" }]
        });
      }
    }
  }

  return graph;
}

function buildGraph(caseData) {
  const peopleList = caseData.people || [];
  const actionAvailable = hasActionFocusedData(peopleList);
  const hierarchyAvailable = hasHierarchyData(peopleList);
  const personActionNumsMap = buildPersonActionNumsMap(peopleList);

  if (!actionLayerVisible && !hierarchyLayerVisible) {
    nodesCache = [];
    edgesCache = [];
    return { nodes: [], edges: [], eylemNums: [], layoutMode: "none" };
  }

  if (hierarchyLayerVisible && hierarchyAvailable) {
    let hierarchyGraph = buildHierarchyGraph(caseData);
    if (actionLayerVisible && actionAvailable) {
      hierarchyGraph = addActionOverlayToHierarchyGraph(hierarchyGraph, caseData);
      nodesCache = hierarchyGraph.nodes;
      edgesCache = hierarchyGraph.edges;
    }
    return hierarchyGraph;
  }

  if (!actionLayerVisible) {
    nodesCache = [];
    edgesCache = [];
    return { nodes: [], edges: [], eylemNums: [], layoutMode: "none" };
  }

  const eylemNumsSet = new Set();
  (allActions || []).forEach((action) => {
    splitActionNums(action.action_num || "").forEach((num) => {
      const trimmed = String(num || "").trim();
      if (trimmed) eylemNumsSet.add(trimmed);
    });
  });

  const eylemNums = [...eylemNumsSet].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const unassignedPeople = peopleList.filter((p) => (personActionNumsMap.get(p.id)?.size || 0) === 0);
  const hasNoEylem = hierarchyLayerVisible && unassignedPeople.length > 0 && eylemNums.length > 0;

  const perRow = 6;
  const rowHeight = 160;
  const bandPadding = 100;
  const bandTopMargin = 18;
  const personTopOffset = 80;
  const spacing = 160;

  const sidePanelCols = 2;
  const sidePanel = {
    x: 1150,
    colSpacing: 140,
    startY: 40,
    spacingY: 80,
    nodeSize: 22
  };

  const nodes = [];
  const personNodeMap = new Map();

  if (eylemNums.length === 0) {
    const perRow = 7;
    const xCenter = 560;
    const yStart = 180;
    const xGap = 170;
    const yGap = 165;
    peopleList.forEach((person, idx) => {
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      const rowCount = Math.min(perRow, peopleList.length - row * perRow);
      const rowStartX = xCenter - ((rowCount - 1) * xGap) / 2;
      const nodeId = `${person.id}:all`;
      const personRole = getPrimaryRole(person);
      const colorSet = roleColors[personRole] || roleColors.defendant;
      const node = {
        id: nodeId,
        label: person.name,
        shape: "circularImage",
        image: person.photo_url || fallbackImage,
        size: person.is_external ? 26 : 30,
        x: rowStartX + col * xGap,
        y: yStart + row * yGap,
        font: { color: "#e5e7eb", size: 12 },
        color: colorSet,
        borderWidth: 3,
        _eylemNum: "all",
        _layer: "action"
      };
      nodes.push(node);
      if (!personNodeMap.has(person.id)) personNodeMap.set(person.id, []);
      personNodeMap.get(person.id).push(nodeId);
    });
  }

  const nameToIds = new Map();
  for (const p of peopleList) {
    const lowerName = (p.name || "").toLowerCase().trim();
    if (lowerName) {
      if (!nameToIds.has(lowerName)) nameToIds.set(lowerName, []);
      nameToIds.get(lowerName).push(p.id);
    }
  }

  const hasGhostNodes = (person, num) => {
    const personActions = allActions.filter(a => a.person_id === person.id);
    for (const action of personActions) {
      const mentioned = action.mentioned_names || [];
      if (!mentioned.length) continue;
      for (const mn of mentioned) {
        const mName = (typeof mn === "string" ? mn : mn.name).toLowerCase().trim();
        const matchedIds = nameToIds.get(mName) || [];
        if (!matchedIds.length) return true;
      }
    }
    return false;
  };

  const laneHeights = eylemNums.map((num) => {
    const peopleInEylem = peopleList.filter((p) => {
      const nums = personActionNumsMap.get(p.id) || new Set();
      return nums.has(num);
    });
    const rows = Math.max(1, Math.ceil(peopleInEylem.length / perRow));
    const anyGhosts = peopleInEylem.some(p => hasGhostNodes(p, num));
    const ghostExtra = anyGhosts ? 120 : 0;
    return personTopOffset + rows * rowHeight + ghostExtra + bandPadding;
  });

  const cumulativeY = [0];
  for (let i = 1; i < eylemNums.length; i++) {
    cumulativeY.push(cumulativeY[i - 1] + laneHeights[i - 1]);
  }

  const bandNodes = eylemNums.map((num, index) => {
    return {
      id: `band:${num}`,
      label: `Eylem ${num}`,
      shape: "box",
      widthConstraint: { minimum: 720, maximum: 960 },
      heightConstraint: { minimum: 36, maximum: 36 },
      x: 420,
      y: cumulativeY[index] + bandTopMargin,
      fixed: { x: true, y: true },
      selectable: true,
      chosen: false,
      color: {
        background: "rgba(139, 30, 30, 0.55)",
        border: "rgba(200, 60, 60, 0.4)"
      },
      font: { color: "#fca5a5", size: 12, face: "Space Grotesk" },
      borderWidth: 0,
      _eylemNum: num,
      _layer: "action"
    };
  });

  if (hasNoEylem) {
    const totalEylemHeight = eylemNums.length > 0
      ? cumulativeY[cumulativeY.length - 1] + laneHeights[laneHeights.length - 1]
      : 400;
    const eylemCenterY = totalEylemHeight / 2;

    const totalRows = Math.ceil(unassignedPeople.length / sidePanelCols);
    const panelContentHeight = totalRows * sidePanel.spacingY;
    const labelGap = 40;
    const totalPanelHeight = labelGap + panelContentHeight;

    const panelStartY = eylemCenterY - totalPanelHeight / 2;

    const panelWidth = (sidePanelCols - 1) * sidePanel.colSpacing;
    const panelCenterX = sidePanel.x + panelWidth / 2;
    const sideLabelNode = {
      id: "band:unassigned",
      label: "Eyleme Atanmamış",
      shape: "box",
      widthConstraint: { minimum: panelWidth + 60, maximum: panelWidth + 100 },
      heightConstraint: { minimum: 28, maximum: 28 },
      x: panelCenterX,
      y: panelStartY,
      fixed: { x: true, y: true },
      selectable: false,
      color: {
        background: "rgba(100, 80, 30, 0.55)",
        border: "rgba(180, 150, 60, 0.4)"
      },
      font: { color: "#fbbf24", size: 11, face: "Space Grotesk" },
      _eylemNum: "other",
      _layer: "action"
    };
    bandNodes.push(sideLabelNode);

    unassignedPeople.forEach((person, idx) => {
      const col = idx % sidePanelCols;
      const row = Math.floor(idx / sidePanelCols);
      const nodeId = `${person.id}:other`;
      const personRole = getPrimaryRole(person);
      const colorSet = roleColors[personRole] || roleColors.defendant;
      const node = {
        id: nodeId,
        label: person.name,
        shape: "circularImage",
        image: person.photo_url || fallbackImage,
        size: sidePanel.nodeSize,
        x: sidePanel.x + col * sidePanel.colSpacing,
        y: panelStartY + labelGap + row * sidePanel.spacingY,
        font: { color: "#e5e7eb", size: 10 },
        color: colorSet,
        borderWidth: 2,
        _eylemNum: "other",
        _layer: "action"
      };
      nodes.push(node);
      if (!personNodeMap.has(person.id)) personNodeMap.set(person.id, []);
      personNodeMap.get(person.id).push(nodeId);
    });
  }

  eylemNums.forEach((num, index) => {
    const peopleInEylem = peopleList.filter((p) => {
      const nums = personActionNumsMap.get(p.id) || new Set();
      return nums.has(num);
    });

    const totalInRow = Math.min(peopleInEylem.length, perRow);
    const baseY = cumulativeY[index];

    peopleInEylem.forEach((person, idx) => {
      const column = idx % perRow;
      const row = Math.floor(idx / perRow);
      const rowCount = row === 0 ? totalInRow : Math.min(peopleInEylem.length - row * perRow, perRow);
      const rowStartX = 420 - ((rowCount - 1) * spacing) / 2;

      const nodeId = `${person.id}:${num}`;
      const personRole = (person.role || "defendant").split(",")[0].trim();
      const colorSet = roleColors[personRole] || roleColors.defendant;
      const node = {
        id: nodeId,
        label: person.name,
        shape: "circularImage",
        image: person.photo_url || fallbackImage,
        size: person.is_external ? 26 : 30,
        x: rowStartX + column * spacing,
        y: baseY + personTopOffset + row * rowHeight,
        font: { color: "#e5e7eb", size: 12 },
        color: colorSet,
        borderWidth: 3,
        _eylemNum: num,
        _layer: "action"
      };
      nodes.push(node);
      if (!personNodeMap.has(person.id)) personNodeMap.set(person.id, []);
      personNodeMap.get(person.id).push(nodeId);
    });
  });

  const edges = [];
  const edgeSet = new Set();
  const showProfileLinksInAction = false;

  const pickNodeForAction = (personId, actionNum) => {
    const ids = personNodeMap.get(personId) || [];
    if (!ids.length) return null;
    const num = String(actionNum || "").trim();
    if (num) {
      const exact = ids.find((id) => id.endsWith(`:${num}`));
      if (exact) return exact;
    }
    const other = ids.find((id) => id.endsWith(":other"));
    return other || ids[0];
  };

  if (showProfileLinksInAction) {
    for (const person of peopleList) {
      const related = person.related_profiles || [];
      for (const targetId of related) {
        const fromNodes = personNodeMap.get(person.id) || [];
        const toNodes = personNodeMap.get(targetId) || [];
        if (!fromNodes.length || !toNodes.length) continue;
        const key = [person.id, targetId].sort().join("|");
        if (edgeSet.has(key)) continue;
        edgeSet.add(key);
        const targetPerson = peopleList.find(p => p.id === targetId);
        edges.push({
          from: fromNodes[0],
          to: toNodes[0],
          color: { color: "rgba(148, 163, 184, 0.35)" },
          smooth: { type: "continuous" },
          _fromName: person.name,
          _toName: targetPerson ? targetPerson.name : targetId,
          _type: "related",
          _layer: "action",
          _details: []
        });
      }
    }
  }

  const hierarchyEdgeSet = new Set();
  const personNameToId = new Map();
  peopleList.forEach((person) => {
    const key = String(person.name || "").toLowerCase().trim();
    if (key && !personNameToId.has(key)) personNameToId.set(key, person.id);
  });

  const resolveHierarchyRefToId = (ref) => {
    const raw = String(ref || "").trim();
    if (!raw) return null;
    const byId = peopleList.find((person) => person.id === raw);
    if (byId) return byId.id;
    return personNameToId.get(raw.toLowerCase()) || null;
  };

  const addHierarchyActionEdge = (fromPersonId, toPersonId) => {
    const fromNodes = personNodeMap.get(fromPersonId) || [];
    const toNodes = personNodeMap.get(toPersonId) || [];
    if (!fromNodes.length || !toNodes.length || fromPersonId === toPersonId) return;
    const key = `${fromPersonId}->${toPersonId}`;
    if (hierarchyEdgeSet.has(key)) return;
    hierarchyEdgeSet.add(key);
    const fromPerson = peopleList.find((person) => person.id === fromPersonId);
    const toPerson = peopleList.find((person) => person.id === toPersonId);
    edges.push({
      from: fromNodes[0],
      to: toNodes[0],
      arrows: "to",
      color: { color: "rgba(96, 165, 250, 0.52)" },
      smooth: { type: "cubicBezier", roundness: 0.28 },
      width: 2,
      _fromName: fromPerson ? fromPerson.name : fromPersonId,
      _toName: toPerson ? toPerson.name : toPersonId,
      _type: "hierarchy",
      _layer: "hierarchy",
      _details: []
    });
  };

  if (hierarchyLayerVisible && showProfileLinksInAction) {
    peopleList.forEach((person) => {
      const hierarchy = person.hierarchy || {};
      const superiors = normalizeHierarchyRefs(hierarchy.superiors);
      const subordinates = normalizeHierarchyRefs(hierarchy.subordinates);
      superiors.forEach((ref) => {
        const supId = resolveHierarchyRefToId(ref);
        if (supId) addHierarchyActionEdge(supId, person.id);
      });
      subordinates.forEach((ref) => {
        const subId = resolveHierarchyRefToId(ref);
        if (subId) addHierarchyActionEdge(person.id, subId);
      });
    });
  }

  const mentionedRoleEdgeColors = {
    unknown: "rgba(251, 191, 36, 0.5)",
    defendant: "rgba(209, 213, 219, 0.5)",
    informant: "rgba(234, 179, 8, 0.5)",
    witness: "rgba(59, 130, 246, 0.5)",
    secretWitness: "rgba(229, 231, 235, 0.5)",
    victim: "rgba(168, 85, 247, 0.5)",
    fugitive: "rgba(239, 68, 68, 0.5)",
    detained: "rgba(156, 163, 175, 0.5)"
  };

  const ghostNodes = new Map();
  let ghostCounter = 0;
  const personMentionCounts = new Map();
  const personMentionAngles = new Map();
  const mentionRadius = 180;

  const showMentionLinksInAction = true;
  if (showMentionLinksInAction) for (const action of allActions) {
    const mentionedNames = action.mentioned_names || [];
    if (!mentionedNames.length || !action.person_id) continue;

    const actionNum = String(action.action_num || "").split(/[,\s]+/)[0].trim();
    const fromNodeId = pickNodeForAction(action.person_id, actionNum);
    if (!fromNodeId) continue;

    const parentNodeId = fromNodeId;
    const parentNode = nodes.find(n => n.id === parentNodeId);
    if (!parentNode) continue;

    if (!personMentionCounts.has(action.person_id)) {
      let totalMentions = 0;
      for (const a of allActions) {
        if (a.person_id !== action.person_id) continue;
        totalMentions += (a.mentioned_names || []).length;
      }
      personMentionCounts.set(action.person_id, totalMentions);
      const spread = Math.min(Math.PI, Math.PI * 0.15 * totalMentions);
      const start = totalMentions === 1 ? Math.PI / 2 : (Math.PI / 2) - (spread / 2);
      personMentionAngles.set(action.person_id, start);
    }

    const totalMentions = personMentionCounts.get(action.person_id);
    const fanSpread = Math.min(Math.PI, Math.PI * 0.15 * totalMentions);
    const angleStep = totalMentions > 1 ? fanSpread / (totalMentions - 1) : 0;

    for (const mn of mentionedNames) {
      const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
      const lowerMentioned = entry.name.toLowerCase().trim();
      const mentionedRole = getPrimaryRole(entry);
      const mentionedRolesAll = getRoles(entry);
      const matchedIds = nameToIds.get(lowerMentioned) || [];

      if (matchedIds.length) {
        for (const matchedId of matchedIds) {
          if (matchedId === action.person_id) continue;
          const toNodeId = pickNodeForAction(matchedId, actionNum);
          if (!toNodeId) continue;

          const key = `mention:${fromNodeId}->${toNodeId}`;
          if (edgeSet.has(key)) continue;
          edgeSet.add(key);
          const parentPerson = peopleList.find(p => p.id === action.person_id);
          const matchedPerson = peopleList.find(p => p.id === matchedId);
          edges.push({
            from: fromNodeId,
            to: toNodeId,
            color: { color: mentionedRoleEdgeColors[mentionedRole] || mentionedRoleEdgeColors.unknown },
            smooth: { type: "continuous" },
            dashes: true,
            _fromName: parentPerson ? parentPerson.name : "",
            _toName: matchedPerson ? matchedPerson.name : entry.name,
            _type: "mention",
            _layer: "action",
            _hoverOnly: true,
            _details: [{ eylem: actionNum || action.action_num || "", role: getRolesLabel(entry), context: entry.context || "" }]
          });
        }
      } else {
        const ghostKey = `${actionNum || "other"}::${lowerMentioned}`;
        if (!ghostNodes.has(ghostKey)) {
          ghostCounter++;
          const ghostId = `ghost:${ghostCounter}`;
          const ghostColorSet = roleColors[mentionedRole] || roleColors.defendant;

          const currentAngle = personMentionAngles.get(action.person_id);
          const ghostX = parentNode.x + Math.cos(currentAngle) * mentionRadius;
          const ghostY = parentNode.y + Math.sin(currentAngle) * mentionRadius;
          personMentionAngles.set(action.person_id, currentAngle + angleStep);

          const rolesLbl = getRolesLabel(entry);
          const ghostLabel = rolesLbl ? `${entry.name}\n(${rolesLbl})` : entry.name;
          const ghostNode = {
            id: ghostId,
            label: ghostLabel,
            shape: "circularImage",
            image: fallbackImage,
            size: 22,
            font: { color: "rgba(229, 231, 235, 0.5)", size: 11, multi: "md" },
            color: {
              border: ghostColorSet.border,
              background: "rgba(17, 24, 39, 0.4)"
            },
            borderWidth: 2,
            opacity: 0.55,
            x: ghostX,
            y: ghostY,
            _isGhost: true,
            _ghostName: entry.name,
            _ghostRole: mentionedRole,
            _ghostRoles: mentionedRolesAll,
            _eylemNum: actionNum || "other",
            _layer: "action"
          };

          ghostNodes.set(ghostKey, { id: ghostId, parentId: action.person_id });
          nodes.push(ghostNode);
        } else {
          const skipAngle = personMentionAngles.get(action.person_id);
          personMentionAngles.set(action.person_id, skipAngle + angleStep);
        }

        const ghostInfo = ghostNodes.get(ghostKey);
        const ghostNodeId = ghostInfo.id;
        const key = `mention:${fromNodeId}->${ghostNodeId}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          const parentPerson = peopleList.find(p => p.id === action.person_id);
          edges.push({
            from: fromNodeId,
            to: ghostNodeId,
            color: { color: mentionedRoleEdgeColors[mentionedRole] || mentionedRoleEdgeColors.unknown },
            smooth: { type: "continuous" },
            dashes: true,
            _fromName: parentPerson ? parentPerson.name : "",
            _toName: entry.name,
            _type: "mention",
            _layer: "action",
            _hoverOnly: true,
            _details: [{ eylem: actionNum || action.action_num || "", role: getRolesLabel(entry), context: entry.context || "" }]
          });
        }
      }
    }
  }

  nodesCache = [...bandNodes, ...nodes];
  edgesCache = edges;

  return { nodes: nodesCache, edges, eylemNums, layoutMode: "eylem" };
}

function filterGraph(preserveViewport = true) {
  if (!network) return;
  const query = nameSearch.value.toLowerCase().trim();
  const eylem = eylemFilter.value;
  const viewPos = preserveViewport ? network.getViewPosition() : null;
  const scale = preserveViewport ? network.getScale() : null;

  const nodes = nodesCache.filter((node) => {
    const isBand = node.id.startsWith("band:");
    const nodeLayer = node._layer || (isBand ? "action" : "base");
    const matchesName = !query || node.label.toLowerCase().includes(query);
    const matchesEylem = !actionLayerVisible || eylem === "all" || node._eylemNum === eylem;

    if (!actionLayerVisible && nodeLayer === "action") return false;
    if (isBand) return matchesEylem;
    return matchesName && matchesEylem;
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = edgesCache.filter((edge) => {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) return false;
    if (!hierarchyLayerVisible && edge._layer === "hierarchy") return false;
    if (!actionLayerVisible && edge._layer === "action") return false;
    if (edge._hoverOnly) return false;
    return true;
  });

  network.setData({ nodes, edges });
  if (preserveViewport && viewPos && Number.isFinite(scale)) {
    network.moveTo({ position: viewPos, scale, animation: false });
  }
}

function openPersonModal(person, preferredActionNum = "") {
  currentPerson = person;
  const roles = (person.role || "")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => roleLabels[r] || r)
    .join(", ");

  const tckTags = (person.tck_articles || [])
    .map((code) => {
      const normalized = normalizeTckCode(code);
      const label = String(code).startsWith("TCK") ? code : `TCK ${code}`;
      return `<button type="button" class="tag small js-tck-tag" data-tck-code="${escapeHtml(normalized)}">${escapeHtml(label)}</button>`;
    })
    .join("");
  const eylemTags = (person.action_numbers || [])
    .map((num) => `<button type="button" class="tag small eylem-tag js-eylem-tag" data-eylem-num="${escapeHtml(String(num))}">Eylem ${escapeHtml(num)}</button>`)
    .join("");

  const prefNum = String(preferredActionNum || "").trim();
  const personActions = allActions
    .filter((a) => a.person_id === person.id)
    .sort((a, b) => {
      const aNum = String(a.action_num || "").trim();
      const bNum = String(b.action_num || "").trim();
      const aPref = prefNum && aNum === prefNum ? 1 : 0;
      const bPref = prefNum && bNum === prefNum ? 1 : 0;
      if (aPref !== bPref) return bPref - aPref;
      const na = parseInt(aNum, 10);
      const nb = parseInt(bNum, 10);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return aNum.localeCompare(bNum);
    });
  const rawAccusations = Array.isArray(person.accusations) ? person.accusations : [];
  let profileAccusations = rawAccusations
    .map((acc, idx) => {
      if (acc && typeof acc === "object") {
        return {
          no: acc.order || idx + 1,
          title: acc.title || "",
          claim: acc.claim || "",
          evidence: acc.evidence || "",
          defense: acc.defense || ""
        };
      }
      const text = String(acc || "").trim();
      if (!text) return null;
      return { no: idx + 1, title: "", claim: text, evidence: "", defense: "" };
    })
    .filter(Boolean);

  // Backward compatibility: many existing profiles keep accusation detail in actions rows.
  if (!profileAccusations.length) {
    const seen = new Set();
    const fromActions = [];
    personActions.forEach((row) => {
      const payload = {
        title: String(row.title || "").trim(),
        claim: String(row.claim || "").trim(),
        evidence: String(row.evidence || "").trim(),
        defense: String(row.defense || "").trim()
      };
      if (!payload.title && !payload.claim && !payload.evidence && !payload.defense) return;
      const key = JSON.stringify(payload);
      if (seen.has(key)) return;
      seen.add(key);
      fromActions.push(payload);
    });
    profileAccusations = fromActions.map((acc, idx) => ({ no: idx + 1, ...acc }));
  }

  const accusationsHtml = profileAccusations.length
    ? profileAccusations.map((acc) => `
      <details class="profile-collapse action-collapse">
        <summary class="profile-collapse-summary">
          <span>${escapeHtml(String(acc.no))}. Suçlama${acc.title ? ` — ${escapeHtml(acc.title)}` : ""}</span>
        </summary>
        <article class="action-card">
          <div class="action-section"><span class="action-label">İddia</span><p>${escapeHtml(acc.claim || "—")}</p></div>
          <div class="action-section"><span class="action-label">Delil</span><p>${escapeHtml(acc.evidence || "—")}</p></div>
          <div class="action-section"><span class="action-label">Savunma</span><p>${escapeHtml(acc.defense || "—")}</p></div>
        </article>
      </details>
    `).join("")
    : `<p class="muted">Profil bölümünde suçlama detayı bulunmuyor.</p>`;

  const eylemGroups = new Map();
  personActions.forEach((row) => {
    const num = String(row.action_num || "").trim();
    if (!num) return;
    if (!eylemGroups.has(num)) eylemGroups.set(num, []);
    eylemGroups.get(num).push(row);
  });
  const orderedEylemNums = [...eylemGroups.keys()].sort((a, b) => {
    const aPreferred = prefNum && String(a) === prefNum ? 1 : 0;
    const bPreferred = prefNum && String(b) === prefNum ? 1 : 0;
    if (aPreferred !== bPreferred) return bPreferred - aPreferred;
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const eylemlerHtml = orderedEylemNums.length
    ? orderedEylemNums.map((num) => {
      const rows = eylemGroups.get(num) || [];
      const summaryText = String(eylemSummaries[num] || "").trim();
      const claims = rows
        .map((r) => String(r.claim || "").trim())
        .filter(Boolean);
      const uniqueClaims = [...new Set(claims)];
      const isPreferred = prefNum && String(num) === prefNum;
      return `
        <details class="profile-collapse action-collapse" data-eylem-section="${escapeHtml(String(num))}" ${isPreferred ? "open" : ""}>
          <summary class="profile-collapse-summary">
            <span>Eylem ${escapeHtml(num)}</span>
          </summary>
          <article class="action-card">
            <div class="action-section"><span class="action-label">Eylem Özeti</span><p>${escapeHtml(summaryText || "Bu eylem için özet girilmemiş.")}</p></div>
            <div class="action-section"><span class="action-label">Kişinin Dahli / İddia</span><p>${escapeHtml(uniqueClaims.join("\n\n") || "Bu kişi için dahli iddiası girilmemiş.")}</p></div>
          </article>
        </details>
      `;
    }).join("")
    : `<p class="muted">Bu kişi için eylem kaydı bulunmuyor.</p>`;

  const bodyHtml = `
    <section class="person-drawer-card">
      <div class="person-modal-head">
        <img class="avatar lg" src="${escapeHtml(person.photo_url || fallbackImage)}" alt="profile" />
        <div>
          <p class="person-drawer-meta">${escapeHtml(person.organization || "")}</p>
          <p class="person-drawer-meta">${escapeHtml(person.title || "")}</p>
          <p class="person-drawer-meta">${escapeHtml(roles || "")}</p>
          ${person.sentence_demand ? `<p class="tag">Talep: ${escapeHtml(person.sentence_demand)}</p>` : ""}
          ${(tckTags || eylemTags) ? `<div class="person-tags">${tckTags}${eylemTags}</div>` : ""}
        </div>
      </div>
      <details class="profile-collapse" open>
        <summary class="profile-collapse-summary"><span>Savcılık Suçlamaları (${profileAccusations.length})</span></summary>
        <div class="person-actions-list">${accusationsHtml}</div>
      </details>
      <details class="profile-collapse" open>
        <summary class="profile-collapse-summary"><span>Eylemler (${orderedEylemNums.length})</span></summary>
        <div class="person-actions-list">${eylemlerHtml}</div>
      </details>
    </section>
  `;

  openDetailPanel(person.name || "Profil", bodyHtml);
  if (detailDrawerBody) {
    detailDrawerBody.querySelectorAll(".js-eylem-tag").forEach((btn) => {
      btn.addEventListener("click", () => {
        const num = btn.getAttribute("data-eylem-num") || "";
        scrollToPersonEylemSection(num);
      });
    });
    detailDrawerBody.querySelectorAll(".js-tck-tag").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = btn.getAttribute("data-tck-code") || "";
        await openTckPopup(code);
      });
    });
  }
}

function openGhostModal(ghostNode) {
  const ghostModal = document.getElementById("ghost-modal");
  const ghostName = document.getElementById("ghost-name");
  const ghostRole = document.getElementById("ghost-role");
  const ghostClose = document.getElementById("ghost-close");
  const mentionsList = document.getElementById("ghost-mentions-list");

  ghostName.textContent = ghostNode._ghostName || "";
  const ghostRoles = ghostNode._ghostRoles || (ghostNode._ghostRole ? [ghostNode._ghostRole] : []);
  const roleLbl = ghostRoles.length
    ? ghostRoles.map(r => roleLabels[r] || r).join(" | ")
    : "Bilinmiyor";
  ghostRole.textContent = roleLbl;

  const roleTag = document.getElementById("ghost-role-tag");
  if (roleTag) {
    roleTag.className = "ghost-role-badge role-" + (ghostRoles[0] || "unknown");
  }

  mentionsList.innerHTML = "";
  const lowerGhostName = (ghostNode._ghostName || "").toLowerCase().trim();
  const mentions = [];

  for (const action of allActions) {
    const mentionedNames = action.mentioned_names || [];
    for (const mn of mentionedNames) {
      const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
      if (entry.name.toLowerCase().trim() === lowerGhostName) {
        const parentPerson = people.find(p => p.id === action.person_id);
        mentions.push({
          personName: parentPerson ? parentPerson.name : "—",
          actionNum: action.action_num || "—",
          actionTitle: action.title || "",
          context: entry.context || "",
          role: entry.role || "unknown"
        });
      }
    }
  }

  if (mentions.length) {
    const header = document.createElement("p");
    header.className = "ghost-mentions-header";
    header.textContent = `Geçtiği Eylemler (${mentions.length})`;
    mentionsList.appendChild(header);

    for (const m of mentions) {
      const card = document.createElement("div");
      card.className = "ghost-mention-card";
      const personLine = document.createElement("div");
      personLine.className = "ghost-mention-person";
      personLine.textContent = m.personName;
      card.appendChild(personLine);

      const eylemLine = document.createElement("div");
      eylemLine.className = "ghost-mention-eylem";
      eylemLine.textContent = `Eylem ${m.actionNum}${m.actionTitle ? " — " + m.actionTitle : ""}`;
      card.appendChild(eylemLine);

      if (m.context) {
        const contextLine = document.createElement("div");
        contextLine.className = "ghost-mention-context";
        contextLine.textContent = m.context;
        card.appendChild(contextLine);
      }

      mentionsList.appendChild(card);
    }
  } else {
    const note = document.createElement("p");
    note.className = "ghost-note muted";
    note.textContent = "Bu kişi metinde bahsedilmiş ancak detaylı bilgi girilmemiş.";
    mentionsList.appendChild(note);
  }

  ghostClose.onclick = () => ghostModal.close();
  ghostModal.showModal();
}

function openEylemModal(eylemNum) {
  const summary = eylemSummaries[eylemNum];
  const text = summary || "Bu eylem için henüz özet girilmemiş.";
  const bodyHtml = `<p class="eylem-summary-text${summary ? "" : " eylem-no-summary"}">${escapeHtml(text)}</p>`;
  openDetailPanel(`Eylem ${eylemNum} Özeti`, bodyHtml);
}

function openEdgePanel(edge) {
  const fromName = edge._fromName || "?";
  const toName = edge._toName || "?";
  const drawerTitle = `${fromName} → ${toName}`;
  let html = "";

  const renderEdgeDetailCard = (d) => {
    let out = `<div class="edge-detail-card">`;
    if (d.eylem) out += `<div class="edge-detail-row"><span class="edge-label">Eylem:</span> <span class="edge-value">${escapeHtml(d.eylem)}</span></div>`;
    if (d.role) out += `<div class="edge-detail-row"><span class="edge-label">Rol:</span> <span class="edge-value">${escapeHtml(d.role)}</span></div>`;
    if (d.context) out += `<div class="edge-detail-row"><span class="edge-label">Dahili:</span> <span class="edge-value">${escapeHtml(d.context)}</span></div>`;
    out += `</div>`;
    return out;
  };

  if (edge._type === "mention" && edge._details && edge._details.length) {
    html += `<div class="edge-relation-type">Bahsedilen İsim Bağlantısı</div>`;

    const selectedEylem = String((eylemFilter && eylemFilter.value) || "").trim();
    const details = edge._details.map((d) => ({ ...d }));
    const primary = [];
    const others = [];

    for (const d of details) {
      const detailEylem = String(d.eylem || "").trim();
      if (selectedEylem && selectedEylem !== "all" && detailEylem === selectedEylem) primary.push(d);
      else others.push(d);
    }
    if (!primary.length && details.length) primary.push(details[0]);

    if (primary.length) {
      html += `<div class="edge-group-title">İlgili Eylem Bağı</div>`;
      primary.forEach((d) => {
        html += renderEdgeDetailCard(d);
      });
    }

    if (others.length) {
      html += `<details class="profile-collapse action-collapse">`;
      html += `<summary class="profile-collapse-summary"><span>Diğer Bağlar (${others.length})</span></summary>`;
      html += `<div class="person-actions-list">`;
      others.forEach((d) => {
        html += renderEdgeDetailCard(d);
      });
      html += `</div></details>`;
    }
  } else if (edge._type === "hierarchy") {
    html += `<div class="edge-relation-type">Hiyerarşi Bağlantısı</div>`;
    html += `<p class="edge-relation-desc">Bu bağlantı, profil kartları arasındaki üst-alt ilişkiyi gösterir.</p>`;
  } else {
    html += `<div class="edge-relation-type">Ortak Dava İlişkisi</div>`;
    html += `<p class="edge-relation-desc">Her iki kişi de aynı davada yer almaktadır ve profilleri birbirine bağlanmıştır.</p>`;
  }
  openDetailPanel(drawerTitle, html);
}

function isHoverInteractionsEnabled() {
  return currentLayoutMode === "eylem" && actionLayerVisible;
}

function isTouchInteractionMode() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(hover: none), (pointer: coarse)").matches;
}

async function loadCase(caseId, preserveViewport = false) {
  const caseData = await fetchJSON(`/api/cases/${caseId}`);
  selectedCase = caseData;
  people = caseData.people || [];
  allActions = normalizeActionRows(caseData.actions || []);

  try {
    const summaries = await fetchJSON(`/api/eylem-summaries?caseId=${caseId}`);
    eylemSummaries = {};
    for (const s of summaries) {
      eylemSummaries[s.eylem_num] = s.summary;
    }
  } catch (e) { eylemSummaries = {}; }

  renderCaseInfo(caseData);
  renderTimeline(caseData);

  const graph = buildGraph(caseData);
  previousLayoutMode = currentLayoutMode;
  currentLayoutMode = graph.layoutMode || "none";
  const layoutChanged = previousLayoutMode !== currentLayoutMode;
  const shouldPreserveViewport = preserveViewport && !layoutChanged;
  if (graph.layoutMode === "hiyerarsi") {
    eylemFilter.innerHTML = `<option value="all">Hiyerarşi Görünümü</option>`;
    eylemFilter.value = "all";
    eylemFilter.disabled = true;
  } else if (graph.layoutMode === "none") {
    eylemFilter.innerHTML = `<option value="all">Görünüm kapalı</option>`;
    eylemFilter.value = "all";
    eylemFilter.disabled = true;
  } else {
    eylemFilter.disabled = false;
    setEylemOptions(graph.eylemNums.filter((n) => n !== "other"));
  }

  const options = {
    interaction: { dragView: true, zoomView: true, hover: true, selectConnectedEdges: false },
    physics: false,
    edges: {
      smooth: { type: "continuous" },
      color: { color: "rgba(148, 163, 184, 0.35)" }
    },
    nodes: {
      borderWidth: 2,
      shape: "circularImage",
      font: { face: "Space Grotesk" }
    }
  };

  const container = document.getElementById("network");

  if (!network) {
    network = new vis.Network(container, { nodes: graph.nodes, edges: graph.edges }, options);
    network.once("stabilized", () => {
      network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
    });
    network.on("selectNode", (params) => {
      const nodeId = params.nodes[0];
      if (nodeId.startsWith("band:")) {
        const eylemNum = nodeId.replace("band:", "");
        if (eylemNum && eylemNum !== "unassigned") openEylemModal(eylemNum);
        network.unselectAll();
        return;
      }
      if (nodeId.startsWith("ghost:")) {
        const ghostNode = nodesCache.find(n => n.id === nodeId);
        if (ghostNode) openGhostModal(ghostNode);
        return;
      }
      if (isTouchInteractionMode() && isHoverInteractionsEnabled() && !nodeId.startsWith("hoverclone:")) {
        const now = Date.now();
        const isRepeatTap = lastTouchPreviewNode === nodeId && now - lastTouchPreviewAt < 1400;
        if (!isRepeatTap) {
          applyHover(nodeId);
          lastTouchPreviewNode = nodeId;
          lastTouchPreviewAt = now;
          network.unselectAll();
          return;
        }
      }
      const baseId = nodeId.split(":")[0];
      const preferredActionNum = nodeId.includes(":") ? String(nodeId.split(":")[1] || "").trim() : "";
      const person = people.find((p) => p.id === baseId);
      lastTouchPreviewNode = null;
      lastTouchPreviewAt = 0;
      if (person) openPersonModal(person, preferredActionNum);
    });
    network.on("selectEdge", (params) => {
      if (params.nodes && params.nodes.length > 0) return;
      if (!params.edges || params.edges.length === 0) return;
      const edgeId = params.edges[0];
      try {
        const dsEdge = network.body.data.edges.get(edgeId);
        if (dsEdge) {
          if (dsEdge._isCloneEdge && dsEdge._fromName) {
            if (hoverBlurTimer) { clearTimeout(hoverBlurTimer); hoverBlurTimer = null; }
            openEdgePanel(dsEdge);
            preserveHoverOnClick = true;
            suppressBlur = true;
            network.unselectAll();
            suppressBlur = false;
            setTimeout(() => { preserveHoverOnClick = false; }, 50);
            return;
          } else {
            const edge = edgesCache.find(e => e.from === dsEdge.from && e.to === dsEdge.to);
            if (edge && edge._fromName) openEdgePanel(edge);
          }
        }
      } catch (e) {}
      network.unselectAll();
    });
    let hoverClones = [];
    let hoverActive = false;
    let lastHoveredNode = null;
    let hoverBlurTimer = null;
    let suppressBlur = false;
    let preserveHoverOnClick = false;
    let lastTouchPreviewNode = null;
    let lastTouchPreviewAt = 0;

    function stableSetData(data) {
      const viewPos = network.getViewPosition();
      const scale = network.getScale();
      network.setData(data);
      network.moveTo({ position: viewPos, scale: scale, animation: false });
    }

    function clearHoverState() {
      if (hoverBlurTimer) { clearTimeout(hoverBlurTimer); hoverBlurTimer = null; }
      if (hoverActive) {
        hoverClones = [];
        hoverActive = false;
        lastHoveredNode = null;
        filterGraph(true);
      }
      lastTouchPreviewNode = null;
      lastTouchPreviewAt = 0;
    }

    function shortenName(label) {
      if (!label) return "";
      const parts = label.trim().split(/\s+/);
      if (parts.length <= 2) return label;
      return parts[0] + " " + parts[parts.length - 1];
    }

    function applyHover(active) {
      if (!isHoverInteractionsEnabled()) return;
      const activeBaseId = active.includes(":") && !active.startsWith("ghost:") ? active.split(":")[0] : active;

      const hoveredPersonNodes = new Set();
      hoveredPersonNodes.add(active);
      nodesCache.forEach(n => {
        const baseId = n.id.startsWith("ghost:") ? n.id : (n.id.includes(":") ? n.id.split(":")[0] : n.id);
        if (baseId === activeBaseId) hoveredPersonNodes.add(n.id);
      });

      const connectedNodeIds = new Set();
      edgesCache.forEach(edge => {
        if (hoveredPersonNodes.has(edge.from)) connectedNodeIds.add(edge.to);
        if (hoveredPersonNodes.has(edge.to)) connectedNodeIds.add(edge.from);
      });

      const connectedBaseIds = new Set();
      connectedBaseIds.add(activeBaseId);
      connectedNodeIds.forEach(nid => {
        if (nid.startsWith("ghost:")) {
          connectedBaseIds.add(nid);
        } else {
          connectedBaseIds.add(nid.includes(":") ? nid.split(":")[0] : nid);
        }
      });

      const allRelatedNodeIds = new Set();
      allRelatedNodeIds.add(active);
      nodesCache.forEach(n => {
        const baseId = n.id.startsWith("ghost:") ? n.id : (n.id.includes(":") ? n.id.split(":")[0] : n.id);
        if (connectedBaseIds.has(baseId)) allRelatedNodeIds.add(n.id);
      });

      const activeNode = nodesCache.find(n => n.id === active);
      if (!activeNode) return;

      hoverClones = [];
      const cloneSize = 18;
      const cloneSpacing = 85;
      const seenBaseIds = new Set();
      const uniqueConnected = [...connectedNodeIds].filter(id => {
        if (id.startsWith("band:")) return false;
        const base = id.startsWith("ghost:") ? id : (id.includes(":") ? id.split(":")[0] : id);
        if (base === activeBaseId) return false;
        if (seenBaseIds.has(base)) return false;
        seenBaseIds.add(base);
        return true;
      });

      const maxPerRow = 7;
      const maxRows = 2;
      const rowGap = 50;
      const clamped = uniqueConnected.slice(0, maxPerRow * maxRows);

      clamped.forEach((connId, idx) => {
        const row = Math.floor(idx / maxPerRow);
        const col = idx % maxPerRow;
        const rowCount = Math.min(clamped.length - row * maxPerRow, maxPerRow);
        const rowStartX = activeNode.x - ((rowCount - 1) * cloneSpacing) / 2;
        const cloneY = activeNode.y + 100 + row * rowGap;
        const origNode = nodesCache.find(n => n.id === connId);
        if (!origNode) return;
        const baseId = origNode.id.startsWith("ghost:") ? origNode.id : (origNode.id.includes(":") ? origNode.id.split(":")[0] : origNode.id);
        const cloneId = `hoverclone:${active}:${connId}`;
        hoverClones.push({
          id: cloneId,
          label: shortenName(origNode.label),
          shape: origNode.shape || "circularImage",
          image: origNode.image || fallbackImage,
          size: cloneSize,
          x: rowStartX + col * cloneSpacing,
          y: cloneY,
          fixed: { x: true, y: true },
          font: { color: "#fbbf24", size: 9, face: "Space Grotesk" },
          color: { border: "#fbbf24", background: "rgba(17, 24, 39, 0.9)" },
          borderWidth: 2,
          opacity: 0.95,
          _isHoverClone: true,
          _sourceBaseId: baseId
        });
      });

      const dimmedNodes = nodesCache.map(n => {
        if (allRelatedNodeIds.has(n.id)) return n;
        if (n.id.startsWith("band:")) return n;
        return { ...n, opacity: 0.15 };
      });

      const cloneEdges = hoverClones.map(clone => {
        const targetBase = clone._sourceBaseId;
        const matchingEdges = edgesCache.filter(e => {
          const eFromBase = e.from.startsWith("ghost:") ? e.from : (e.from.includes(":") ? e.from.split(":")[0] : e.from);
          const eToBase = e.to.startsWith("ghost:") ? e.to : (e.to.includes(":") ? e.to.split(":")[0] : e.to);
          return (eFromBase === activeBaseId && eToBase === targetBase) || (eToBase === activeBaseId && eFromBase === targetBase);
        });
        const allDetails = [];
        let edgeType = "related";
        let fromName, toName;
        matchingEdges.forEach(e => {
          if (!fromName && e._fromName) fromName = e._fromName;
          if (!toName && e._toName) toName = e._toName;
          if (e._type === "mention") edgeType = "mention";
          if (e._details) allDetails.push(...e._details);
        });
        return {
          from: active,
          to: clone.id,
          color: { color: "rgba(251, 191, 36, 0.6)" },
          width: 1.5,
          dashes: [4, 4],
          smooth: { type: "curvedCW", roundness: 0.2 },
          _isCloneEdge: true,
          _fromName: fromName,
          _toName: toName,
          _type: edgeType,
          _details: allDetails.length ? allDetails : undefined
        };
      });

      hoverActive = true;
      lastHoveredNode = active;
      stableSetData({ nodes: [...dimmedNodes, ...hoverClones], edges: cloneEdges });
    }

    network.on("hoverNode", (params) => {
      if (!isHoverInteractionsEnabled()) return;
      if (isTouchInteractionMode()) return;
      const active = params.node;
      if (active.startsWith("band:")) return;
      if (active.startsWith("hoverclone:") || active === lastHoveredNode) {
        if (hoverBlurTimer) { clearTimeout(hoverBlurTimer); hoverBlurTimer = null; }
        return;
      }
      if (hoverBlurTimer) { clearTimeout(hoverBlurTimer); hoverBlurTimer = null; }
      applyHover(active);
    });

    network.on("blurNode", () => {
      if (!isHoverInteractionsEnabled()) return;
      if (isTouchInteractionMode()) return;
      if (suppressBlur) return;
      if (hoverBlurTimer) clearTimeout(hoverBlurTimer);
      hoverBlurTimer = setTimeout(() => {
        clearHoverState();
      }, 5000);
    });

    network.on("hoverEdge", () => {
      if (!isHoverInteractionsEnabled()) return;
      if (isTouchInteractionMode()) return;
      if (hoverBlurTimer) { clearTimeout(hoverBlurTimer); hoverBlurTimer = null; }
    });

    network.on("blurEdge", () => {
      if (!isHoverInteractionsEnabled()) return;
      if (isTouchInteractionMode()) return;
      if (suppressBlur) return;
      if (hoverActive) {
        if (hoverBlurTimer) clearTimeout(hoverBlurTimer);
        hoverBlurTimer = setTimeout(() => {
          clearHoverState();
        }, 5000);
      }
    });

    network.on("click", (params) => {
      if (preserveHoverOnClick) { preserveHoverOnClick = false; return; }
      if (params.edges && params.edges.length > 0 && (!params.nodes || params.nodes.length === 0)) {
        try {
          const dsEdge = network.body.data.edges.get(params.edges[0]);
          if (dsEdge && dsEdge._isCloneEdge) return;
        } catch (e) {}
      }
      if (isTouchInteractionMode() && params.nodes && params.nodes.length > 0) {
        const tappedNodeId = params.nodes[0];
        if (!tappedNodeId.startsWith("hoverclone:")) return;
      }
      if (params.nodes && params.nodes.length > 0) {
        const clickedId = params.nodes[0];
        if (clickedId.startsWith("hoverclone:")) {
          const clone = hoverClones.find(c => c.id === clickedId);
          if (clone && clone._sourceBaseId) {
            clearHoverState();
            if (clone._sourceBaseId.startsWith("ghost:")) {
              const ghostNode = nodesCache.find(n => n.id === clone._sourceBaseId);
              if (ghostNode) openGhostModal(ghostNode);
            } else {
              const person = people.find(p => p.id === clone._sourceBaseId);
              if (person) openPersonModal(person);
            }
          }
          return;
        }
        clearHoverState();
      } else {
        clearHoverState();
      }
    });
  } else {
    let viewPos = null;
    let scale = null;
    if (shouldPreserveViewport) {
      viewPos = network.getViewPosition();
      scale = network.getScale();
    }
    network.setData({ nodes: graph.nodes, edges: graph.edges });
    if (shouldPreserveViewport && viewPos && Number.isFinite(scale)) {
      network.moveTo({ position: viewPos, scale, animation: false });
    } else {
      network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
    }
  }

  filterGraph(shouldPreserveViewport);
}

async function loadData() {
  cases = await fetchJSON("/api/cases");
  setCaseOptions();
  const params = new URLSearchParams(window.location.search);
  const urlCaseId = params.get("caseId");
  const targetCase = urlCaseId && cases.find(c => c.id === urlCaseId) ? urlCaseId : (cases[0] ? cases[0].id : null);
  if (targetCase) {
    caseSelect.value = targetCase;
    await loadCase(targetCase);
  }
}

caseSelect.addEventListener("change", (event) => loadCase(event.target.value));
nameSearch.addEventListener("input", filterGraph);
eylemFilter.addEventListener("change", filterGraph);
if (timelineToggle) {
  timelineToggle.addEventListener("click", () => {
    if (!timelineHasData) return;
    showInlineTimeline(!timelineVisible);
  });
}
if (networkToggle) {
  networkToggle.addEventListener("click", () => {
    showHierarchyLayer(!hierarchyLayerVisible);
  });
}
if (eylemToggle) {
  eylemToggle.addEventListener("click", () => {
    showActionLayer(!actionLayerVisible);
  });
}
if (caseDetailToggle) {
  caseDetailToggle.addEventListener("click", () => {
    showNetworkPanel(!networkPanelVisible);
  });
}
casePanelClose.addEventListener("click", () => showNetworkPanel(false));
casePanelToggle.addEventListener("click", () => showNetworkPanel(true));
caseClose.addEventListener("click", () => caseModal.close());
personClose.addEventListener("click", () => personModal.close());
if (detailDrawerClose) detailDrawerClose.addEventListener("click", () => showDetailPanel(false));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (timelineVisible) { showInlineTimeline(false); return; }
    if (detailPanelVisible) { showDetailPanel(false); return; }
    if (personModal.open) return personModal.close();
    if (caseModal.open) return caseModal.close();
    window.location.href = "/";
  }
});
window.addEventListener("resize", syncFloatingPanelOffsets);
if (mapTopbar && typeof ResizeObserver !== "undefined") {
  const topbarObserver = new ResizeObserver(syncFloatingPanelOffsets);
  topbarObserver.observe(mapTopbar);
}

showNetworkPanel(true);
showDetailPanel(false);
setToggleActive(timelineToggle, true);
setToggleActive(networkToggle, true);
setToggleActive(eylemToggle, true);
syncFloatingPanelOffsets();

function enterEditMode() {
  if (!currentPerson) return;
  personViewMode.style.display = "none";
  personEditMode.style.display = "block";
  personEditBtn.textContent = "Görüntüle";

  const form = personEditForm;
  form.name.value = currentPerson.name || "";
  form.organization.value = currentPerson.organization || "";
  form.title.value = currentPerson.title || "";
  form.role.value = currentPerson.role || "defendant";
  form.sentenceDemand.value = currentPerson.sentence_demand || "";
  form.charge.value = currentPerson.charge || currentPerson.summary || "";
  form.actionNumbers.value = (currentPerson.action_numbers || []).join(", ");
  form.tckArticles.value = (currentPerson.tck_articles || []).join(", ");
  form.photoUrl.value = currentPerson.photo_url || "";
}

function exitEditMode() {
  personViewMode.style.display = "block";
  personEditMode.style.display = "none";
  personEditBtn.textContent = "Düzenle";
}

personEditBtn.addEventListener("click", () => {
  if (personEditMode.style.display === "none") {
    enterEditMode();
  } else {
    exitEditMode();
  }
});

personEditCancel.addEventListener("click", exitEditMode);

personEditForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentPerson) return;

  const form = personEditForm;
  const actionNums = form.actionNumbers.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const tckArts = form.tckArticles.value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const payload = {
    name: form.name.value,
    organization: form.organization.value,
    title: form.title.value,
    role: form.role.value,
    sentence_demand: form.sentenceDemand.value,
    charge: form.charge.value,
    action_numbers: actionNums,
    tck_articles: tckArts,
    photo_url: form.photoUrl.value
  };

  try {
    const res = await fetch(`/api/people/${currentPerson.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error("Update failed");
    const updated = await res.json();

    const idx = people.findIndex((p) => p.id === currentPerson.id);
    if (idx >= 0) people[idx] = { ...people[idx], ...updated };

    exitEditMode();
    openPersonModal(people[idx] || updated);

    if (selectedCase) {
      await loadCase(selectedCase.id);
    }
  } catch (err) {
    alert("Profil güncellenirken hata oluştu.");
  }
});

loadData();
window.addEventListener("load", syncFloatingPanelOffsets);
