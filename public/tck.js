const PROFILES_INITIAL_SHOW = 5;

let tckDefinitions = {};
let allData = [];

function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function updateAdminUI() {
  const adminArea = document.getElementById("admin-area");
  if (!adminArea) return;
  adminArea.innerHTML = `<a href="/admin/login.html" class="btn ghost small">Admin Paneli</a>`;
}

async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  updateAdminUI();
  renderList(allData);
}

async function loadDefinitions() {
  try {
    const res = await fetch("/api/tck-definitions");
    if (!res.ok) throw new Error("API error");
    const rows = await res.json();
    tckDefinitions = {};
    for (const r of rows) {
      tckDefinitions[r.code] = { short: r.short_desc || "", full: r.full_text || "", link: r.source_url || "" };
    }
  } catch {
    tckDefinitions = {};
  }
}

async function loadTCK() {
  const listEl = document.getElementById("tck-list");
  updateAdminUI();
  try {
    await loadDefinitions();
    allData = [];
    const res = await fetch("/api/tck-summary");
    if (res.ok) {
      allData = await res.json();
    }
    renderList(allData);
  } catch (err) {
    if (Object.keys(tckDefinitions).length > 0) {
      renderList([]);
      return;
    }
    listEl.innerHTML = '<div class="tck-empty">Veri yüklenemedi.</div>';
  }
}

function renderList(data) {
  const listEl = document.getElementById("tck-list");

  if (!data.length && Object.keys(tckDefinitions).length === 0) {
    listEl.innerHTML = '<div class="tck-empty">Henüz TCK maddesi bulunamadı.</div>';
    return;
  }
  const normalizeCode = (code) => String(code || "").replace(/^TCK\s*/i, "").replace(/\s+/g, "").trim().toLowerCase();
  const codeLabel = (code) => {
    const raw = String(code || "").replace(/^tck\s*/i, "").trim();
    return raw.toUpperCase();
  };
  const rootCode = (code) => {
    const c = normalizeCode(code);
    const m = c.match(/^(\d+)/);
    return m ? m[1] : "";
  };
  const parseParts = (code) => {
    const c = normalizeCode(code);
    const m = c.match(/^(\d+)(?:\/([^/-]+))?(?:-([^-]+))?$/i);
    if (!m) return { article: Number.MAX_SAFE_INTEGER, clause: Number.MAX_SAFE_INTEGER, letter: c };
    const clauseNum = m[2] && /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : Number.MAX_SAFE_INTEGER - 1;
    return {
      article: parseInt(m[1], 10),
      clause: m[2] ? clauseNum : 0,
      letter: String(m[3] || m[2] || "").toLowerCase()
    };
  };
  const parentCode = (code) => {
    const c = normalizeCode(code);
    if (c.includes("-")) {
      const parts = c.split("-");
      parts.pop();
      return parts.join("-");
    }
    if (c.includes("/")) return rootCode(c);
    return "";
  };
  const sortCodes = (a, b) => {
    const pa = parseParts(a);
    const pb = parseParts(b);
    if (!pa || !pb) return String(a).localeCompare(String(b));
    if (pa.article !== pb.article) return pa.article - pb.article;
    if (pa.clause !== pb.clause) return pa.clause - pb.clause;
    return pa.letter.localeCompare(pb.letter);
  };

  const profilesByCode = new Map();
  (Array.isArray(data) ? data : []).forEach((item) => {
    const c = normalizeCode(item.article);
    profilesByCode.set(c, item.profiles || []);
  });

  const definitionsByCode = new Map();
  Object.entries(tckDefinitions).forEach(([code, def]) => {
    const normalized = normalizeCode(code);
    if (!normalized) return;
    definitionsByCode.set(normalized, def || {});
  });

  const allCodes = new Set(definitionsByCode.keys());
  Array.from(allCodes).forEach((code) => {
    const root = rootCode(code);
    if (root) allCodes.add(root);
  });
  const nodes = new Map();
  allCodes.forEach((code) => {
    const def = definitionsByCode.get(code) || { short: "", full: "" };
    nodes.set(code, {
      code,
      short: def.short || "",
      full: def.full || "",
      profiles: profilesByCode.get(code) || [],
      children: []
    });
  });

  const roots = [];
  nodes.forEach((node, code) => {
    const parent = parentCode(code);
    if (parent && nodes.has(parent)) {
      nodes.get(parent).children.push(node);
    } else if (/^\d+$/.test(code)) {
      roots.push(node);
    }
  });

  const renderNode = (node, depth = 0) => {
    node.children.sort((a, b) => sortCodes(a.code, b.code));
    const profileCount = node.profiles.length;
    const collectSubtreeTexts = (n, acc = []) => {
      const t = String(n.full || "").trim();
      if (t) acc.push(t);
      (n.children || []).forEach((child) => collectSubtreeTexts(child, acc));
      return acc;
    };
    const buildFullText = (n) => {
      const blocks = collectSubtreeTexts(n, []);
      const seen = new Set();
      const merged = [];
      blocks.forEach((block) => {
        String(block)
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => {
            const key = line.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            merged.push(line);
          });
      });
      return merged.join("\n");
    };
    const displayFullText = buildFullText(node);
    const childCodes = node.children.map((child) =>
      `<span class="tck-subcode-chip">TCK ${esc(codeLabel(child.code))}</span>`
    ).join("");
    const childrenHtml = node.children.length
      ? `<div class="tck-sub-articles">${node.children.map((child) => renderNode(child, depth + 1)).join("")}</div>`
      : "";

    return `
      <div class="tck-article-card ${depth > 0 ? "sub-level" : ""}" style="${depth > 0 ? "margin:8px 0 0 14px;" : ""}">
        <details class="profile-collapse" ${depth === 0 ? "" : ""}>
          <summary class="profile-collapse-summary">
            <span class="tck-article-num">TCK ${esc(codeLabel(node.code))}</span>
            ${node.short ? `<span class="tck-article-desc">${esc(node.short)}</span>` : ""}
            <span class="tck-article-count">${profileCount} profil</span>
            ${childCodes ? `<span class="tck-article-subcodes">${childCodes}</span>` : ""}
          </summary>
          <div class="tck-article-body">
            ${displayFullText ? `
              <div class="tck-legal-section">
                <div class="tck-legal-text">${esc(displayFullText)}</div>
              </div>` : `<div class="tck-legal-section tck-legal-empty"><span class="tck-legal-title" style="opacity:0.5;">Yasal karşılığı henüz eklenmemiş</span></div>`
            }
            ${profileCount ? `<div class="tck-profiles">${renderProfiles(node.profiles, normalizeCode(node.code))}</div>` : ""}
            ${childrenHtml}
          </div>
        </details>
      </div>
    `;
  };

  roots.sort((a, b) => sortCodes(a.code, b.code));
  listEl.innerHTML = roots.map((node) => renderNode(node, 0)).join("");
}

function getDescription(article) {
  if (tckDefinitions[article]) return tckDefinitions[article];
  const base = article.split("/")[0];
  if (tckDefinitions[base]) return tckDefinitions[base];
  return { short: "", full: "", link: "" };
}

function renderProfiles(profiles, cardIdx) {
  const safeId = String(cardIdx || "").replace(/[^a-z0-9_-]/gi, "_");
  if (profiles.length <= PROFILES_INITIAL_SHOW) {
    return profiles.map(p => renderProfile(p)).join("");
  }

  const visible = profiles.slice(0, PROFILES_INITIAL_SHOW);
  const hidden = profiles.slice(PROFILES_INITIAL_SHOW);

  return `
    ${visible.map(p => renderProfile(p)).join("")}
    <div class="tck-more-profiles" id="more-${safeId}" style="display:none;">
      ${hidden.map(p => renderProfile(p)).join("")}
    </div>
    <div class="tck-show-more-wrap">
      <button class="tck-show-more-btn" onclick="toggleMoreProfiles('${safeId}', this)">
        +${hidden.length} profil daha göster
      </button>
    </div>
  `;
}

function renderProfile(p) {
  const roleLabel = getRoleLabel(p.role);
  const claimText = esc(p.claim);
  const evidenceText = esc(p.evidence);
  const defenseText = esc(p.defense);

  const sentenceBadge = p.sentenceDemand ? `
    <div class="tck-sentence-badge">
      <span class="tck-sentence-badge-icon">⚖</span>
      <span class="tck-sentence-badge-text">${esc(p.sentenceDemand)}</span>
    </div>
  ` : "";

  return `
    <div class="tck-profile-card">
      <div class="tck-profile-top">
        <div class="tck-profile-info">
          <div class="tck-profile-name">${esc(p.name)}</div>
          ${p.organization ? `<div class="tck-profile-org">${esc(p.organization)}</div>` : ""}
        </div>
        <div class="tck-profile-right">
          ${sentenceBadge}
          <div class="tck-profile-meta">
            ${roleLabel ? `<span class="tck-profile-role">${esc(roleLabel)}</span>` : ""}
            ${p.caseTitle ? `<span class="tck-profile-case">${esc(p.caseTitle)}</span>` : ""}
            ${p.actionNum ? `<span class="tck-profile-action">Eylem ${esc(String(p.actionNum))}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="tck-detail-grid">
        <div class="tck-detail-box">
          <h4>Suçlama</h4>
          <p${!claimText ? ' class="empty"' : ''}>${claimText || "Bilgi yok"}</p>
        </div>
        <div class="tck-detail-box">
          <h4>Deliller</h4>
          <p${!evidenceText ? ' class="empty"' : ''}>${evidenceText || "Bilgi yok"}</p>
        </div>
        <div class="tck-detail-box">
          <h4>Savunma</h4>
          <p${!defenseText ? ' class="empty"' : ''}>${defenseText || "Bilgi yok"}</p>
        </div>
      </div>
      ${p.caseId ? `
        <a class="tck-map-link" href="/map.html?caseId=${encodeURIComponent(p.caseId)}">
          Haritada Gör →
        </a>
      ` : ""}
    </div>
  `;
}

function getRoleLabel(role) {
  const map = {
    defendant: "Sanık",
    informant: "İtirafçı",
    witness: "Tanık",
    secretWitness: "Gizli Tanık",
    victim: "Mağdur",
    fugitive: "Firari",
    detained: "Tutuklu"
  };
  return map[role] || role || "";
}

function toggleCard(idx) {
  const card = document.querySelector(`.tck-article-card[data-index="${idx}"]`);
  if (card) card.classList.toggle("open");
}

function toggleLegal(event, idx) {
  event.stopPropagation();
  const card = document.querySelector(`.tck-article-card[data-index="${idx}"]`);
  if (!card) return;
  const section = card.querySelector(".tck-legal-section");
  if (section) section.classList.toggle("expanded");
}

function toggleMoreProfiles(cardIdx, btn) {
  const moreEl = document.getElementById("more-" + cardIdx);
  if (!moreEl) return;
  const isHidden = moreEl.style.display === "none";
  moreEl.style.display = isHidden ? "block" : "none";
  if (isHidden) {
    btn.textContent = "Gizle";
  } else {
    const count = moreEl.querySelectorAll(".tck-profile-card").length;
    btn.textContent = `+${count} profil daha göster`;
  }
}

document.getElementById("tck-search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    renderList(allData);
    return;
  }
  const filtered = allData.filter(item => {
    const descObj = getDescription(item.article);
    const articleMatch = item.article.toLowerCase().includes(q);
    const descMatch = descObj.short.toLowerCase().includes(q);
    const nameMatch = item.profiles.some(p => p.name.toLowerCase().includes(q));
    return articleMatch || descMatch || nameMatch;
  });
  renderList(filtered);
});

loadTCK();
