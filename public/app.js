const caseGrid = document.getElementById("case-grid");
const caseSearch = document.getElementById("case-search");
const statCases = document.getElementById("stat-cases");
const statDefendants = document.getElementById("stat-defendants");
const previewMap = document.getElementById("preview-map");
const openFull = document.getElementById("open-full");

let cases = [];
let previewNetwork = null;
let selectedCaseId = null;

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "İstek başarısız");
  return data;
}

function renderCaseGrid() {
  const query = caseSearch.value.toLowerCase().trim();
  caseGrid.innerHTML = "";
  const loadMoreBtn = document.getElementById("load-more-btn");

  const filtered = cases.filter((item) => {
    if (!query) return true;
    return (
      item.title.toLowerCase().includes(query) ||
      (item.case_number || "").toLowerCase().includes(query) ||
      (item.court_name || "").toLowerCase().includes(query)
    );
  });

  if (!filtered.length) {
    caseGrid.innerHTML = `<div class="muted">Kayıt bulunamadı.</div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  // Limit to 6 cases for 3x2 grid
  const displayCases = filtered.slice(0, 6);
  if (loadMoreBtn) {
    loadMoreBtn.style.display = filtered.length > 6 ? "block" : "none";
  }

  for (const item of displayCases) {
    const card = document.createElement("div");
    card.className = "case-card";
    card.innerHTML = `
      <div class="file-tab">
        <span class="file-tab-text"></span>
      </div>
      <div class="status-badge">${item.status || 'Devam Ediyor'}</div>
      <h4>${item.title || "Adsız Dava"}</h4>
      <div class="case-details">
        <div class="detail-row"><span class="detail-label">Esas No:</span> <span class="detail-value">${item.case_number || '---'}</span></div>
        <div class="detail-row"><span class="detail-label">Mahkeme:</span> <span class="detail-value">${item.court_name || '---'}</span></div>
        <div class="detail-row"><span class="detail-label">Savcı:</span> <span class="detail-value">${item.prosecutor || '---'}</span></div>
        <div class="detail-row"><span class="detail-label">Hakim:</span> <span class="detail-value">${item.judge || '---'}</span></div>
        <div class="detail-row"><span class="detail-label">Heyet:</span> <span class="detail-value">${item.court_panel || '---'}</span></div>
        <div class="detail-row"><span class="detail-label">Tarih:</span> <span class="detail-value">${item.date || '---'}</span></div>
        <div class="detail-row"><span class="detail-label">Durum:</span> <span class="detail-value">${item.status || '---'}</span></div>
        <div class="detail-row"><span class="detail-label">Sanık:</span> <span class="detail-value">${item.defendantCount || '0'}</span></div>
      </div>
      <div class="card-footer">
        <div class="btn-map">Haritaya geç</div>
      </div>
    `;
    card.addEventListener("click", () => {
      window.location.href = `/map.html?caseId=${item.id}`;
    });
    caseGrid.appendChild(card);
  }
}

function updateStats() {
  if (statCases) statCases.textContent = cases.length;
  if (statDefendants) {
    const total = cases.reduce((sum, item) => sum + (item.defendantCount || 0), 0);
    statDefendants.textContent = total;
  }
}

async function buildPreview(caseId) {
  if (!caseId) return;
  const data = await fetchJSON(`/api/cases/${caseId}`);
  if (openFull) openFull.href = `/map.html?caseId=${caseId}`;
  const previewLink = document.querySelector(".preview-wrap");
  if (previewLink) previewLink.href = `/map.html?caseId=${caseId}`;

  const nodes = (data.people || []).map((p) => ({
    id: p.id,
    label: p.name,
    shape: "circularImage",
    image: p.photo_url || "/assets/default-avatar.svg",
    size: 20,
    font: { color: "#e5e7eb", size: 10, face: "Inter" },
    color: { border: "#9ca3af", background: "#111827" }
  }));

  const edges = [];
  const edgeSet = new Set();
  for (const person of data.people || []) {
    for (const target of person.related_profiles || []) {
      const key = [person.id, target].sort().join("|");
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ from: person.id, to: target, color: { color: "rgba(148,163,184,0.35)" } });
    }
  }

  const options = {
    interaction: { dragView: true, zoomView: true },
    physics: { stabilization: false },
    edges: { smooth: { type: "continuous" } }
  };

  if (!previewNetwork) {
    previewNetwork = new vis.Network(previewMap, { nodes, edges }, options);
    previewNetwork.on("click", (params) => {
      if (selectedCaseId) {
        window.location.href = `/map.html?caseId=${selectedCaseId}`;
      }
    });
  } else {
    previewNetwork.setData({ nodes, edges });
  }
}

async function selectCase(caseId) {
  selectedCaseId = caseId;
  await buildPreview(caseId);
}

async function loadData() {
  const data = await fetchJSON("/api/cases");
  cases = Array.isArray(data) ? data : (data.cases || []);
  renderCaseGrid();
  updateStats();
  if (cases[0]) {
    await selectCase(cases[0].id);
  }
}

caseSearch.addEventListener("input", renderCaseGrid);

loadData();
