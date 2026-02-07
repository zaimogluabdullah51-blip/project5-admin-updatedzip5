const caseSelect = document.getElementById("case-select");
const eylemFilter = document.getElementById("eylem-filter");
const nameSearch = document.getElementById("name-search");

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
let nodesCache = [];
let edgesCache = [];

const fallbackImage = "/assets/default-avatar.svg";

const roleLabels = {
  defendant: "Defendant",
  informant: "Informant",
  witness: "Witness",
  secretWitness: "Secret Witness",
  victim: "Victim",
  fugitive: "Fugitive",
  detained: "Detained"
};

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

function setTckOptions(tckArticles) {
  if (!eylemFilter) return;
  eylemFilter.innerHTML = `<option value="all">All TCK Articles</option>`;
  for (const article of tckArticles) {
    const option = document.createElement("option");
    option.value = article.code;
    option.textContent = `TCK ${article.code} - ${article.title}`;
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

  if (caseJudgeLabel) caseJudgeLabel.textContent = isPanel ? "Panel President" : "Judge";
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

  if (caseDetailJudgeLabel) caseDetailJudgeLabel.textContent = isPanel ? "Panel President" : "Judge";
  caseDetailJudge.textContent = judgeName;
  if (caseDetailPanelRow) caseDetailPanelRow.style.display = isPanel ? "" : "none";
  caseDetailPanel.textContent = panelMembers;

  if (caseDetailIndictmentDate) caseDetailIndictmentDate.textContent = caseData.indictment_date || "—";
  if (caseDetailAcceptanceDate) caseDetailAcceptanceDate.textContent = acceptanceDate;
  if (caseDetailVerdictDate) caseDetailVerdictDate.textContent = caseData.verdict_date || "—";
  if (caseDetailStatus) caseDetailStatus.textContent = caseData.status || "—";
  caseDetailSummary.textContent = caseData.summary || "—";
}

function buildGraph(caseData) {
  const tckArticles = caseData.tck_articles || [];
  const extraCodes = new Map();
  const laneHeight = 180;
  const laneSpacing = 140;
  const perRow = 6;

  for (const person of caseData.people) {
    const codes = person.tck_articles && person.tck_articles.length ? person.tck_articles : ["other"];
    if (codes.includes("other")) {
      extraCodes.set("other", { code: "other", title: "Diğer" });
    }
    for (const code of codes) {
      if (!tckArticles.find((tck) => tck.code === code)) {
        extraCodes.set(code, { code, title: "Diğer" });
      }
    }
  }

  const allTck = [...tckArticles, ...extraCodes.values()];

  const nodes = [];
  const personNodeMap = new Map();
  const personById = new Map(caseData.people.map((p) => [p.id, p]));

  const bandNodes = allTck.map((article, index) => ({
    id: `band:${article.code}`,
    label: `TCK ${article.code} - ${article.title}`,
    shape: "box",
    widthConstraint: { minimum: 720, maximum: 960 },
    heightConstraint: { minimum: 36, maximum: 36 },
    x: 420,
    y: index * laneHeight + 18,
    fixed: { x: true, y: true },
    selectable: false,
    color: {
      background: "rgba(17, 24, 39, 0.75)",
      border: "rgba(255, 255, 255, 0.08)"
    },
    font: { color: "#e5e7eb", size: 12, face: "Space Grotesk" }
  }));

  allTck.forEach((article, index) => {
    const peopleInArticle = caseData.people.filter((p) => {
      const codes = p.tck_articles && p.tck_articles.length ? p.tck_articles : ["other"];
      return codes.includes(article.code);
    });
    peopleInArticle.forEach((person, idx) => {
      const column = idx % perRow;
      const row = Math.floor(idx / perRow);
      let yOffset = 0;
      if (person.hierarchy?.superiors?.length) yOffset -= 40;
      if (person.hierarchy?.subordinates?.length) yOffset += 40;

      const nodeId = `${person.id}:${article.code}`;
      const node = {
        id: nodeId,
        label: person.name,
        shape: "circularImage",
        image: person.photo_url || fallbackImage,
        size: person.is_external ? 26 : 30,
        x: column * 140 + 80,
        y: index * laneHeight + row * laneSpacing + yOffset + 60,
        font: { color: "#e5e7eb", size: 12 },
        color: person.is_external
          ? { border: "#4b5563", background: "#111827" }
          : { border: "#9ca3af", background: "#111827" },
        borderWidth: person.is_external ? 1 : 2
      };
      nodes.push(node);
      if (!personNodeMap.has(person.id)) personNodeMap.set(person.id, []);
      personNodeMap.get(person.id).push(nodeId);
    });
  });

  const edges = [];
  const edgeSet = new Set();

  for (const person of caseData.people) {
    const related = person.related_profiles || [];
    for (const targetId of related) {
      const fromNodes = personNodeMap.get(person.id) || [];
      const toNodes = personNodeMap.get(targetId) || [];
      if (!fromNodes.length || !toNodes.length) continue;
      const key = [person.id, targetId].sort().join("|");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({
        from: fromNodes[0],
        to: toNodes[0],
        color: { color: `rgba(148, 163, 184, ${0.35})` },
        smooth: { type: "continuous" }
      });
    }
  }

  const nameToIds = new Map();
  for (const p of caseData.people) {
    const lowerName = (p.name || "").toLowerCase().trim();
    if (lowerName) {
      if (!nameToIds.has(lowerName)) nameToIds.set(lowerName, []);
      nameToIds.get(lowerName).push(p.id);
    }
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

  for (const action of allActions) {
    const mentionedNames = action.mentioned_names || [];
    if (!mentionedNames.length || !action.person_id) continue;

    const fromNodes = personNodeMap.get(action.person_id) || [];
    if (!fromNodes.length) continue;

    for (const mn of mentionedNames) {
      const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
      const lowerMentioned = entry.name.toLowerCase().trim();
      const mentionedRole = entry.role || "unknown";
      const matchedIds = nameToIds.get(lowerMentioned) || [];

      if (matchedIds.length) {
        for (const matchedId of matchedIds) {
          if (matchedId === action.person_id) continue;
          const toNodes = personNodeMap.get(matchedId) || [];
          if (!toNodes.length) continue;

          const key = [action.person_id, matchedId].sort().join("|");
          if (edgeSet.has(key)) continue;
          edgeSet.add(key);
          edges.push({
            from: fromNodes[0],
            to: toNodes[0],
            color: { color: mentionedRoleEdgeColors[mentionedRole] || mentionedRoleEdgeColors.unknown },
            smooth: { type: "continuous" },
            dashes: true
          });
        }
      } else {
        const ghostKey = lowerMentioned;
        if (!ghostNodes.has(ghostKey)) {
          ghostCounter++;
          const ghostId = `ghost:${ghostCounter}`;
          const ghostColorSet = roleColors[mentionedRole] || roleColors.defendant;
          const ghostNode = {
            id: ghostId,
            label: entry.name,
            shape: "circularImage",
            image: fallbackImage,
            size: 22,
            font: { color: "rgba(229, 231, 235, 0.5)", size: 11 },
            color: {
              border: ghostColorSet.border,
              background: "rgba(17, 24, 39, 0.4)"
            },
            borderWidth: 2,
            opacity: 0.55,
            _isGhost: true,
            _ghostName: entry.name,
            _ghostRole: mentionedRole
          };

          const existingInLane = nodes.length;
          const col = existingInLane % perRow;
          const row = Math.floor(existingInLane / perRow);
          ghostNode.x = col * 140 + 80;
          ghostNode.y = row * laneSpacing + 60;

          ghostNodes.set(ghostKey, ghostId);
          nodes.push(ghostNode);
        }

        const ghostNodeId = ghostNodes.get(ghostKey);
        const key = [action.person_id, ghostNodeId].sort().join("|");
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({
            from: fromNodes[0],
            to: ghostNodeId,
            color: { color: mentionedRoleEdgeColors[mentionedRole] || mentionedRoleEdgeColors.unknown },
            smooth: { type: "continuous" },
            dashes: true
          });
        }
      }
    }
  }

  nodesCache = [...bandNodes, ...nodes];
  edgesCache = edges;

  return { nodes: [...bandNodes, ...nodes], edges, personById };
}

function filterGraph() {
  const query = nameSearch.value.toLowerCase().trim();
  const tck = eylemFilter ? eylemFilter.value : "all";

  const nodes = nodesCache.filter((node) => {
    const matchesName = !query || node.label.toLowerCase().includes(query);
    const matchesTck = tck === "all" || node.id.endsWith(`:${tck}`);
    return matchesName && matchesTck;
  });

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = edgesCache.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));

  if (network) {
    network.setData({ nodes, edges });
  }
}

function openPersonModal(person) {
  currentPerson = person;
  personViewMode.style.display = "block";
  personEditMode.style.display = "none";
  personEditBtn.textContent = "Edit";

  personName.textContent = person.name || "";
  personOrg.textContent = person.organization || "";
  personTitle.textContent = person.title || "";
  personRole.textContent = roleLabels[person.role] || person.role || "";
  personSentence.textContent = person.sentence_demand ? `Demand: ${person.sentence_demand}` : "";
  personPhoto.src = person.photo_url || fallbackImage;

  const summary = person.charge || person.summary || "";
  if (summary) {
    personSummarySection.style.display = "block";
    personSummaryText.textContent = summary;
  } else {
    personSummarySection.style.display = "none";
  }

  personActionsList.innerHTML = "";

  const personActions = allActions.filter((a) => a.person_id === person.id);

  if (!personActions.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No action records found for this person.";
    personActionsList.appendChild(empty);
  } else {
    for (const action of personActions) {
      const card = document.createElement("div");
      card.className = "action-card";

      const header = document.createElement("div");
      header.className = "action-card-header";

      const title = document.createElement("h5");
      title.textContent = `Action ${action.action_num}${action.title ? " — " + action.title : ""}`;
      header.appendChild(title);

      const tckCodes = action.tck_codes || [];
      if (tckCodes.length) {
        const tckTag = document.createElement("span");
        tckTag.className = "tag";
        tckTag.textContent = tckCodes.join(", ");
        header.appendChild(tckTag);
      }

      card.appendChild(header);

      if (action.sentence_demand) {
        const sd = document.createElement("p");
        sd.className = "action-sentence";
        sd.textContent = `Sentence demand: ${action.sentence_demand}`;
        card.appendChild(sd);
      }

      if (action.claim) {
        const section = document.createElement("div");
        section.className = "action-section";
        const label = document.createElement("span");
        label.className = "action-label";
        label.textContent = "Claim";
        section.appendChild(label);
        const text = document.createElement("p");
        text.textContent = action.claim;
        section.appendChild(text);
        card.appendChild(section);
      }

      const mentioned = action.mentioned_names || [];
      if (mentioned.length) {
        const section = document.createElement("div");
        section.className = "action-section";
        const label = document.createElement("span");
        label.className = "action-label";
        label.textContent = "Mentioned Names";
        section.appendChild(label);
        const namesP = document.createElement("p");
        namesP.textContent = mentioned.map(mn => {
          if (typeof mn === "string") return mn;
          const rl = roleLabels[mn.role] || mn.role || "";
          return rl && mn.role !== "unknown" ? `${mn.name} (${rl})` : mn.name;
        }).join(", ");
        section.appendChild(namesP);
        card.appendChild(section);
      }

      if (card.children.length) {
        personActionsList.appendChild(card);
      }
    }
  }

  personModal.showModal();
}

function openGhostModal(ghostNode) {
  const ghostModal = document.getElementById("ghost-modal");
  const ghostName = document.getElementById("ghost-name");
  const ghostRole = document.getElementById("ghost-role");
  const ghostClose = document.getElementById("ghost-close");

  ghostName.textContent = ghostNode._ghostName || "";
  const roleLbl = roleLabels[ghostNode._ghostRole] || ghostNode._ghostRole || "Unknown";
  ghostRole.textContent = roleLbl;

  const roleTag = document.getElementById("ghost-role-tag");
  if (roleTag) {
    roleTag.className = "ghost-role-badge role-" + (ghostNode._ghostRole || "unknown");
  }

  ghostClose.onclick = () => ghostModal.close();
  ghostModal.showModal();
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.querySelector(`.tab-panel[data-panel="${tab.dataset.tab}"]`);
      if (panel) panel.classList.add("active");
    });
  });
}

async function loadCase(caseId) {
  const caseData = await fetchJSON(`/api/cases/${caseId}`);
  selectedCase = caseData;
  people = caseData.people || [];
  allActions = caseData.actions || [];

  renderCaseInfo(caseData);
  const tckArticles = caseData.tck_articles || [];
  const hasOther = people.some((p) => !(p.tck_articles || []).length);
  const fullArticles = hasOther ? [...tckArticles, { code: "other", title: "Diğer" }] : tckArticles;
  setTckOptions(fullArticles);

  const graph = buildGraph(caseData);

  const options = {
    interaction: { dragView: true, zoomView: true },
    physics: false,
    edges: {
      smooth: { type: "continuous" },
      color: { color: `rgba(148, 163, 184, ${0.35})` }
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
    network.on("selectNode", (params) => {
      const nodeId = params.nodes[0];
      if (nodeId.startsWith("ghost:")) {
        const ghostNode = nodesCache.find(n => n.id === nodeId);
        if (ghostNode) openGhostModal(ghostNode);
        return;
      }
      const baseId = nodeId.split(":")[0];
      const person = people.find((p) => p.id === baseId);
      if (person) openPersonModal(person);
    });
    network.on("hoverNode", (params) => {
      const active = params.node;
      const edges = edgesCache.map((edge) => ({
        ...edge,
        color:
          edge.from === active || edge.to === active
            ? { color: "rgba(226, 232, 240, 0.75)" }
            : { color: "rgba(148, 163, 184, 0.2)" }
      }));
      network.setData({ nodes: nodesCache, edges });
    });
    network.on("blurNode", () => {
      network.setData({ nodes: nodesCache, edges: edgesCache });
    });
  } else {
    network.setData({ nodes: graph.nodes, edges: graph.edges });
  }

  filterGraph();
}

async function loadData() {
  cases = await fetchJSON("/api/cases");
  setCaseOptions();
  if (cases[0]) {
    caseSelect.value = cases[0].id;
    await loadCase(cases[0].id);
  }
}

caseSelect.addEventListener("change", (event) => loadCase(event.target.value));
nameSearch.addEventListener("input", filterGraph);
if (eylemFilter) eylemFilter.addEventListener("change", filterGraph);
caseClose.addEventListener("click", () => caseModal.close());
personClose.addEventListener("click", () => personModal.close());

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (personModal.open) return personModal.close();
    if (caseModal.open) return caseModal.close();
    window.location.href = "/";
  }
});

setupTabs();
loadData();
