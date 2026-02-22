import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { all, get, run, init, createCase, updateCase, createPerson, linkPerson, createAction, createOfficial, linkOfficial, upsertEylemSummary, getEylemSummaries } from "./db.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));

const AUTH_COOKIE = "cc_admin";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin135";
const AUTH_SECRET = process.env.AUTH_SECRET || "change-this-secret";

function parseCookies(header) {
  if (!header) return {};
  return header.split(";").reduce((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
}

function signToken(value) {
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(value)
    .digest("hex");
  return `${value}.${signature}`;
}

function verifyToken(token) {
  if (!token) return false;
  const [value, signature] = token.split(".");
  if (!value || !signature) return false;
  const expected = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(value)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function isAuthed(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return verifyToken(cookies[AUTH_COOKIE]);
}

function requireAuthApi(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "Unauthorized" });
}

function requireAuthPage(req, res, next) {
  const publicAdmin = new Set(["/login.html", "/login.js", "/admin.css"]);
  if (publicAdmin.has(req.path)) return next();
  if (isAuthed(req)) return next();
  res.redirect("/admin/login.html");
}

function parseJsonField(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username !== ADMIN_USER || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = signToken("admin");
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`
  );
  res.json({ ok: true });
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
  res.json({ ok: true });
});

app.get("/api/me", (req, res) => {
  res.json({ authed: isAuthed(req) });
});

app.get("/api/cases", async (req, res) => {
  try {
    const rows = await all(
      `SELECT c.*,
              SUM(CASE WHEN p.is_external IS NULL OR p.is_external = 0 THEN 1 ELSE 0 END) as defendantCount
       FROM cases c
       LEFT JOIN case_people cp ON cp.case_id = c.id
       LEFT JOIN people p ON p.id = cp.person_id
       GROUP BY c.id
       ORDER BY date DESC, title ASC`
    );
    const mapped = rows.map((row) => ({
      ...row,
      tck_articles: parseJsonField(row.tck_articles, []),
      timeline_data: parseJsonField(row.timeline_data, { enabled: false, transitionYear: 2016, events: [] }),
      hearing_count: row.hearing_count || 0
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Failed to load cases." });
  }
});

app.get("/api/cases/:id", async (req, res) => {
  try {
    const caseRow = await get("SELECT * FROM cases WHERE id = ?", [req.params.id]);
    if (!caseRow) return res.status(404).json({ error: "Case not found." });

    const people = await all(
      `SELECT p.*, cp.relationship
       FROM case_people cp
       JOIN people p ON p.id = cp.person_id
       WHERE cp.case_id = ?
       ORDER BY p.name ASC`,
      [req.params.id]
    );

    const mappedPeople = people.map((person) => ({
      ...person,
      tck_articles: parseJsonField(person.tck_articles, []),
      accusations: parseJsonField(person.accusations, []),
      evidence_items: parseJsonField(person.evidence_items, []),
      defense: parseJsonField(person.defense, []),
      related_profiles: parseJsonField(person.related_profiles, []),
      hierarchy: parseJsonField(person.hierarchy, {}),
      action_numbers: parseJsonField(person.action_numbers, []),
      is_external: !!person.is_external
    }));

    const actions = await all(
      "SELECT * FROM actions WHERE case_id = ? ORDER BY action_num ASC",
      [req.params.id]
    );
    const mappedActions = actions.map((a) => ({
      ...a,
      tck_codes: parseJsonField(a.tck_codes, []),
      mentioned_names: parseJsonField(a.mentioned_names, [])
    }));

    res.json({
      ...caseRow,
      tck_articles: parseJsonField(caseRow.tck_articles, []),
      timeline_data: parseJsonField(caseRow.timeline_data, { enabled: false, transitionYear: 2016, events: [] }),
      hearing_count: caseRow.hearing_count || 0,
      people: mappedPeople,
      actions: mappedActions
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load case." });
  }
});

app.get("/api/people", async (req, res) => {
  try {
    const rows = await all("SELECT * FROM people ORDER BY name ASC");
    const mapped = rows.map((person) => ({
      ...person,
      tck_articles: parseJsonField(person.tck_articles, []),
      accusations: parseJsonField(person.accusations, []),
      evidence_items: parseJsonField(person.evidence_items, []),
      defense: parseJsonField(person.defense, []),
      related_profiles: parseJsonField(person.related_profiles, []),
      hierarchy: parseJsonField(person.hierarchy, {}),
      action_numbers: parseJsonField(person.action_numbers, []),
      is_external: !!person.is_external
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Failed to load people." });
  }
});

app.post("/api/people/find-or-create", requireAuthApi, async (req, res) => {
  try {
    const { name, role, caseId } = req.body;
    if (!name) return res.status(400).json({ error: "İsim gerekli." });
    const existing = await get("SELECT * FROM people WHERE LOWER(name) = LOWER(?)", [name.trim()]);
    if (existing) {
      if (caseId) {
        await run("INSERT OR REPLACE INTO case_people (case_id, person_id, relationship) VALUES (?, ?, '')", [caseId, existing.id]);
      }
      res.json({ ...existing, tck_articles: parseJsonField(existing.tck_articles, []), action_numbers: parseJsonField(existing.action_numbers, []), created: false });
    } else {
      const person = await createPerson({ name: name.trim(), role: role || "unknown" });
      if (caseId) {
        await linkPerson(caseId, person.id);
      }
      res.status(201).json({ ...person, created: true });
    }
  } catch (err) {
    res.status(500).json({ error: "Kişi oluşturulamadı." });
  }
});

app.post("/api/cases", requireAuthApi, async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: "Title is required." });
    const record = await createCase(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Failed to create case." });
  }
});

app.put("/api/cases/:id", requireAuthApi, async (req, res) => {
  try {
    const updated = await updateCase(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Case not found." });
    res.json({
      ...updated,
      tck_articles: parseJsonField(updated.tck_articles, []),
      timeline_data: parseJsonField(updated.timeline_data, { enabled: false, transitionYear: 2016, events: [] })
    });
  } catch (err) {
    res.status(500).json({ error: "Dava güncellenemedi." });
  }
});

app.post("/api/people", requireAuthApi, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: "Name is required." });
    const record = await createPerson(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Failed to create person." });
  }
});

app.put("/api/people/:id", requireAuthApi, async (req, res) => {
  try {
    const existing = await get("SELECT * FROM people WHERE id = ?", [req.params.id]);
    if (!existing) return res.status(404).json({ error: "Person not found." });

    const b = req.body;
    await run(
      `UPDATE people SET
        name = ?, role = ?, charge = ?, claim = ?, evidence = ?, photo_url = ?,
        tck_articles = ?, accusations = ?, evidence_items = ?, defense = ?,
        related_profiles = ?, hierarchy = ?, is_external = ?,
        organization = ?, title = ?, sentence_demand = ?, action_numbers = ?
       WHERE id = ?`,
      [
        b.name ?? existing.name,
        b.role ?? existing.role,
        b.charge ?? existing.charge,
        b.claim ?? existing.claim,
        b.evidence ?? existing.evidence,
        b.photo_url ?? existing.photo_url,
        JSON.stringify(b.tck_articles ?? parseJsonField(existing.tck_articles, [])),
        JSON.stringify(b.accusations ?? parseJsonField(existing.accusations, [])),
        JSON.stringify(b.evidence_items ?? parseJsonField(existing.evidence_items, [])),
        JSON.stringify(b.defense ?? parseJsonField(existing.defense, [])),
        JSON.stringify(b.related_profiles ?? parseJsonField(existing.related_profiles, [])),
        JSON.stringify(b.hierarchy ?? parseJsonField(existing.hierarchy, {})),
        b.is_external ?? existing.is_external,
        b.organization ?? existing.organization,
        b.title ?? existing.title,
        b.sentence_demand ?? existing.sentence_demand,
        JSON.stringify(b.action_numbers ?? parseJsonField(existing.action_numbers, [])),
        req.params.id
      ]
    );

    const updated = await get("SELECT * FROM people WHERE id = ?", [req.params.id]);
    res.json({
      ...updated,
      tck_articles: parseJsonField(updated.tck_articles, []),
      action_numbers: parseJsonField(updated.action_numbers, []),
      accusations: parseJsonField(updated.accusations, []),
      evidence_items: parseJsonField(updated.evidence_items, []),
      defense: parseJsonField(updated.defense, []),
      related_profiles: parseJsonField(updated.related_profiles, []),
      hierarchy: parseJsonField(updated.hierarchy, {})
    });
  } catch (err) {
    res.status(500).json({ error: "Profil güncellenemedi." });
  }
});

app.post("/api/case-people", requireAuthApi, async (req, res) => {
  try {
    const { caseId, personId, relationship } = req.body;
    if (!caseId || !personId) {
      return res.status(400).json({ error: "caseId and personId are required." });
    }
    await linkPerson(caseId, personId, relationship || "");
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to link person." });
  }
});

app.post("/api/actions", requireAuthApi, async (req, res) => {
  try {
    const record = await createAction(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Eylem kaydedilemedi." });
  }
});

app.delete("/api/actions", requireAuthApi, async (req, res) => {
  try {
    const { caseId, personId } = req.query;
    if (caseId && personId) {
      await run("DELETE FROM actions WHERE case_id = ? AND person_id = ?", [caseId, personId]);
    } else if (personId) {
      await run("DELETE FROM actions WHERE person_id = ?", [personId]);
    } else {
      return res.status(400).json({ error: "personId gerekli." });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Eylemler silinemedi." });
  }
});

app.get("/api/actions", async (req, res) => {
  try {
    let rows;
    if (req.query.caseId && req.query.personId) {
      rows = await all(
        "SELECT * FROM actions WHERE case_id = ? AND person_id = ? ORDER BY action_num ASC",
        [req.query.caseId, req.query.personId]
      );
    } else if (req.query.caseId) {
      rows = await all(
        "SELECT * FROM actions WHERE case_id = ? ORDER BY action_num ASC",
        [req.query.caseId]
      );
    } else if (req.query.personId) {
      rows = await all(
        "SELECT * FROM actions WHERE person_id = ? ORDER BY action_num ASC",
        [req.query.personId]
      );
    } else {
      rows = await all("SELECT * FROM actions ORDER BY action_num ASC");
    }
    const mapped = rows.map((r) => ({
      ...r,
      tck_codes: parseJsonField(r.tck_codes, []),
      mentioned_names: parseJsonField(r.mentioned_names, [])
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Eylemler yüklenemedi." });
  }
});

app.get("/api/eylem-summaries", async (req, res) => {
  try {
    const { caseId } = req.query;
    if (!caseId) return res.status(400).json({ error: "caseId gerekli." });
    const rows = await getEylemSummaries(caseId);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Eylem özetleri yüklenemedi." });
  }
});

app.post("/api/eylem-summaries", requireAuthApi, async (req, res) => {
  try {
    const { caseId, eylemNum, summary } = req.body;
    if (!caseId || !eylemNum) return res.status(400).json({ error: "caseId ve eylemNum gerekli." });
    const record = await upsertEylemSummary(caseId, eylemNum, summary || "");
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Eylem özeti kaydedilemedi." });
  }
});

app.post("/api/eylem-summaries/bulk", requireAuthApi, async (req, res) => {
  try {
    const { caseId, summaries } = req.body;
    if (!caseId || !Array.isArray(summaries)) return res.status(400).json({ error: "caseId ve summaries dizisi gerekli." });
    const results = [];
    for (const s of summaries) {
      const record = await upsertEylemSummary(caseId, s.eylemNum, s.summary || "");
      results.push(record);
    }
    res.status(201).json(results);
  } catch (err) {
    res.status(500).json({ error: "Eylem özetleri kaydedilemedi." });
  }
});

app.get("/api/graph", async (req, res) => {
  try {
    const scope = req.query.scope || "all";
    const caseId = req.query.caseId || "";
    const incident = req.query.incident || "";
    const dossier = req.query.dossier || "";

    const people = await all("SELECT * FROM people ORDER BY name ASC");
    const casePeople = await all(
      `SELECT cp.person_id, cp.case_id, c.incident, c.dossier
       FROM case_people cp
       JOIN cases c ON c.id = cp.case_id`
    );

    const peopleById = new Map(people.map((p) => [p.id, p]));

    const groups = {
      case: new Map(),
      incident: new Map(),
      dossier: new Map()
    };

    for (const row of casePeople) {
      if (!groups.case.has(row.case_id)) groups.case.set(row.case_id, new Set());
      groups.case.get(row.case_id).add(row.person_id);

      if (row.incident) {
        if (!groups.incident.has(row.incident)) groups.incident.set(row.incident, new Set());
        groups.incident.get(row.incident).add(row.person_id);
      }

      if (row.dossier) {
        if (!groups.dossier.has(row.dossier)) groups.dossier.set(row.dossier, new Set());
        groups.dossier.get(row.dossier).add(row.person_id);
      }
    }

    const nodes = people.map((p) => ({
      id: p.id,
      label: p.name,
      title: p.role || "",
      group: p.role || "Unassigned",
      image: p.photo_url || ""
    }));

    const edges = [];
    const edgeSet = new Set();

    function addEdge(a, b, label) {
      const key = [a, b, label].sort().join("|");
      if (edgeSet.has(key) || a === b) return;
      edgeSet.add(key);
      edges.push({ from: a, to: b, label });
    }

    function connectGroup(set, label) {
      const ids = Array.from(set);
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          addEdge(ids[i], ids[j], label);
        }
      }
    }

    if (scope === "case" && caseId && groups.case.has(caseId)) {
      connectGroup(groups.case.get(caseId), "Same case");
    } else if (scope === "incident" && incident && groups.incident.has(incident)) {
      connectGroup(groups.incident.get(incident), "Same incident");
    } else if (scope === "dossier" && dossier && groups.dossier.has(dossier)) {
      connectGroup(groups.dossier.get(dossier), "Same dossier");
    } else {
      for (const set of groups.case.values()) connectGroup(set, "Same case");
      for (const set of groups.incident.values()) connectGroup(set, "Same incident");
      for (const set of groups.dossier.values()) connectGroup(set, "Same dossier");
    }

    const filteredNodes =
      edges.length === 0
        ? nodes
        : nodes.filter((node) => {
            return edges.some((edge) => edge.from === node.id || edge.to === node.id);
          });

    res.json({ nodes: filteredNodes, edges });
  } catch (err) {
    res.status(500).json({ error: "Failed to build graph." });
  }
});

app.get("/api/tck-summary", async (req, res) => {
  try {
    const actions = await all("SELECT * FROM actions ORDER BY action_num ASC");
    const people = await all("SELECT * FROM people ORDER BY name ASC");
    const casePeople = await all("SELECT * FROM case_people");
    const cases = await all("SELECT id, title FROM cases");

    const caseMap = new Map(cases.map(c => [c.id, c.title]));
    const personMap = new Map(people.map(p => [p.id, p]));

    const personCases = new Map();
    for (const cp of casePeople) {
      if (!personCases.has(cp.person_id)) personCases.set(cp.person_id, new Set());
      personCases.get(cp.person_id).add(cp.case_id);
    }

    const tckData = new Map();

    for (const action of actions) {
      const codes = parseJsonField(action.tck_codes, []);
      for (const code of codes) {
        if (!code) continue;
        const normalized = String(code).trim();
        if (!tckData.has(normalized)) {
          tckData.set(normalized, { article: normalized, profiles: [] });
        }
        const person = personMap.get(action.person_id);
        if (!person) continue;

        const caseIds = personCases.get(action.person_id);
        const actionCaseTitle = caseMap.get(action.case_id) || (caseIds ? caseMap.get([...caseIds][0]) || "" : "");
        const actionCaseId = action.case_id || (caseIds ? [...caseIds][0] || "" : "");

        tckData.get(normalized).profiles.push({
          personId: person.id,
          name: person.name,
          role: person.role,
          organization: person.organization,
          actionNum: action.action_num,
          actionTitle: action.title,
          claim: action.claim,
          evidence: action.evidence,
          defense: action.defense,
          sentenceDemand: action.sentence_demand || person.sentence_demand,
          caseId: actionCaseId,
          caseTitle: actionCaseTitle
        });
      }
    }

    for (const person of people) {
      const articles = parseJsonField(person.tck_articles, []);
      for (const code of articles) {
        if (!code) continue;
        const normalized = String(code).trim();
        if (!tckData.has(normalized)) {
          tckData.set(normalized, { article: normalized, profiles: [] });
        }
        const existing = tckData.get(normalized).profiles;
        if (existing.some(p => p.personId === person.id)) continue;

        const caseIds = personCases.get(person.id);
        const caseTitle = caseIds ? caseMap.get([...caseIds][0]) || "" : "";
        const caseId = caseIds ? [...caseIds][0] || "" : "";

        existing.push({
          personId: person.id,
          name: person.name,
          role: person.role,
          organization: person.organization,
          actionNum: null,
          actionTitle: null,
          claim: person.charge,
          evidence: person.evidence,
          defense: null,
          sentenceDemand: person.sentence_demand,
          caseId,
          caseTitle
        });
      }
    }

    const result = Array.from(tckData.values()).sort((a, b) => {
      const na = parseInt(a.article) || 0;
      const nb = parseInt(b.article) || 0;
      return na - nb || a.article.localeCompare(b.article);
    });

    res.json(result);
  } catch (err) {
    console.error("TCK summary error:", err);
    res.status(500).json({ error: "TCK verileri yüklenemedi." });
  }
});

app.get("/api/tck-definitions", async (req, res) => {
  try {
    const rows = await all("SELECT code, short_desc, full_text FROM tck_definitions ORDER BY code ASC");
    res.json(rows);
  } catch (err) {
    console.error("TCK definitions error:", err);
    res.status(500).json({ error: "TCK tanımları yüklenemedi." });
  }
});

app.put("/api/tck-definitions/:code", requireAuthApi, async (req, res) => {
  try {
    const { code } = req.params;
    const { short_desc, full_text } = req.body || {};
    const existing = await get("SELECT code FROM tck_definitions WHERE code = ?", [code]);
    if (existing) {
      await run(
        "UPDATE tck_definitions SET short_desc = ?, full_text = ? WHERE code = ?",
        [short_desc || "", full_text || "", code]
      );
    } else {
      await run(
        "INSERT INTO tck_definitions (code, short_desc, full_text) VALUES (?, ?, ?)",
        [code, short_desc || "", full_text || ""]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("TCK definition update error:", err);
    res.status(500).json({ error: "TCK tanımı güncellenemedi." });
  }
});

app.post("/api/tck-definitions", requireAuthApi, async (req, res) => {
  try {
    const { code, short_desc, full_text } = req.body || {};
    if (!code) return res.status(400).json({ error: "Madde kodu gerekli." });
    const existing = await get("SELECT code FROM tck_definitions WHERE code = ?", [code]);
    if (existing) {
      return res.status(409).json({ error: "Bu madde zaten mevcut." });
    }
    await run(
      "INSERT INTO tck_definitions (code, short_desc, full_text) VALUES (?, ?, ?)",
      [code, short_desc || "", full_text || ""]
    );
    res.json({ ok: true, code });
  } catch (err) {
    console.error("TCK definition create error:", err);
    res.status(500).json({ error: "TCK tanımı oluşturulamadı." });
  }
});

app.delete("/api/tck-definitions/:code", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM tck_definitions WHERE code = ?", [req.params.code]);
    res.json({ ok: true });
  } catch (err) {
    console.error("TCK definition delete error:", err);
    res.status(500).json({ error: "TCK tanımı silinemedi." });
  }
});

// ── Officials ──

app.get("/api/officials", async (req, res) => {
  try {
    let rows;
    if (req.query.role) {
      rows = await all("SELECT * FROM officials WHERE role = ? ORDER BY name ASC", [req.query.role]);
    } else {
      rows = await all("SELECT * FROM officials ORDER BY name ASC");
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Görevliler yüklenemedi." });
  }
});

app.get("/api/officials/:id", async (req, res) => {
  try {
    const official = await get("SELECT * FROM officials WHERE id = ?", [req.params.id]);
    if (!official) return res.status(404).json({ error: "Görevli bulunamadı." });
    const caseLinks = await all(
      `SELECT co.role_in_case, c.id, c.title, c.case_number, c.status
       FROM case_officials co
       JOIN cases c ON c.id = co.case_id
       WHERE co.official_id = ?
       ORDER BY c.title ASC`,
      [req.params.id]
    );
    official.cases = caseLinks;
    res.json(official);
  } catch (err) {
    res.status(500).json({ error: "Görevli yüklenemedi." });
  }
});

app.post("/api/officials", requireAuthApi, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ error: "İsim gerekli." });
    const record = await createOfficial(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Görevli kaydedilemedi." });
  }
});

app.post("/api/case-officials", requireAuthApi, async (req, res) => {
  try {
    const { caseId, officialId, roleInCase } = req.body;
    if (!caseId || !officialId) return res.status(400).json({ error: "caseId ve officialId gerekli." });
    await linkOfficial(caseId, officialId, roleInCase || "");
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Görevli bağlanamadı." });
  }
});

app.get("/admin", (req, res) => {
  if (!isAuthed(req)) return res.redirect("/admin/login.html");
  res.redirect("/admin/index.html");
});

app.use("/admin", requireAuthPage, express.static(path.join(__dirname, "public", "admin")));

app.delete("/api/cases/:id", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM case_officials WHERE case_id = ?", [req.params.id]);
    await run("DELETE FROM actions WHERE case_id = ?", [req.params.id]);
    await run("DELETE FROM case_people WHERE case_id = ?", [req.params.id]);
    await run("DELETE FROM cases WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Dava silinemedi." });
  }
});

app.delete("/api/people/:id", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM actions WHERE person_id = ?", [req.params.id]);
    await run("DELETE FROM case_people WHERE person_id = ?", [req.params.id]);
    await run("DELETE FROM people WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Kişi silinemedi." });
  }
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
}));

const port = process.env.PORT || 5000;

init()
  .then(() => {
    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to init database", err);
    process.exit(1);
  });
