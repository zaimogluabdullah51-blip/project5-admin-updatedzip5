import sqlite3 from "sqlite3";
import { nanoid } from "nanoid";
import fs from "fs";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "cases.db");

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function init() {
  await run(`
    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      incident TEXT,
      dossier TEXT,
      date TEXT,
      status TEXT,
      case_number TEXT,
      court_name TEXT,
      judge TEXT,
      court_panel TEXT,
      prosecutor TEXT,
      hearing_count INTEGER,
      start_date TEXT,
      last_hearing_date TEXT,
      tck_articles TEXT,
      indictment_prosecutor TEXT,
      trial_prosecutor TEXT,
      judge_type TEXT,
      judge_name TEXT,
      panel_president TEXT,
      panel_members TEXT,
      indictment_date TEXT,
      acceptance_date TEXT,
      verdict_date TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      charge TEXT,
      claim TEXT,
      evidence TEXT,
      photo_url TEXT,
      tck_articles TEXT,
      accusations TEXT,
      evidence_items TEXT,
      defense TEXT,
      related_profiles TEXT,
      hierarchy TEXT,
      is_external INTEGER
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS case_people (
      case_id TEXT NOT NULL,
      person_id TEXT NOT NULL,
      relationship TEXT,
      PRIMARY KEY (case_id, person_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS actions (
      id TEXT PRIMARY KEY,
      case_id TEXT,
      person_id TEXT,
      action_num TEXT,
      title TEXT,
      claim TEXT,
      evidence TEXT,
      defense TEXT,
      tck_codes TEXT,
      sentence_demand TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tck_definitions (
      code TEXT PRIMARY KEY,
      short_desc TEXT NOT NULL,
      full_text TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS officials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT,
      institution TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS case_officials (
      case_id TEXT NOT NULL,
      official_id TEXT NOT NULL,
      role_in_case TEXT,
      PRIMARY KEY (case_id, official_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS indictments (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      summary TEXT,
      created_at TEXT
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS indictment_actions (
      id TEXT PRIMARY KEY,
      indictment_id TEXT NOT NULL,
      action_num TEXT,
      title TEXT,
      tck_codes TEXT,
      evidence TEXT
    )
  `);

  await ensureColumn("cases", "case_number", "TEXT");
  await ensureColumn("cases", "court_name", "TEXT");
  await ensureColumn("cases", "judge", "TEXT");
  await ensureColumn("cases", "court_panel", "TEXT");
  await ensureColumn("cases", "prosecutor", "TEXT");
  await ensureColumn("cases", "hearing_count", "INTEGER");
  await ensureColumn("cases", "start_date", "TEXT");
  await ensureColumn("cases", "last_hearing_date", "TEXT");
  await ensureColumn("cases", "tck_articles", "TEXT");
  await ensureColumn("cases", "indictment_prosecutor", "TEXT");
  await ensureColumn("cases", "trial_prosecutor", "TEXT");
  await ensureColumn("cases", "judge_type", "TEXT");
  await ensureColumn("cases", "judge_name", "TEXT");
  await ensureColumn("cases", "panel_president", "TEXT");
  await ensureColumn("cases", "panel_members", "TEXT");
  await ensureColumn("cases", "indictment_date", "TEXT");
  await ensureColumn("cases", "acceptance_date", "TEXT");
  await ensureColumn("cases", "verdict_date", "TEXT");
  await ensureColumn("people", "photo_url", "TEXT");
  await ensureColumn("people", "tck_articles", "TEXT");
  await ensureColumn("people", "accusations", "TEXT");
  await ensureColumn("people", "evidence_items", "TEXT");
  await ensureColumn("people", "defense", "TEXT");
  await ensureColumn("people", "related_profiles", "TEXT");
  await ensureColumn("people", "hierarchy", "TEXT");
  await ensureColumn("people", "is_external", "INTEGER");
  await ensureColumn("people", "organization", "TEXT");
  await ensureColumn("people", "title", "TEXT");
  await ensureColumn("people", "sentence_demand", "TEXT");
  await ensureColumn("people", "action_numbers", "TEXT");
  await ensureColumn("actions", "sentence_demand", "TEXT");
  await ensureColumn("actions", "mentioned_names", "TEXT");

  await seedTckDefinitions();

  const row = await get("SELECT COUNT(*) as count FROM cases");
  if (row && row.count > 0) return;

  const sample = seedData();

  for (const c of sample.cases) {
    await run(
      `INSERT INTO cases
        (id, title, summary, incident, dossier, date, status, case_number, court_name, judge, court_panel, prosecutor, hearing_count, start_date, last_hearing_date, tck_articles, indictment_prosecutor, trial_prosecutor, judge_type, judge_name, panel_president, panel_members, indictment_date, acceptance_date, verdict_date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        c.id,
        c.title,
        c.summary,
        c.incident,
        c.dossier,
        c.date,
        c.status,
        c.caseNumber,
        c.courtName,
        c.judge,
        c.courtPanel,
        c.prosecutor,
        c.hearingCount,
        c.startDate,
        c.lastHearingDate,
        JSON.stringify(c.tckArticles || []),
        c.indictmentProsecutor || "",
        c.trialProsecutor || "",
        c.judgeType || "single",
        c.judgeName || "",
        c.panelPresident || "",
        c.panelMembers || "",
        c.indictmentDate || "",
        c.acceptanceDate || "",
        c.verdictDate || ""
      ]
    );
  }

  for (const p of sample.people) {
    await run(
      `INSERT INTO people
        (id, name, role, charge, claim, evidence, photo_url, tck_articles, accusations, evidence_items, defense, related_profiles, hierarchy, is_external)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.name,
        p.role,
        p.charge,
        p.claim,
        p.evidence,
        p.photoUrl || "",
        JSON.stringify(p.tckArticles || []),
        JSON.stringify(p.accusations || []),
        JSON.stringify(p.evidenceItems || []),
        JSON.stringify(p.defense || []),
        JSON.stringify(p.relatedProfiles || []),
        JSON.stringify(p.hierarchy || {}),
        p.isExternal ? 1 : 0
      ]
    );
  }

  for (const link of sample.casePeople) {
    await run(
      "INSERT INTO case_people (case_id, person_id, relationship) VALUES (?, ?, ?)",
      [link.caseId, link.personId, link.relationship]
    );
  }
}

async function seedTckDefinitions() {
  const existing = await get("SELECT COUNT(*) as count FROM tck_definitions");
  if (existing && existing.count > 0) return;

  const defs = [
    { code: "220", short_desc: "Suç İşlemek Amacıyla Örgüt Kurma", full_text: "Kanunun suç saydığı fiilleri işlemek amacıyla örgüt kuranlar veya yönetenler, örgütün yapısı, sahip bulunduğu üye sayısı ile araç ve gereç bakımından amaç suçları işlemeye elverişli olması hâlinde cezalandırılır. Örgüt üyeliği, örgütün hiyerarşik yapısına dahil olmayı ve örgüte bilerek ve isteyerek katılmayı gerektirir." },
    { code: "220/6", short_desc: "Örgüte Bilerek ve İsteyerek Yardım Etme", full_text: "Örgüte üye olmamakla birlikte örgüt adına suç işleyen kişi, ayrıca örgüte üye olmak suçundan da cezalandırılır. Örgüte bilerek ve isteyerek yardım eden kişi, örgüt üyesi olarak cezalandırılır." },
    { code: "220/7", short_desc: "Örgüt Propagandası Yapma", full_text: "Örgütün cebir, şiddet veya tehdit içeren yöntemlerini meşru gösterecek ya da övecek ya da bu yöntemlere başvurmayı teşvik edecek şekilde propagandasını yapan kişi cezalandırılır." },
    { code: "220/8", short_desc: "Örgütün Hiyerarşik Yapısına Dahil Olmamakla Birlikte Örgüt Adına Suç İşleme", full_text: "Örgütün hiyerarşik yapısına dahil olmamakla birlikte, örgüt adına suç işleyen kişi, ayrıca örgüte üye olmak suçundan da cezalandırılır." },
    { code: "252", short_desc: "Zimmet", full_text: "Görevi nedeniyle zilyedliği kendisine devredilmiş olan veya koruma ve gözetimiyle yükümlü olduğu malı kendisinin veya başkasının zimmetine geçiren kamu görevlisi cezalandırılır. Suçun, zimmetin açığa çıkmamasını sağlamaya yönelik hileli davranışlarla işlenmesi hâlinde ceza artırılır." },
    { code: "271", short_desc: "Suç Uydurma", full_text: "İşlenmediğini bildiği bir suçu, yetkili makamlara işlenmiş gibi ihbar eden ya da işlenmeyen bir suçun delil veya emarelerini soruşturma yapılmasını sağlayacak biçimde uyduran kimseye ceza verilir." },
    { code: "285", short_desc: "Devletin Güvenliğine İlişkin Bilgileri Temin Etme", full_text: "Devletin güvenliği veya iç veya dış siyasal yararları bakımından niteliği itibarıyla gizli kalması gereken bilgileri temin eden kimseye ceza verilir." },
    { code: "299", short_desc: "Cumhurbaşkanına Hakaret", full_text: "Cumhurbaşkanına hakaret eden kişi cezalandırılır. Suçun alenen işlenmesi hâlinde ceza artırılır. Bu suçtan dolayı kovuşturma yapılması, Adalet Bakanının iznine bağlıdır." },
    { code: "301", short_desc: "Türklüğü Aşağılama", full_text: "Türk Milletini, Türkiye Cumhuriyeti Devletini, Devletin kurum ve organlarını aşağılayan kişi cezalandırılır. Türklüğü aşağılamanın yabancı bir ülkede bir Türk vatandaşı tarafından işlenmesi hâlinde ceza artırılır." },
    { code: "302", short_desc: "Devletin Birliğini ve Ülke Bütünlüğünü Bozmak", full_text: "Devletin topraklarının tamamını veya bir kısmını yabancı bir devletin egemenliği altına koymaya veya Devletin bağımsızlığını zayıflatmaya veya birliğini bozmaya veya Devletin egemenliği altında bulunan topraklardan bir kısmını Devlet idaresinden ayırmaya yönelik bir fiil işleyen kimse, ağırlaştırılmış müebbet hapis cezası ile cezalandırılır." },
    { code: "309", short_desc: "Anayasayı İhlal", full_text: "Cebir ve şiddet kullanarak Türkiye Cumhuriyeti Anayasasının öngördüğü düzeni ortadan kaldırmaya veya bu düzen yerine başka bir düzen getirmeye veya bu düzenin fiilen uygulanmasını önlemeye teşebbüs edenler ağırlaştırılmış müebbet hapis cezası ile cezalandırılır." },
    { code: "311", short_desc: "Yasama Organına Karşı Suç", full_text: "Cebir ve şiddet kullanarak Türkiye Büyük Millet Meclisini ortadan kaldırmaya veya Türkiye Büyük Millet Meclisinin görevlerini kısmen veya tamamen yapmasını engellemeye teşebbüs edenler ağırlaştırılmış müebbet hapis cezası ile cezalandırılır." },
    { code: "312", short_desc: "Hükûmete Karşı Suç", full_text: "Cebir ve şiddet kullanarak Türkiye Cumhuriyeti Hükûmetini ortadan kaldırmaya veya görevlerini yapmasını kısmen veya tamamen engellemeye teşebbüs eden kimseye ağırlaştırılmış müebbet hapis cezası verilir." },
    { code: "314", short_desc: "Silahlı Örgüt Kurma veya Üye Olma", full_text: "Bu kısmın dördüncü ve beşinci bölümlerinde yer alan suçları işlemek amacıyla silahlı örgüt kuran veya yöneten kişi, on yıldan on beş yıla kadar hapis cezası ile cezalandırılır. Örgüte üye olanlara beş yıldan on yıla kadar hapis cezası verilir." },
    { code: "314/1", short_desc: "Silahlı Örgüt Kurma veya Yönetme", full_text: "Bu kısmın dördüncü ve beşinci bölümlerinde yer alan suçları işlemek amacıyla silahlı örgüt kuran veya yöneten kişi, on yıldan on beş yıla kadar hapis cezası ile cezalandırılır." },
    { code: "314/2", short_desc: "Silahlı Örgüt Üyeliği", full_text: "Bu kısmın dördüncü ve beşinci bölümlerinde yer alan suçları işlemek amacıyla kurulmuş olan silahlı örgüte üye olanlara beş yıldan on yıla kadar hapis cezası verilir. Örgüte üye olmamakla birlikte örgüt adına suç işleyen kişi de örgüt üyesi olarak cezalandırılır." },
    { code: "315", short_desc: "Silah Sağlama", full_text: "Yukarıdaki maddede tanımlanan örgütlere silah sağlayan kişi, on yıldan on beş yıla kadar hapis cezası ile cezalandırılır." },
    { code: "316", short_desc: "Suç İçin Anlaşma", full_text: "Bu kısmın dördüncü ve beşinci bölümlerinde yer alan suçlardan herhangi birinin işlenmesi için anlaşan kişiler, ilgili suça ilişkin cezanın üçte biri oranında cezalandırılır." },
    { code: "318", short_desc: "Halkı Askerlikten Soğutma", full_text: "Halkı askerlikten soğutacak etkinlikte teşvik veya telkinde bulunan veya propaganda yapan kimseye ceza verilir." },
    { code: "327", short_desc: "Devletin Güvenliğine İlişkin Belgeleri Temin Etme", full_text: "Devletin güvenliği veya iç veya dış siyasal yararları bakımından, niteliği itibarıyla gizli kalması gereken bilgileri veya belgeleri temin eden kimse cezalandırılır." },
    { code: "328", short_desc: "Siyasal veya Askeri Casusluk", full_text: "Devletin güvenliği veya iç veya dış siyasal yararları bakımından niteliği itibarıyla gizli kalması gereken bilgileri, siyasal veya askeri casusluk maksadıyla temin eden kimseye ağırlaştırılmış müebbet hapis cezası verilir." },
    { code: "334", short_desc: "Yasaklanan Bilgileri Açıklama", full_text: "Yetkili makamların kanun ve düzenleyici işlemlere göre açıklanmasını yasakladığı ve niteliği bakımından gizli kalması gereken bilgileri açıklayan kimseye ceza verilir." },
    { code: "339", short_desc: "Devlet Sırlarından Yararlanma", full_text: "Görevi veya sıfatı gereği vakıf olduğu Devlet sırlarından yararlanarak ekonomik çıkar sağlayan kimseye ceza verilir." },
    { code: "3713/5", short_desc: "Terörle Mücadele Kanunu Md. 5 – Terör Örgütü Üyeliği (Cezayı Ağırlaştırma)", full_text: "3713 sayılı Terörle Mücadele Kanunu'nun 5. maddesi uyarınca, terör suçlarından dolayı verilecek cezalar yarı oranında artırılır. Bu düzenleme, TCK kapsamındaki terör örgütü suçlarında cezanın ağırlaştırılmasını öngörmektedir." }
  ];

  for (const d of defs) {
    await run(
      "INSERT OR IGNORE INTO tck_definitions (code, short_desc, full_text) VALUES (?, ?, ?)",
      [d.code, d.short_desc, d.full_text]
    );
  }
}

function seedData() {
  const caseA = {
    id: nanoid(),
    title: "Beşiktaş Davası",
    summary: "Beşiktaş merkezli dosyada birden fazla sanığın aynı soruşturma kapsamında yargılandığı dava.",
    incident: "Beşiktaş Merkez Dosyası",
    dossier: "BJK-2024-142",
    date: "2024-01-15",
    status: "Kovuşturma (Devam Ediyor)",
    caseNumber: "2024/142",
    courtName: "İstanbul 14. Ağır Ceza Mahkemesi",
    judge: "",
    courtPanel: "",
    prosecutor: "",
    hearingCount: 3,
    startDate: "2024-01-15",
    lastHearingDate: "2024-05-20",
    tckArticles: [
      { code: "314/2", title: "Silahlı Örgüt Üyeliği" },
      { code: "299", title: "Cumhurbaşkanına Hakaret" },
      { code: "220/7", title: "Örgüte Yardım" }
    ],
    indictmentProsecutor: "Savcı [İsim]",
    trialProsecutor: "",
    judgeType: "panel",
    judgeName: "",
    panelPresident: "Hakim [İsim]",
    panelMembers: "Üye Hakim [İsim], Üye Hakim [İsim]",
    indictmentDate: "2023-11-20",
    acceptanceDate: "2024-01-15",
    verdictDate: ""
  };

  const people = [
    {
      id: nanoid(),
      name: "Mehmet Aydın",
      role: "Sanık",
      charge: "TCK 314/2, TCK 299",
      claim: "Örgütle bağım yok, paylaşımlar bağlamından koparıldı.",
      evidence: "WhatsApp mesajları; tanık beyanı.",
      photoUrl: "",
      tckArticles: ["314/2", "299"],
      accusations: ["Örgüt üyeliği", "Cumhurbaşkanına hakaret"],
      evidenceItems: [
        { type: "message", description: "WhatsApp mesajları", reference: "s.45" },
        { type: "witness", description: "Tanık ifadesi: Ahmet Y." }
      ],
      defense: ["Örgütle bağım yok", "Mesajlar bağlamından koparılmış"],
      relatedProfiles: [],
      hierarchy: { superiors: [], subordinates: [] },
      isExternal: false
    },
    {
      id: nanoid(),
      name: "Ayşe Baran",
      role: "Sanık",
      charge: "TCK 220/7",
      claim: "Yardım kastı yok, sosyal çevre nedeniyle tanıyorum.",
      evidence: "Banka kayıtları; iletişim trafiği.",
      photoUrl: "",
      tckArticles: ["220/7"],
      accusations: ["Örgüte yardım"],
      evidenceItems: [
        { type: "document", description: "Banka kayıtları", reference: "s.78" }
      ],
      defense: ["Yardım kastı yok"],
      relatedProfiles: [],
      hierarchy: { superiors: [], subordinates: [] },
      isExternal: false
    },
    {
      id: nanoid(),
      name: "Selim Koç",
      role: "Sanık",
      charge: "TCK 314/2",
      claim: "İddianamedeki isimler benzer, yanlış eşleşme var.",
      evidence: "Telefon HTS kayıtları.",
      photoUrl: "",
      tckArticles: ["314/2"],
      accusations: ["Örgüt üyeliği"],
      evidenceItems: [{ type: "document", description: "HTS kayıtları" }],
      defense: ["Yanlış eşleşme"],
      relatedProfiles: [],
      hierarchy: { superiors: ["Mehmet Aydın"], subordinates: [] },
      isExternal: false
    },
    {
      id: nanoid(),
      name: "Zeynep K.",
      role: "Tanık",
      charge: "Yok",
      claim: "Tanık beyanı sunuldu.",
      evidence: "Tanık beyanı.",
      photoUrl: "",
      tckArticles: [],
      accusations: [],
      evidenceItems: [{ type: "witness", description: "Tanık beyanı" }],
      defense: [],
      relatedProfiles: ["Mehmet Aydın"],
      hierarchy: { superiors: [], subordinates: [] },
      isExternal: true
    }
  ];

  people[0].relatedProfiles = [people[1].id, people[2].id];
  people[1].relatedProfiles = [people[0].id];
  people[2].relatedProfiles = [people[0].id];

  const casePeople = [
    { caseId: caseA.id, personId: people[0].id, relationship: "Ana sanık" },
    { caseId: caseA.id, personId: people[1].id, relationship: "Sanık" },
    { caseId: caseA.id, personId: people[2].id, relationship: "Sanık" },
    { caseId: caseA.id, personId: people[3].id, relationship: "Tanık" }
  ];

  return { cases: [caseA], people, casePeople };
}

async function ensureColumn(table, column, type) {
  const columns = await all(`PRAGMA table_info(${table})`);
  if (columns.some((col) => col.name === column)) return;
  await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

async function createCase(payload) {
  const id = nanoid();
  const record = {
    id,
    title: payload.title,
    summary: payload.summary || "",
    incident: payload.incident || "",
    dossier: payload.dossier || "",
    date: payload.date || "",
    status: payload.status || "",
    case_number: payload.case_number || payload.caseNumber || "",
    court_name: payload.court_name || payload.courtName || "",
    judge: payload.judge || "",
    court_panel: payload.court_panel || payload.courtPanel || "",
    prosecutor: payload.prosecutor || "",
    hearing_count: Number(payload.hearing_count || payload.hearingCount || 0),
    start_date: payload.start_date || payload.startDate || "",
    last_hearing_date: payload.last_hearing_date || payload.lastHearingDate || "",
    tck_articles: payload.tck_articles || payload.tckArticles || [],
    indictment_prosecutor: payload.indictment_prosecutor || payload.indictmentProsecutor || "",
    trial_prosecutor: payload.trial_prosecutor || payload.trialProsecutor || "",
    judge_type: payload.judge_type || payload.judgeType || "single",
    judge_name: payload.judge_name || payload.judgeName || "",
    panel_president: payload.panel_president || payload.panelPresident || "",
    panel_members: payload.panel_members || payload.panelMembers || "",
    indictment_date: payload.indictment_date || payload.indictmentDate || "",
    acceptance_date: payload.acceptance_date || payload.acceptanceDate || "",
    verdict_date: payload.verdict_date || payload.verdictDate || ""
  };

  await run(
    `INSERT INTO cases
      (id, title, summary, incident, dossier, date, status, case_number, court_name, judge, court_panel, prosecutor, hearing_count, start_date, last_hearing_date, tck_articles, indictment_prosecutor, trial_prosecutor, judge_type, judge_name, panel_president, panel_members, indictment_date, acceptance_date, verdict_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.title,
      record.summary,
      record.incident,
      record.dossier,
      record.date,
      record.status,
      record.case_number,
      record.court_name,
      record.judge,
      record.court_panel,
      record.prosecutor,
      record.hearing_count,
      record.start_date,
      record.last_hearing_date,
      JSON.stringify(record.tck_articles),
      record.indictment_prosecutor,
      record.trial_prosecutor,
      record.judge_type,
      record.judge_name,
      record.panel_president,
      record.panel_members,
      record.indictment_date,
      record.acceptance_date,
      record.verdict_date
    ]
  );

  return record;
}

async function updateCase(id, payload) {
  const existing = await get("SELECT * FROM cases WHERE id = ?", [id]);
  if (!existing) return null;

  const b = payload;
  await run(
    `UPDATE cases SET
      title = ?, summary = ?, incident = ?, dossier = ?, date = ?, status = ?,
      case_number = ?, court_name = ?, judge = ?, court_panel = ?, prosecutor = ?,
      hearing_count = ?, start_date = ?, last_hearing_date = ?, tck_articles = ?,
      indictment_prosecutor = ?, trial_prosecutor = ?, judge_type = ?, judge_name = ?,
      panel_president = ?, panel_members = ?, indictment_date = ?, acceptance_date = ?, verdict_date = ?
     WHERE id = ?`,
    [
      b.title ?? existing.title,
      b.summary ?? existing.summary,
      b.incident ?? existing.incident,
      b.dossier ?? existing.dossier,
      b.date ?? existing.date,
      b.status ?? existing.status,
      b.case_number ?? existing.case_number,
      b.court_name ?? existing.court_name,
      b.judge ?? existing.judge,
      b.court_panel ?? existing.court_panel,
      b.prosecutor ?? existing.prosecutor,
      b.hearing_count ?? existing.hearing_count,
      b.start_date ?? existing.start_date,
      b.last_hearing_date ?? existing.last_hearing_date,
      b.tck_articles ? JSON.stringify(b.tck_articles) : existing.tck_articles,
      b.indictment_prosecutor ?? existing.indictment_prosecutor,
      b.trial_prosecutor ?? existing.trial_prosecutor,
      b.judge_type ?? existing.judge_type,
      b.judge_name ?? existing.judge_name,
      b.panel_president ?? existing.panel_president,
      b.panel_members ?? existing.panel_members,
      b.indictment_date ?? existing.indictment_date,
      b.acceptance_date ?? existing.acceptance_date,
      b.verdict_date ?? existing.verdict_date,
      id
    ]
  );

  return await get("SELECT * FROM cases WHERE id = ?", [id]);
}

async function createPerson(payload) {
  const id = nanoid();
  const record = {
    id,
    name: payload.name,
    role: payload.role || "",
    charge: payload.charge || "",
    claim: payload.claim || "",
    evidence: payload.evidence || "",
    photo_url: payload.photo_url || payload.photoUrl || "",
    tck_articles: payload.tck_articles || payload.tckArticles || [],
    accusations: payload.accusations || [],
    evidence_items: payload.evidence_items || payload.evidenceItems || [],
    defense: payload.defense || [],
    related_profiles: payload.related_profiles || payload.relatedProfiles || [],
    hierarchy: payload.hierarchy || {},
    is_external: payload.is_external ? 1 : 0,
    organization: payload.organization || "",
    title: payload.title || "",
    sentence_demand: payload.sentence_demand || payload.sentenceDemand || "",
    action_numbers: payload.action_numbers || payload.actionNumbers || []
  };

  await run(
    `INSERT INTO people
      (id, name, role, charge, claim, evidence, photo_url, tck_articles, accusations, evidence_items, defense, related_profiles, hierarchy, is_external, organization, title, sentence_demand, action_numbers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.name,
      record.role,
      record.charge,
      record.claim,
      record.evidence,
      record.photo_url,
      JSON.stringify(record.tck_articles),
      JSON.stringify(record.accusations),
      JSON.stringify(record.evidence_items),
      JSON.stringify(record.defense),
      JSON.stringify(record.related_profiles),
      JSON.stringify(record.hierarchy),
      record.is_external,
      record.organization,
      record.title,
      record.sentence_demand,
      JSON.stringify(record.action_numbers)
    ]
  );

  return record;
}

async function linkPerson(caseId, personId, relationship = "") {
  await run(
    "INSERT OR REPLACE INTO case_people (case_id, person_id, relationship) VALUES (?, ?, ?)",
    [caseId, personId, relationship]
  );
}

async function createAction(payload) {
  const id = nanoid();
  const record = {
    id,
    case_id: payload.case_id || payload.caseId || "",
    person_id: payload.person_id || payload.personId || "",
    action_num: payload.action_num || payload.actionNum || "",
    title: payload.title || "",
    claim: payload.claim || "",
    evidence: payload.evidence || "",
    defense: payload.defense || "",
    tck_codes: payload.tck_codes || payload.tckCodes || [],
    sentence_demand: payload.sentence_demand || payload.sentenceDemand || "",
    mentioned_names: payload.mentioned_names || payload.mentionedNames || []
  };

  await run(
    `INSERT INTO actions (id, case_id, person_id, action_num, title, claim, evidence, defense, tck_codes, sentence_demand, mentioned_names)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.case_id,
      record.person_id,
      record.action_num,
      record.title,
      record.claim,
      record.evidence,
      record.defense,
      JSON.stringify(record.tck_codes),
      record.sentence_demand,
      JSON.stringify(record.mentioned_names)
    ]
  );

  return record;
}

async function createIndictment(payload) {
  const id = nanoid();
  const record = {
    id,
    case_id: payload.case_id || payload.caseId || "",
    summary: payload.summary || "",
    created_at: new Date().toISOString()
  };
  await run(
    "INSERT INTO indictments (id, case_id, summary, created_at) VALUES (?, ?, ?, ?)",
    [record.id, record.case_id, record.summary, record.created_at]
  );
  return record;
}

async function updateIndictment(id, payload) {
  const existing = await get("SELECT * FROM indictments WHERE id = ?", [id]);
  if (!existing) return null;
  await run(
    "UPDATE indictments SET summary = ?, case_id = ? WHERE id = ?",
    [payload.summary ?? existing.summary, payload.case_id ?? existing.case_id, id]
  );
  return await get("SELECT * FROM indictments WHERE id = ?", [id]);
}

async function createIndictmentAction(payload) {
  const id = nanoid();
  const record = {
    id,
    indictment_id: payload.indictment_id || payload.indictmentId || "",
    action_num: payload.action_num || payload.actionNum || "",
    title: payload.title || "",
    tck_codes: payload.tck_codes || payload.tckCodes || [],
    evidence: payload.evidence || ""
  };
  await run(
    "INSERT INTO indictment_actions (id, indictment_id, action_num, title, tck_codes, evidence) VALUES (?, ?, ?, ?, ?, ?)",
    [record.id, record.indictment_id, record.action_num, record.title, JSON.stringify(record.tck_codes), record.evidence]
  );
  return record;
}

async function createOfficial(payload) {
  const name = (payload.name || "").trim();
  const role = (payload.role || "").trim();
  const institution = (payload.institution || "").trim();
  const existing = await get(
    "SELECT * FROM officials WHERE name = ? AND role = ?",
    [name, role]
  );
  if (existing) {
    if (institution && institution !== existing.institution) {
      await run("UPDATE officials SET institution = ? WHERE id = ?", [institution, existing.id]);
      existing.institution = institution;
    }
    return existing;
  }
  const id = nanoid();
  const record = { id, name, role, institution };
  await run(
    "INSERT INTO officials (id, name, role, institution) VALUES (?, ?, ?, ?)",
    [record.id, record.name, record.role, record.institution]
  );
  return record;
}

async function linkOfficial(caseId, officialId, roleInCase) {
  await run(
    "INSERT OR REPLACE INTO case_officials (case_id, official_id, role_in_case) VALUES (?, ?, ?)",
    [caseId, officialId, roleInCase || ""]
  );
}

export { db, run, get, all, init, createCase, updateCase, createPerson, linkPerson, createAction, createIndictment, updateIndictment, createIndictmentAction, createOfficial, linkOfficial };
