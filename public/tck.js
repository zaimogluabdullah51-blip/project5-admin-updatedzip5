const TCK_DESCRIPTIONS = {
  "220": "Suç İşlemek Amacıyla Örgüt Kurma",
  "220/6": "Örgüte Bilerek ve İsteyerek Yardım Etme",
  "220/7": "Örgüt Propagandası Yapma",
  "220/8": "Örgütün Hiyerarşik Yapısına Dahil Olmamakla Birlikte Örgüt Adına Suç İşleme",
  "252": "Zimmet",
  "271": "Suç Uydurma",
  "285": "Devletin Güvenliğine İlişkin Bilgileri Temin Etme",
  "299": "Cumhurbaşkanına Hakaret",
  "301": "Türklüğü Aşağılama",
  "302": "Devletin Birliğini ve Ülke Bütünlüğünü Bozmak",
  "309": "Anayasayı İhlal",
  "311": "Yasama Organına Karşı Suç",
  "312": "Hükûmete Karşı Suç",
  "314": "Silahlı Örgüt Kurma veya Üye Olma",
  "314/1": "Silahlı Örgüt Kurma veya Yönetme",
  "314/2": "Silahlı Örgüt Üyeliği",
  "315": "Silah Sağlama",
  "316": "Suç İçin Anlaşma",
  "318": "Halkı Askerlikten Soğutma",
  "327": "Devletin Güvenliğine İlişkin Belgeleri Temin Etme",
  "328": "Siyasal veya Askeri Casusluk",
  "334": "Yasaklanan Bilgileri Açıklama",
  "339": "Devlet Sırlarından Yararlanma",
  "3713/5": "Terörle Mücadele Kanunu Md. 5 – Terör Örgütü Üyeliği (Cezayı Ağırlaştırma)"
};

function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

let allData = [];

async function loadTCK() {
  const listEl = document.getElementById("tck-list");
  try {
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
    const desc = getDescription(item.article);
    const profileCount = item.profiles.length;

    return `
      <div class="tck-article-card" data-index="${idx}">
        <div class="tck-article-header" onclick="toggleCard(${idx})">
          <div class="tck-article-title">
            <span class="tck-article-num">${item.article.startsWith("TCK") ? item.article : "TCK " + item.article}</span>
            <span class="tck-article-desc">${desc}</span>
          </div>
          <span class="tck-article-count">${profileCount} profil</span>
          <span class="tck-article-chevron">▼</span>
        </div>
        <div class="tck-article-body">
          ${desc !== "—" ? `<div class="tck-official"><strong>Resmi Tanım:</strong> ${desc}</div>` : ""}
          <div class="tck-profiles">
            ${item.profiles.map(p => renderProfile(p, item.article)).join("")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function getDescription(article) {
  if (TCK_DESCRIPTIONS[article]) return TCK_DESCRIPTIONS[article];
  const base = article.split("/")[0];
  if (TCK_DESCRIPTIONS[base]) return TCK_DESCRIPTIONS[base];
  return "—";
}

function renderProfile(p, article) {
  const roleLabel = getRoleLabel(p.role);
  const claimText = esc(p.claim);
  const evidenceText = esc(p.evidence);
  const defenseText = esc(p.defense);

  return `
    <div class="tck-profile-card">
      <div class="tck-profile-top">
        <div>
          <div class="tck-profile-name">${esc(p.name)}</div>
          ${p.organization ? `<div class="tck-profile-org">${esc(p.organization)}</div>` : ""}
        </div>
        <div class="tck-profile-meta">
          ${roleLabel ? `<span class="tck-profile-role">${esc(roleLabel)}</span>` : ""}
          ${p.caseTitle ? `<span class="tck-profile-case">${esc(p.caseTitle)}</span>` : ""}
          ${p.actionNum ? `<span class="tck-profile-action">Eylem ${esc(String(p.actionNum))}</span>` : ""}
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
      ${p.sentenceDemand ? `
        <div class="tck-sentence">
          <span class="tck-sentence-label">Talep Edilen Ceza:</span>
          <span class="tck-sentence-value">${esc(p.sentenceDemand)}</span>
        </div>
      ` : ""}
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

document.getElementById("tck-search").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    renderList(allData);
    return;
  }
  const filtered = allData.filter(item => {
    const desc = getDescription(item.article).toLowerCase();
    const articleMatch = item.article.toLowerCase().includes(q);
    const descMatch = desc.includes(q);
    const nameMatch = item.profiles.some(p => p.name.toLowerCase().includes(q));
    return articleMatch || descMatch || nameMatch;
  });
  renderList(filtered);
});

loadTCK();
