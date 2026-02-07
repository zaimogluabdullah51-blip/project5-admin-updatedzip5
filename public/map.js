const caseSelect = document.getElementById("case-select");
const eylemFilter = document.getElementById("eylem-filter");
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
  defendant: "Sanık",
  informant: "İtirafçı",
  witness: "Tanık",
  secretWitness: "Gizli Tanık",
  victim: "Mağdur",
  fugitive: "Firari",
  detained: "Tutuklu"
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
  const peopleList = caseData.people || [];

  const eylemNumsSet = new Set();
  for (const p of peopleList) {
    const raw = p.action_numbers || [];
    for (const n of raw) {
      String(n).split(/[,\s]+/).filter(Boolean).forEach((v) => {
        const trimmed = v.trim();
        if (trimmed) eylemNumsSet.add(trimmed);
      });
    }
  }

  const eylemNums = [...eylemNumsSet].sort((a, b) => {
    const na = parseInt(a, 10);
    const nb = parseInt(b, 10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });

  const hasNoEylem = peopleList.some((p) => !(p.action_numbers || []).length);
  if (hasNoEylem) eylemNums.push("other");

  const laneHeight = 180;
  const perRow = 6;

  const nodes = [];
  const personNodeMap = new Map();

  const bandNodes = eylemNums.map((num, index) => {
    return {
      id: `band:${num}`,
      label: num === "other" ? "Eyleme Atanmamış" : `Eylem ${num}`,
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
      font: { color: "#e5e7eb", size: 12, face: "Space Grotesk" },
      _eylemNum: num
    };
  });

  eylemNums.forEach((num, index) => {
    const peopleInEylem = peopleList.filter((p) => {
      const raw = p.action_numbers || [];
      const split = raw.flatMap((n) => String(n).split(/[,\s]+/).map((v) => v.trim()).filter(Boolean));
      if (num === "other") return !split.length;
      return split.includes(num);
    });

    peopleInEylem.forEach((person, idx) => {
      const column = idx % perRow;
      const row = Math.floor(idx / perRow);

      const nodeId = `${person.id}:${num}`;
      const node = {
        id: nodeId,
        label: person.name,
        shape: "circularImage",
        image: person.photo_url || fallbackImage,
        size: person.is_external ? 26 : 30,
        x: column * 140 + 80,
        y: index * laneHeight + row * 140 + 60,
        font: { color: "#e5e7eb", size: 12 },
        color: person.is_external
          ? { border: "#4b5563", background: "#111827" }
          : { border: "#9ca3af", background: "#111827" },
        borderWidth: person.is_external ? 1 : 2,
        _eylemNum: num
      };
      nodes.push(node);
      if (!personNodeMap.has(person.id)) personNodeMap.set(person.id, []);
      personNodeMap.get(person.id).push(nodeId);
    });
  });

  const edges = [];
  const edgeSet = new Set();

  for (const person of peopleList) {
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
        color: { color: "rgba(148, 163, 184, 0.35)" },
        smooth: { type: "continuous" }
      });
    }
  }

  nodesCache = [...bandNodes, ...nodes];
  edgesCache = edges;

  return { nodes: nodesCache, edges, eylemNums };
}

function filterGraph() {
  const query = nameSearch.value.toLowerCase().trim();
  const eylem = eylemFilter.value;

  const nodes = nodesCache.filter((node) => {
    const isBand = node.id.startsWith("band:");
    const matchesName = !query || node.label.toLowerCase().includes(query);
    const matchesEylem = eylem === "all" || node._eylemNum === eylem;

    if (isBand) return matchesEylem;
    return matchesName && matchesEylem;
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
  personEditBtn.textContent = "Düzenle";

  personName.textContent = person.name || "";
  personOrg.textContent = person.organization || "";
  personTitle.textContent = person.title || "";
  personRole.textContent = roleLabels[person.role] || person.role || "";
  personSentence.textContent = person.sentence_demand ? `Talep: ${person.sentence_demand}` : "";
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
    empty.textContent = "Bu kişi için eylem kaydı bulunmuyor.";
    personActionsList.appendChild(empty);
  } else {
    for (const action of personActions) {
      const card = document.createElement("div");
      card.className = "action-card";

      const header = document.createElement("div");
      header.className = "action-card-header";

      const title = document.createElement("h5");
      title.textContent = `Eylem ${action.action_num}${action.title ? " — " + action.title : ""}`;
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
        sd.textContent = `Talep edilen ceza: ${action.sentence_demand}`;
        card.appendChild(sd);
      }

      if (action.claim) {
        const section = document.createElement("div");
        section.className = "action-section";
        const label = document.createElement("span");
        label.className = "action-label";
        label.textContent = "İddia";
        section.appendChild(label);
        const text = document.createElement("p");
        text.textContent = action.claim;
        section.appendChild(text);
        card.appendChild(section);
      }

      if (action.evidence) {
        const section = document.createElement("div");
        section.className = "action-section";
        const label = document.createElement("span");
        label.className = "action-label";
        label.textContent = "Deliller";
        section.appendChild(label);
        const text = document.createElement("p");
        text.textContent = action.evidence;
        section.appendChild(text);
        card.appendChild(section);
      }

      if (action.defense) {
        const section = document.createElement("div");
        section.className = "action-section";
        const label = document.createElement("span");
        label.className = "action-label";
        label.textContent = "Savunma";
        section.appendChild(label);
        const text = document.createElement("p");
        text.textContent = action.defense;
        section.appendChild(text);
        card.appendChild(section);
      }

      personActionsList.appendChild(card);
    }
  }

  personModal.showModal();
}

async function loadCase(caseId) {
  const caseData = await fetchJSON(`/api/cases/${caseId}`);
  selectedCase = caseData;
  people = caseData.people || [];
  allActions = caseData.actions || [];

  renderCaseInfo(caseData);

  const graph = buildGraph(caseData);
  setEylemOptions(graph.eylemNums.filter((n) => n !== "other"));

  const options = {
    interaction: { dragView: true, zoomView: true },
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
eylemFilter.addEventListener("change", filterGraph);
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
