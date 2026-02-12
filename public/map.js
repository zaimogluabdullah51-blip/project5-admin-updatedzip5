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

const eylemModal = document.getElementById("eylem-modal");
const eylemClose = document.getElementById("eylem-close");
const eylemModalTitle = document.getElementById("eylem-modal-title");
const eylemSummaryText = document.getElementById("eylem-summary-text");
const edgePanel = document.getElementById("edge-panel");
const edgePanelClose = document.getElementById("edge-panel-close");
const edgePanelTitle = document.getElementById("edge-panel-title");
const edgePanelBody = document.getElementById("edge-panel-body");

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

  const unassignedPeople = peopleList.filter((p) => !(p.action_numbers || []).length);
  const hasNoEylem = unassignedPeople.length > 0;

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
      const raw = p.action_numbers || [];
      const split = raw.flatMap((n) => String(n).split(/[,\s]+/).map((v) => v.trim()).filter(Boolean));
      return split.includes(num);
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
      _eylemNum: num
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
      _eylemNum: "other"
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
        _eylemNum: "other"
      };
      nodes.push(node);
      if (!personNodeMap.has(person.id)) personNodeMap.set(person.id, []);
      personNodeMap.get(person.id).push(nodeId);
    });
  }

  eylemNums.forEach((num, index) => {
    const peopleInEylem = peopleList.filter((p) => {
      const raw = p.action_numbers || [];
      const split = raw.flatMap((n) => String(n).split(/[,\s]+/).map((v) => v.trim()).filter(Boolean));
      return split.includes(num);
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
      const targetPerson = peopleList.find(p => p.id === targetId);
      edges.push({
        from: fromNodes[0],
        to: toNodes[0],
        color: { color: "rgba(148, 163, 184, 0.35)" },
        smooth: { type: "continuous" },
        _fromName: person.name,
        _toName: targetPerson ? targetPerson.name : targetId,
        _type: "related",
        _details: []
      });
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
  const personMentionCounts = new Map();
  const personMentionAngles = new Map();
  const mentionRadius = 180;

  for (const action of allActions) {
    const mentionedNames = action.mentioned_names || [];
    if (!mentionedNames.length || !action.person_id) continue;

    const fromNodes = personNodeMap.get(action.person_id) || [];
    if (!fromNodes.length) continue;

    const parentNodeId = fromNodes[0];
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
          const toNodes = personNodeMap.get(matchedId) || [];
          if (!toNodes.length) continue;

          const key = [action.person_id, matchedId].sort().join("|");
          if (edgeSet.has(key)) continue;
          edgeSet.add(key);
          const parentPerson = peopleList.find(p => p.id === action.person_id);
          const matchedPerson = peopleList.find(p => p.id === matchedId);
          edges.push({
            from: fromNodes[0],
            to: toNodes[0],
            color: { color: mentionedRoleEdgeColors[mentionedRole] || mentionedRoleEdgeColors.unknown },
            smooth: { type: "continuous" },
            dashes: true,
            _fromName: parentPerson ? parentPerson.name : "",
            _toName: matchedPerson ? matchedPerson.name : entry.name,
            _type: "mention",
            _details: [{ eylem: action.action_num || "", role: getRolesLabel(entry), context: entry.context || "" }]
          });
        }
      } else {
        const ghostKey = lowerMentioned;
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
            _eylemNum: action.action_num ? String(action.action_num).split(/[,\s]+/)[0] : "other"
          };

          ghostNodes.set(ghostKey, { id: ghostId, parentId: action.person_id });
          nodes.push(ghostNode);
        } else {
          const skipAngle = personMentionAngles.get(action.person_id);
          personMentionAngles.set(action.person_id, skipAngle + angleStep);
        }

        const ghostInfo = ghostNodes.get(ghostKey);
        const ghostNodeId = ghostInfo.id;
        const key = [action.person_id, ghostNodeId].sort().join("|");
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          const parentPerson = peopleList.find(p => p.id === action.person_id);
          edges.push({
            from: fromNodes[0],
            to: ghostNodeId,
            color: { color: mentionedRoleEdgeColors[mentionedRole] || mentionedRoleEdgeColors.unknown },
            smooth: { type: "continuous" },
            dashes: true,
            _fromName: parentPerson ? parentPerson.name : "",
            _toName: entry.name,
            _type: "mention",
            _details: [{ eylem: action.action_num || "", role: getRolesLabel(entry), context: entry.context || "" }]
          });
        }
      }
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
    network.fit({ animation: { duration: 300, easingFunction: "easeInOutQuad" } });
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
  const roles = (person.role || "").split(",").map(r => r.trim()).filter(Boolean);
  personRole.textContent = roles.map(r => roleLabels[r] || r).join(", ") || "";
  personSentence.textContent = person.sentence_demand ? `Talep: ${person.sentence_demand}` : "";
  personPhoto.src = person.photo_url || fallbackImage;

  const tckTagsEl = document.getElementById("person-tck-tags");
  const eylemTagsEl = document.getElementById("person-eylem-tags");
  tckTagsEl.innerHTML = "";
  eylemTagsEl.innerHTML = "";

  const tckArticles = person.tck_articles || [];
  if (tckArticles.length) {
    tckArticles.forEach(code => {
      const tag = document.createElement("span");
      tag.className = "tag small";
      tag.textContent = String(code).startsWith("TCK") ? code : `TCK ${code}`;
      tckTagsEl.appendChild(tag);
    });
  }

  const actionNums = person.action_numbers || [];
  if (actionNums.length) {
    actionNums.forEach(num => {
      const tag = document.createElement("span");
      tag.className = "tag small eylem-tag";
      tag.textContent = `Eylem ${num}`;
      eylemTagsEl.appendChild(tag);
    });
  }

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

      const mentioned = action.mentioned_names || [];
      if (mentioned.length) {
        const section = document.createElement("div");
        section.className = "action-section";
        const label = document.createElement("span");
        label.className = "action-label";
        label.textContent = "Geçen İsimler";
        section.appendChild(label);
        for (const mn of mentioned) {
          const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
          const rl = getRolesLabel(entry);
          const nameSpan = document.createElement("p");
          let text = rl ? `${entry.name} (${rl})` : entry.name;
          if (entry.context) text += ` — ${entry.context}`;
          nameSpan.textContent = text;
          nameSpan.style.fontSize = "0.85rem";
          section.appendChild(nameSpan);
        }
        card.appendChild(section);
      }

      personActionsList.appendChild(card);
    }
  }

  const lowerPersonName = (person.name || "").toLowerCase().trim();
  const mentionedInActions = [];
  for (const action of allActions) {
    if (action.person_id === person.id) continue;
    const mentionedNames = action.mentioned_names || [];
    for (const mn of mentionedNames) {
      const entry = typeof mn === "string" ? { name: mn, role: "unknown" } : mn;
      if (entry.name.toLowerCase().trim() === lowerPersonName) {
        const parentPerson = people.find(p => p.id === action.person_id);
        mentionedInActions.push({
          personName: parentPerson ? parentPerson.name : "—",
          actionNum: action.action_num || "—",
          actionTitle: action.title || "",
          context: entry.context || "",
          role: entry.role || "unknown"
        });
      }
    }
  }

  if (mentionedInActions.length) {
    const sectionHeader = document.createElement("h4");
    sectionHeader.className = "actions-section-title";
    sectionHeader.textContent = `Bahsedildiği Eylemler (${mentionedInActions.length})`;
    personActionsList.appendChild(sectionHeader);

    for (const m of mentionedInActions) {
      const card = document.createElement("div");
      card.className = "action-card mentioned-in-card";

      const header = document.createElement("div");
      header.className = "action-card-header";
      const title = document.createElement("h5");
      title.textContent = `Eylem ${m.actionNum}${m.actionTitle ? " — " + m.actionTitle : ""}`;
      header.appendChild(title);
      card.appendChild(header);

      const personLine = document.createElement("div");
      personLine.className = "action-section";
      const personLabel = document.createElement("span");
      personLabel.className = "action-label";
      personLabel.textContent = "Bahseden Profil";
      personLine.appendChild(personLabel);
      const personText = document.createElement("p");
      personText.textContent = m.personName;
      personLine.appendChild(personText);
      card.appendChild(personLine);

      if (m.context) {
        const contextSection = document.createElement("div");
        contextSection.className = "action-section";
        const contextLabel = document.createElement("span");
        contextLabel.className = "action-label";
        contextLabel.textContent = "Dahili";
        contextSection.appendChild(contextLabel);
        const contextText = document.createElement("p");
        contextText.textContent = m.context;
        contextSection.appendChild(contextText);
        card.appendChild(contextSection);
      }

      personActionsList.appendChild(card);
    }
  }

  personModal.showModal();
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
  eylemModalTitle.innerHTML = `<span class="eylem-num-badge">Eylem ${eylemNum}</span> Eylem Özeti`;
  const summary = eylemSummaries[eylemNum];
  if (summary) {
    eylemSummaryText.textContent = summary;
    eylemSummaryText.className = "eylem-summary-text";
  } else {
    eylemSummaryText.textContent = "Bu eylem için henüz özet girilmemiş.";
    eylemSummaryText.className = "eylem-summary-text eylem-no-summary";
  }
  eylemModal.style.display = "block";
}

function openEdgePanel(edge) {
  const fromName = edge._fromName || "?";
  const toName = edge._toName || "?";
  edgePanelTitle.innerHTML = `<span class="edge-from-name">${fromName}</span> <span class="edge-arrow">→</span> <span class="edge-to-name">${toName}</span>`;
  let html = "";
  if (edge._type === "mention" && edge._details && edge._details.length) {
    html += `<div class="edge-relation-type">Bahsedilen İsim Bağlantısı</div>`;
    for (const d of edge._details) {
      html += `<div class="edge-detail-card">`;
      if (d.eylem) html += `<div class="edge-detail-row"><span class="edge-label">Eylem:</span> <span class="edge-value">${d.eylem}</span></div>`;
      if (d.role) html += `<div class="edge-detail-row"><span class="edge-label">Rol:</span> <span class="edge-value">${d.role}</span></div>`;
      if (d.context) html += `<div class="edge-detail-row"><span class="edge-label">Dahili:</span> <span class="edge-value">${d.context}</span></div>`;
      html += `</div>`;
    }
  } else {
    html += `<div class="edge-relation-type">Ortak Dava İlişkisi</div>`;
    html += `<p class="edge-relation-desc">Her iki kişi de aynı davada yer almaktadır ve profilleri birbirine bağlanmıştır.</p>`;
  }
  edgePanelBody.innerHTML = html;
  edgePanel.style.display = "block";
}

async function loadCase(caseId) {
  const caseData = await fetchJSON(`/api/cases/${caseId}`);
  selectedCase = caseData;
  people = caseData.people || [];
  allActions = caseData.actions || [];

  try {
    const summaries = await fetchJSON(`/api/eylem-summaries?caseId=${caseId}`);
    eylemSummaries = {};
    for (const s of summaries) {
      eylemSummaries[s.eylem_num] = s.summary;
    }
  } catch (e) { eylemSummaries = {}; }

  renderCaseInfo(caseData);

  const graph = buildGraph(caseData);
  setEylemOptions(graph.eylemNums.filter((n) => n !== "other"));

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
      const baseId = nodeId.split(":")[0];
      const person = people.find((p) => p.id === baseId);
      if (person) openPersonModal(person);
    });
    network.on("selectEdge", (params) => {
      if (params.nodes && params.nodes.length > 0) return;
      if (!params.edges || params.edges.length === 0) return;
      const edgeId = params.edges[0];
      try {
        const dsEdge = network.body.data.edges.get(edgeId);
        if (dsEdge) {
          const edge = edgesCache.find(e => e.from === dsEdge.from && e.to === dsEdge.to);
          if (edge && edge._fromName) openEdgePanel(edge);
        }
      } catch (e) {}
      network.unselectAll();
    });
    let hoverClones = [];
    let hoverActive = false;
    let lastHoveredNode = null;

    function stableSetData(data) {
      const viewPos = network.getViewPosition();
      const scale = network.getScale();
      network.setData(data);
      network.moveTo({ position: viewPos, scale: scale, animation: false });
    }

    function clearHoverState() {
      if (hoverActive) {
        hoverClones = [];
        hoverActive = false;
        lastHoveredNode = null;
        stableSetData({ nodes: nodesCache, edges: edgesCache });
      }
    }

    function shortenName(label) {
      if (!label) return "";
      const parts = label.trim().split(/\s+/);
      if (parts.length <= 2) return label;
      return parts[0] + " " + parts[parts.length - 1];
    }

    function applyHover(active) {
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

      const cloneEdges = hoverClones.map(clone => ({
        from: active,
        to: clone.id,
        color: { color: "rgba(251, 191, 36, 0.6)" },
        width: 1.5,
        dashes: [4, 4],
        smooth: { type: "curvedCW", roundness: 0.2 },
        _isCloneEdge: true
      }));

      hoverActive = true;
      lastHoveredNode = active;
      stableSetData({ nodes: [...dimmedNodes, ...hoverClones], edges: cloneEdges });
    }

    network.on("hoverNode", (params) => {
      const active = params.node;
      if (active.startsWith("band:") || active.startsWith("hoverclone:")) return;
      if (active === lastHoveredNode) return;
      applyHover(active);
    });

    network.on("blurNode", () => {
      clearHoverState();
    });

    network.on("click", (params) => {
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
    network.setData({ nodes: graph.nodes, edges: graph.edges });
    network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
  }

  filterGraph();
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
casePanelClose.addEventListener("click", () => {
  casePanelContainer.classList.add("collapsed");
  casePanelToggle.style.display = "block";
});
casePanelToggle.addEventListener("click", () => {
  casePanelContainer.classList.remove("collapsed");
  casePanelToggle.style.display = "none";
});
caseClose.addEventListener("click", () => caseModal.close());
personClose.addEventListener("click", () => personModal.close());
eylemClose.addEventListener("click", () => eylemModal.style.display = "none");
edgePanelClose.addEventListener("click", () => edgePanel.style.display = "none");

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (edgePanel.style.display !== "none") { edgePanel.style.display = "none"; return; }
    if (eylemModal.style.display !== "none") { eylemModal.style.display = "none"; return; }
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
