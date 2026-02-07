const caseSelect = document.getElementById("case-select");
const tckFilter = document.getElementById("tck-filter");
const nameSearch = document.getElementById("name-search");
const mapClose = document.getElementById("map-close");

const caseTitle = document.getElementById("case-title");
const caseNumber = document.getElementById("case-number");
const caseCourt = document.getElementById("case-court");
const caseJudge = document.getElementById("case-judge");
const casePanel = document.getElementById("case-panel");
const caseProsecutor = document.getElementById("case-prosecutor");
const caseHearings = document.getElementById("case-hearings");
const caseDefendants = document.getElementById("case-defendants");
const caseDates = document.getElementById("case-dates");
const caseDetailBtn = document.getElementById("case-detail");

const caseModal = document.getElementById("case-modal");
const caseClose = document.getElementById("case-close");
const caseDetailTitle = document.getElementById("case-detail-title");
const caseDetailNumber = document.getElementById("case-detail-number");
const caseDetailCourt = document.getElementById("case-detail-court");
const caseDetailJudge = document.getElementById("case-detail-judge");
const caseDetailPanel = document.getElementById("case-detail-panel");
const caseDetailProsecutor = document.getElementById("case-detail-prosecutor");
const caseDetailHearings = document.getElementById("case-detail-hearings");
const caseDetailStart = document.getElementById("case-detail-start");
const caseDetailLast = document.getElementById("case-detail-last");
const caseDetailSummary = document.getElementById("case-detail-summary");

const personModal = document.getElementById("person-modal");
const personClose = document.getElementById("person-close");
const personName = document.getElementById("person-name");
const personRole = document.getElementById("person-role");
const personPhoto = document.getElementById("person-photo");
const personAccusationsTag = document.getElementById("person-accusations");
const personAccusationList = document.getElementById("person-accusation-list");
const personEvidenceList = document.getElementById("person-evidence-list");
const personDefenseList = document.getElementById("person-defense-list");
const personRelatedList = document.getElementById("person-related-list");


let network = null;
let cases = [];
let selectedCase = null;
let people = [];
let nodesCache = [];
let edgesCache = [];

const fallbackImage = "/assets/default-avatar.svg";

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
  tckFilter.innerHTML = `<option value="all">Tüm TCK Maddeleri</option>`;
  for (const article of tckArticles) {
    const option = document.createElement("option");
    option.value = article.code;
    option.textContent = `TCK ${article.code} - ${article.title}`;
    tckFilter.appendChild(option);
  }
}

function renderCaseInfo(caseData) {
  caseTitle.textContent = caseData.title || "—";
  caseNumber.textContent = caseData.case_number || "—";
  caseCourt.textContent = caseData.court_name || "—";
  caseJudge.textContent = caseData.judge || "—";
  casePanel.textContent = caseData.court_panel || "—";
  caseProsecutor.textContent = caseData.prosecutor || "—";
  caseHearings.textContent = caseData.hearing_count || "—";
  const defendantCount = (caseData.people || []).filter((p) => !p.is_external).length;
  caseDefendants.textContent = defendantCount || "—";
  const dates = [caseData.start_date, caseData.last_hearing_date].filter(Boolean).join(" • ");
  caseDates.textContent = dates || "—";

  caseDetailTitle.textContent = caseData.title || "—";
  caseDetailNumber.textContent = caseData.case_number || "—";
  caseDetailCourt.textContent = caseData.court_name || "—";
  caseDetailJudge.textContent = caseData.judge || "—";
  caseDetailPanel.textContent = caseData.court_panel || "—";
  caseDetailProsecutor.textContent = caseData.prosecutor || "—";
  caseDetailHearings.textContent = caseData.hearing_count || "—";
  caseDetailStart.textContent = caseData.start_date || "—";
  caseDetailLast.textContent = caseData.last_hearing_date || "—";
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

  nodesCache = [...bandNodes, ...nodes];
  edgesCache = edges;

  return { nodes: [...bandNodes, ...nodes], edges, personById };
}

function filterGraph() {
  const query = nameSearch.value.toLowerCase().trim();
  const tck = tckFilter.value;

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
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");
  tabs.forEach((tab) => tab.classList.remove("active"));
  panels.forEach((panel) => panel.classList.remove("active"));
  if (tabs[0]) tabs[0].classList.add("active");
  if (panels[0]) panels[0].classList.add("active");

  personName.textContent = person.name;
  personRole.textContent = person.role || "";
  personPhoto.src = person.photo_url || fallbackImage;
  const accusationText = (person.tck_articles || []).map((code) => `TCK ${code}`).join(" · ");
  personAccusationsTag.textContent = accusationText || "";

  personAccusationList.innerHTML = "";
  if (!(person.accusations || []).length) {
    const li = document.createElement("li");
    li.textContent = "Suçlama bilgisi yok.";
    personAccusationList.appendChild(li);
  } else {
    (person.accusations || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      personAccusationList.appendChild(li);
    });
  }

  personEvidenceList.innerHTML = "";
  if (!(person.evidence_items || []).length) {
    const li = document.createElement("li");
    li.textContent = "Delil bilgisi yok.";
    personEvidenceList.appendChild(li);
  } else {
    (person.evidence_items || []).forEach((item) => {
      const li = document.createElement("li");
      const ref = item.reference ? ` (${item.reference})` : "";
      li.textContent = `${item.description}${ref}`;
      personEvidenceList.appendChild(li);
    });
  }

  personDefenseList.innerHTML = "";
  if (!(person.defense || []).length) {
    const li = document.createElement("li");
    li.textContent = "Savunma bilgisi yok.";
    personDefenseList.appendChild(li);
  } else {
    (person.defense || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      personDefenseList.appendChild(li);
    });
  }

  personRelatedList.innerHTML = "";
  const related = person.related_profiles || [];
  if (!related.length) {
    const li = document.createElement("li");
    li.textContent = "İlişkili kişi yok.";
    personRelatedList.appendChild(li);
  } else {
    related.forEach((id) => {
      const target = people.find((p) => p.id === id);
      if (!target) return;
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = target.name;
      btn.addEventListener("click", () => openPersonModal(target));
      li.appendChild(btn);
      personRelatedList.appendChild(li);
    });
  }

  personModal.showModal();
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
tckFilter.addEventListener("change", filterGraph);
caseDetailBtn.addEventListener("click", () => caseModal.showModal());
caseClose.addEventListener("click", () => caseModal.close());
personClose.addEventListener("click", () => personModal.close());
mapClose.addEventListener("click", () => {
  window.location.href = "/";
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (personModal.open) return personModal.close();
    if (caseModal.open) return caseModal.close();
    window.location.href = "/";
  }
});

setupTabs();
loadData();
