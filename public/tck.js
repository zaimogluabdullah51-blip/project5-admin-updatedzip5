const PROFILES_INITIAL_SHOW = 5;

let tckDefinitions = {};
let allData = [];
let legalReferences = [];
let tckArticleParts = [];
const deepSearchPollers = new Map();

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
      tckDefinitions[r.code] = {
        short: r.short_desc || "",
        full: r.full_text || "",
        link: r.source_url || "",
        category: r.category || "",
        status: r.status || ""
      };
    }
  } catch {
    tckDefinitions = {};
  }
}

async function loadTckArticleParts() {
  try {
    const res = await fetch("/api/tck-article-parts");
    if (!res.ok) throw new Error("API error");
    tckArticleParts = await res.json();
  } catch {
    tckArticleParts = [];
  }
}

async function loadLegalReferences() {
  try {
    const res = await fetch("/api/legal-references?limit=250");
    if (!res.ok) throw new Error("API error");
    legalReferences = await res.json();
  } catch {
    legalReferences = [];
  }
}

async function loadTCK() {
  const listEl = document.getElementById("tck-list");
  updateAdminUI();
  try {
    await loadDefinitions();
    await loadTckArticleParts();
    await loadLegalReferences();
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
  const normalizeCode = (code) => String(code || "").replace(/^TCK\s*/i, "").replace(/\/(\d+)\./g, "/$1-").replace(/\s+/g, "").trim().toLowerCase();
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
  const definitionForCode = (code) => {
    const normalized = normalizeCode(code);
    return definitionsByCode.get(normalized) || definitionsByCode.get(rootCode(normalized)) || {};
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

  const allCodes = new Set();
  definitionsByCode.forEach((def, code) => {
    if (/^\d+$/.test(code) || /^\d+\/[a-z]$/i.test(code) || /^geçici/i.test(code)) {
      allCodes.add(code);
    }
  });
  profilesByCode.forEach((profiles, code) => {
    if (!code || !profiles.length) return;
    allCodes.add(code);
  });
  Array.from(allCodes).forEach((code) => {
    const root = rootCode(code);
    if (root) allCodes.add(root);
  });
  const nodes = new Map();
  allCodes.forEach((code) => {
    const def = definitionForCode(code);
    nodes.set(code, {
      code,
      short: def.short || "",
      full: def.full || "",
      category: def.category || "",
      profiles: profilesByCode.get(code) || [],
      children: []
    });
  });

  const roots = [];
  nodes.forEach((node, code) => {
    const parent = parentCode(code);
    if (parent && nodes.has(parent)) {
      nodes.get(parent).children.push(node);
    } else if (rootCode(code) && rootCode(code) !== code && nodes.has(rootCode(code))) {
      nodes.get(rootCode(code)).children.push(node);
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
    const referencesHtml = renderLegalReferences(node.code);
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
            ${renderTckBreakdown(node.code)}
            ${referencesHtml}
            ${profileCount ? `<div class="tck-profiles">${renderProfiles(node.profiles, normalizeCode(node.code))}</div>` : ""}
            ${childrenHtml}
          </div>
        </details>
      </div>
    `;
  };

  roots.sort((a, b) => sortCodes(a.code, b.code));
  listEl.innerHTML = roots.map((node) => renderNode(node, 0)).join("");
  bindDeepSearchButtons();
}

function getPartsForCode(code) {
  const normalized = String(code || "").replace(/^TCK\s*/i, "").replace(/\/(\d+)\./g, "/$1-").replace(/\s+/g, "").trim().toLowerCase();
  if (!normalized) return [];
  const root = normalized.match(/^(\d+)/)?.[1] || normalized;
  return tckArticleParts.filter((part) => {
    const partCode = String(part.code || "").toLowerCase();
    const parent = String(part.parent_code || "").toLowerCase();
    const article = String(part.article_code || "").toLowerCase();
    if (normalized === root) return article === root && part.level !== "article";
    return partCode === normalized || parent === normalized || partCode.startsWith(`${normalized}-`);
  });
}

function renderTckBreakdown(code) {
  const parts = getPartsForCode(code);
  if (!parts.length) return "";
  const shown = parts.slice(0, 18);
  const more = Math.max(0, parts.length - shown.length);
  const levelLabels = {
    paragraph: "Fıkra",
    subparagraph: "Bent",
    item: "Alt bent"
  };
  const rows = shown.map((part) => {
    const level = levelLabels[part.level] || part.label || part.level || "Kırılım";
    return `
      <article class="tck-breakdown-row level-${esc(part.level || "part")}">
        <div class="tck-breakdown-code">TCK ${esc(String(part.code || "").toUpperCase())}</div>
        <div>
          <div class="tck-breakdown-title">
            <span>${esc(level)}</span>
            ${part.category ? `<em>${esc(part.category)}</em>` : ""}
          </div>
          <p>${esc(part.text || part.title || "Metin yok")}</p>
        </div>
      </article>
    `;
  }).join("");

  return `
    <section class="tck-breakdown-section">
      <div class="tck-breakdown-header">
        <h4>Madde kırılımları</h4>
        <span>${parts.length} fıkra / bent</span>
      </div>
      <div class="tck-breakdown-list">${rows}</div>
      ${more ? `<div class="tck-breakdown-more">+${more} kırılım daha var. Arama ile daraltabilirsiniz.</div>` : ""}
    </section>
  `;
}

function getReferencesForCode(code) {
  const normalized = String(code || "").replace(/^TCK\s*/i, "").replace(/\/(\d+)\./g, "/$1-").replace(/\s+/g, "").trim().toLowerCase();
  if (!normalized) return [];
  const root = normalized.match(/^(\d+)/)?.[1] || normalized;
  return legalReferences.filter((ref) => {
    const codes = Array.isArray(ref.detected_tck_codes) ? ref.detected_tck_codes : [];
    return codes.some((raw) => {
      const c = String(raw || "").replace(/^TCK\s*/i, "").replace(/\s+/g, "").trim().toLowerCase();
      return c === normalized || c === root || c.startsWith(`${normalized}/`);
    });
  });
}

function renderLegalReferences(code) {
  const refs = getReferencesForCode(code).slice(0, 3);
  const normalized = String(code || "").replace(/^TCK\s*/i, "").replace(/\s+/g, "").trim().toUpperCase();
  const items = refs.map((ref) => {
    const meta = [
      ref.source,
      ref.court,
      ref.esas_no ? `E. ${ref.esas_no}` : "",
      ref.karar_no ? `K. ${ref.karar_no}` : "",
      ref.karar_tarihi
    ].filter(Boolean).join(" · ");
    return `
      <article class="tck-reference-card">
        <div class="tck-reference-meta">${esc(meta)}</div>
        <p>${esc(ref.short_preview || "Kısa karar kesiti henüz yok.")}</p>
      </article>
    `;
  }).join("");

  return `
    <section class="tck-reference-section">
      <div class="tck-reference-header">
        <div>
          <h4>İlgili İçtihatlar</h4>
          <p>${refs.length ? `${refs.length} yapılandırılmış karar kaydı gösteriliyor.` : "Bu madde için kayıtlı içtihat yok."}</p>
        </div>
        <button type="button" class="tck-deep-search-btn" data-tck-code="${esc(normalized)}" data-legal-ref="${esc(`TCK ${normalized}`)}">
          Mevzuat içtihadı ara
        </button>
      </div>
      <div class="tck-deep-search-status" data-deep-status-for="${esc(normalized)}"></div>
      ${refs.length ? `<div class="tck-reference-list">${items}</div>` : `
        <div class="tck-reference-empty">
          Hugging Face arşivinde bu madde için derin arama kuyruğa alınabilir.
        </div>
      `}
    </section>
  `;
}

function bindDeepSearchButtons() {
  document.querySelectorAll(".tck-deep-search-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tckCode = btn.getAttribute("data-tck-code") || "";
      const legalRef = btn.getAttribute("data-legal-ref") || `TCK ${tckCode}`;
      btn.disabled = true;
      btn.textContent = "Kuyruğa alınıyor...";
      try {
        const res = await fetch("/api/deep-search-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tckCode, legalRef, query: legalRef })
        });
        if (!res.ok) throw new Error("job error");
        const job = await res.json();
        btn.textContent = "Durum aşağıda";
        renderDeepSearchStatus(tckCode, job);
        pollDeepSearchJob(tckCode, job.id);
      } catch {
        btn.disabled = false;
        btn.textContent = "Tekrar dene";
      }
    });
  });
}

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!total) return "Tahmin yok";
  const minutes = Math.max(1, Math.round(total / 60));
  if (minutes < 60) return `Yaklaşık ${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `Yaklaşık ${hours} sa ${rest} dk` : `Yaklaşık ${hours} sa`;
}

function statusLabel(status) {
  const map = {
    queued: "Kuyrukta",
    running: "Taranıyor",
    waiting_external: "Dış indeks bekleniyor",
    completed: "Tamamlandı",
    failed: "Hata",
    cancelled: "İptal"
  };
  return map[status] || status || "Bilinmiyor";
}

function formatNextAttempt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffSeconds = Math.max(0, Math.round((date.getTime() - Date.now()) / 1000));
  const clock = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (!diffSeconds) return `${clock} civarı`;
  if (diffSeconds < 60) return `${clock} (${diffSeconds} sn sonra)`;
  return `${clock} (${Math.ceil(diffSeconds / 60)} dk sonra)`;
}

function renderDeepSearchStatusMarkup(job) {
  const progress = Math.max(0, Math.min(100, Number(job.progress_percent || 0)));
  const message = job.status_message || (
    job.status === "queued"
      ? "Kuyruğa alındı. Tarama birazdan başlayacak."
      : "Durum güncelleniyor."
  );
  const retryText = Number(job.retry_count || 0)
    ? `${Number(job.retry_count || 0)}. otomatik deneme`
    : "İlk deneme";
  const nextAttemptText = formatNextAttempt(job.next_attempt_at);
  const etaText = job.status === "completed"
    ? "Bitti"
    : job.status === "failed"
      ? "Tekrar deneyebilirsiniz"
      : job.status === "waiting_external"
        ? (nextAttemptText ? `Sonraki deneme: ${nextAttemptText}` : "Dış servis bekleniyor")
        : job.status === "queued"
          ? "Kuyrukta. Tahmini süre: " + formatDuration(job.estimated_seconds)
          : "Tahmini kalan süre: " + formatDuration(job.estimated_seconds);
  const errorText = job.status === "failed" && job.error ? String(job.error) : "";
  const canonical = job.canonical_ref || "";
  const plan = Array.isArray(job.query_plan) ? job.query_plan.slice(0, 4).join(" → ") : "";

  return `
    <div class="tck-deep-status-card">
      <div class="tck-deep-status-top">
        <strong>${esc(statusLabel(job.status))}</strong>
        <span>${esc(String(progress))}%</span>
      </div>
      <div class="tck-deep-progress" aria-label="Derin arama ilerlemesi">
        <span style="width:${progress}%"></span>
      </div>
      <div class="tck-deep-status-meta">
        <span>${esc(etaText)}</span>
        <span>${esc(retryText)} · ${esc(String(job.matched_count || 0))} eşleşme</span>
      </div>
      <p>${esc(message)}</p>
      ${errorText ? `<p class="tck-deep-error">${esc(errorText)}</p>` : ""}
      ${canonical ? `<code>${esc(canonical)}</code>` : ""}
      ${plan ? `<p>${esc(`Arama sırası: ${plan}`)}</p>` : ""}
      <code>${esc(job.id || "")}</code>
    </div>
  `;
}

function renderDeepSearchStatus(tckCode, job) {
  const normalized = String(tckCode || "").replace(/^TCK\s*/i, "").replace(/\s+/g, "").trim().toUpperCase();
  const statusEl = tckCode === "__legal_reference__"
    ? document.getElementById("legal-reference-status")
    : document.querySelector(`.tck-deep-search-status[data-deep-status-for="${CSS.escape(normalized)}"]`);
  if (!statusEl || !job) return;
  statusEl.innerHTML = renderDeepSearchStatusMarkup(job);
}

function pollDeepSearchJob(tckCode, jobId) {
  if (!jobId) return;
  if (deepSearchPollers.has(jobId)) clearInterval(deepSearchPollers.get(jobId));
  const tick = async () => {
    try {
      const res = await fetch(`/api/deep-search-jobs/${encodeURIComponent(jobId)}`);
      if (!res.ok) throw new Error("status error");
      const job = await res.json();
      renderDeepSearchStatus(tckCode, job);
      if (["completed", "failed", "cancelled"].includes(job.status)) {
        clearInterval(deepSearchPollers.get(jobId));
        deepSearchPollers.delete(jobId);
        if (job.status === "completed") loadLegalReferences().then(() => renderList(allData));
        if (job.status === "failed") {
          if (tckCode === "__legal_reference__") {
            const submit = document.querySelector("#legal-reference-form button");
            if (submit) {
              submit.disabled = false;
              submit.textContent = "Tekrar dene";
            }
            return;
          }
          const normalized = String(tckCode || "").replace(/^TCK\s*/i, "").replace(/\s+/g, "").trim().toUpperCase();
          const btn = document.querySelector(`.tck-deep-search-btn[data-tck-code="${CSS.escape(normalized)}"]`);
          if (btn) {
            btn.disabled = false;
            btn.textContent = "Tekrar dene";
          }
        }
      }
    } catch {
      clearInterval(deepSearchPollers.get(jobId));
      deepSearchPollers.delete(jobId);
    }
  };
  const interval = setInterval(tick, 5000);
  deepSearchPollers.set(jobId, interval);
}

function bindLegalReferenceForm() {
  const form = document.getElementById("legal-reference-form");
  const input = document.getElementById("legal-reference-input");
  const status = document.getElementById("legal-reference-status");
  if (!form || !input || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const legalRef = input.value.trim();
    if (!legalRef) {
      if (status) status.innerHTML = '<div class="tck-empty" style="padding:12px 0;">Önce bir mevzuat atfı yazın.</div>';
      return;
    }
    const submit = form.querySelector("button");
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Kuyruğa alınıyor...";
    }
    try {
      const res = await fetch("/api/deep-search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ legalRef, query: legalRef })
      });
      if (!res.ok) throw new Error("job error");
      const job = await res.json();
      if (submit) submit.textContent = "Durum aşağıda";
      renderDeepSearchStatus("__legal_reference__", job);
      pollDeepSearchJob("__legal_reference__", job.id);
    } catch {
      if (submit) {
        submit.disabled = false;
        submit.textContent = "Tekrar dene";
      }
      if (status) status.innerHTML = '<div class="tck-empty" style="padding:12px 0;">Arama başlatılamadı. Birazdan tekrar deneyin.</div>';
    }
  });
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
  const actionLabel = [
    p.actionNum ? `Eylem ${p.actionNum}` : "",
    p.actionTitle || ""
  ].filter(Boolean).join(": ");

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
            ${actionLabel ? `<span class="tck-profile-action">${esc(actionLabel)}</span>` : ""}
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
    const actionTitleMatch = item.profiles.some(p => String(p.actionTitle || "").toLowerCase().includes(q));
    const referenceMatch = getReferencesForCode(item.article).some((ref) => {
      return [
        ref.court,
        ref.esas_no,
        ref.karar_no,
        ref.karar_tarihi,
        ref.short_preview,
        ...(Array.isArray(ref.detected_law_refs) ? ref.detected_law_refs : [])
      ].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
    return articleMatch || descMatch || nameMatch || actionTitleMatch || referenceMatch;
  });
  renderList(filtered);
});

bindLegalReferenceForm();
loadTCK();
