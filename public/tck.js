const PROFILES_INITIAL_SHOW = 5;

let tckDefinitions = {};
let isAdmin = false;
let allData = [];

function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

async function checkAdmin() {
  try {
    const res = await fetch("/api/me");
    const data = await res.json();
    isAdmin = data.authed === true;
  } catch { isAdmin = false; }
  updateAdminUI();
}

function updateAdminUI() {
  const adminArea = document.getElementById("admin-area");
  if (!adminArea) return;
  if (isAdmin) {
    adminArea.innerHTML = `
      <span class="admin-status">Admin ✓</span>
      <button class="btn ghost small" onclick="doLogout()">Çıkış</button>
    `;
  } else {
    adminArea.innerHTML = `
      <a href="/admin/login.html" class="btn ghost small">Admin Girişi</a>
    `;
  }
}

async function doLogout() {
  await fetch("/api/logout", { method: "POST" });
  isAdmin = false;
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
      tckDefinitions[r.code] = { short: r.short_desc || "", full: r.full_text || "" };
    }
  } catch {
    tckDefinitions = {};
  }
}

async function loadTCK() {
  const listEl = document.getElementById("tck-list");
  try {
    await Promise.all([loadDefinitions(), checkAdmin()]);
    const res = await fetch("/api/tck-summary");
    if (!res.ok) throw new Error("API error");
    allData = await res.json();
    renderList(allData);
  } catch (err) {
    listEl.innerHTML = '<div class="tck-empty">Veri yüklenemedi.</div>';
  }
}

function renderList(data) {
  const listEl = document.getElementById("tck-list");

  if (!data.length) {
    listEl.innerHTML = '<div class="tck-empty">Henüz TCK maddesi bulunamadı.</div>';
    return;
  }

  listEl.innerHTML = data.map((item, idx) => {
    const descObj = getDescription(item.article);
    const profileCount = item.profiles.length;

    const editBtn = isAdmin ? `<button class="tck-edit-btn" onclick="openEditDefinition('${esc(item.article)}', event)" title="Düzenle">✎</button>` : "";

    return `
      <div class="tck-article-card" data-index="${idx}">
        <div class="tck-article-header" onclick="toggleCard(${idx})">
          <div class="tck-article-title">
            <span class="tck-article-num">${item.article.startsWith("TCK") ? item.article : "TCK " + item.article}</span>
            <span class="tck-article-desc">${esc(descObj.short) || "—"}</span>
            ${editBtn}
          </div>
          <span class="tck-article-count">${profileCount} profil</span>
          <span class="tck-article-chevron">▼</span>
        </div>
        <div class="tck-article-body">
          ${descObj.full ? `
            <div class="tck-legal-section">
              <div class="tck-legal-header" onclick="toggleLegal(event, ${idx})">
                <span class="tck-legal-title">Yasal Karşılığı</span>
                <span class="tck-legal-toggle">Oku ▼</span>
              </div>
              <div class="tck-legal-text">${esc(descObj.full)}</div>
            </div>
          ` : (isAdmin ? `
            <div class="tck-legal-section tck-legal-empty">
              <div class="tck-legal-header" onclick="openEditDefinition('${esc(item.article)}', event)">
                <span class="tck-legal-title" style="opacity:0.5;">Yasal karşılığı henüz eklenmemiş</span>
                <span class="tck-legal-toggle" style="color:#e57373;">+ Ekle</span>
              </div>
            </div>
          ` : "")}
          <div class="tck-profiles">
            ${renderProfiles(item.profiles, idx)}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function getDescription(article) {
  if (tckDefinitions[article]) return tckDefinitions[article];
  const base = article.split("/")[0];
  if (tckDefinitions[base]) return tckDefinitions[base];
  return { short: "", full: "" };
}

function renderProfiles(profiles, cardIdx) {
  if (profiles.length <= PROFILES_INITIAL_SHOW) {
    return profiles.map(p => renderProfile(p)).join("");
  }

  const visible = profiles.slice(0, PROFILES_INITIAL_SHOW);
  const hidden = profiles.slice(PROFILES_INITIAL_SHOW);

  return `
    ${visible.map(p => renderProfile(p)).join("")}
    <div class="tck-more-profiles" id="more-${cardIdx}" style="display:none;">
      ${hidden.map(p => renderProfile(p)).join("")}
    </div>
    <div class="tck-show-more-wrap">
      <button class="tck-show-more-btn" onclick="toggleMoreProfiles(${cardIdx}, this)">
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

function openEditDefinition(code, event) {
  if (event) event.stopPropagation();
  if (!isAdmin) return;

  const existing = tckDefinitions[code] || { short: "", full: "" };

  const overlay = document.createElement("div");
  overlay.className = "tck-modal-overlay";
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = `
    <div class="tck-modal">
      <div class="tck-modal-header">
        <h3>TCK ${esc(code)} — Tanım Düzenle</h3>
        <button class="tck-modal-close" onclick="this.closest('.tck-modal-overlay').remove()">✕</button>
      </div>
      <div class="tck-modal-body">
        <label class="tck-modal-label">Kısa Açıklama</label>
        <input type="text" id="edit-short-desc" class="tck-modal-input" value="${esc(existing.short)}" placeholder="Örn: Silahlı Örgüt Üyeliği" />
        <label class="tck-modal-label">Yasal Karşılığı (Detaylı Metin)</label>
        <textarea id="edit-full-text" class="tck-modal-textarea" rows="8" placeholder="TCK maddesinin tam yasal açıklaması...">${esc(existing.full)}</textarea>
      </div>
      <div class="tck-modal-footer">
        <button class="btn ghost small" onclick="this.closest('.tck-modal-overlay').remove()">İptal</button>
        <button class="tck-modal-save" onclick="saveDefinition('${esc(code)}')">Kaydet</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

async function saveDefinition(code) {
  const shortDesc = document.getElementById("edit-short-desc").value.trim();
  const fullText = document.getElementById("edit-full-text").value.trim();

  const saveBtn = document.querySelector(".tck-modal-save");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Kaydediliyor..."; }

  try {
    const res = await fetch(`/api/tck-definitions/${encodeURIComponent(code)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ short_desc: shortDesc, full_text: fullText })
    });

    if (!res.ok) throw new Error("Save failed");

    tckDefinitions[code] = { short: shortDesc, full: fullText };

    const overlay = document.querySelector(".tck-modal-overlay");
    if (overlay) overlay.remove();

    renderList(allData);
  } catch (err) {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Kaydet"; }
    alert("Kaydetme başarısız oldu. Lütfen tekrar deneyin.");
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
