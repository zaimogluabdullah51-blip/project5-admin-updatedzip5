import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { all, get, run, init, createCase, createPerson, linkPerson, createAction } from "./db.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "1mb" }));

const AUTH_COOKIE = "cc_admin";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
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

    res.json({
      ...caseRow,
      tck_articles: parseJsonField(caseRow.tck_articles, []),
      hearing_count: caseRow.hearing_count || 0,
      people: mappedPeople
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

app.post("/api/cases", requireAuthApi, async (req, res) => {
  try {
    if (!req.body.title) return res.status(400).json({ error: "Title is required." });
    const record = await createCase(req.body);
    res.status(201).json(record);
  } catch (err) {
    res.status(500).json({ error: "Failed to create case." });
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
      tck_codes: parseJsonField(r.tck_codes, [])
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: "Eylemler yüklenemedi." });
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

app.get("/admin", (req, res) => {
  if (!isAuthed(req)) return res.redirect("/admin/login.html");
  res.redirect("/admin/index.html");
});

app.use("/admin", requireAuthPage, express.static(path.join(__dirname, "public", "admin")));

app.delete("/api/cases/:id", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM case_people WHERE case_id = ?", [req.params.id]);
    await run("DELETE FROM cases WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Dava silinemedi." });
  }
});

app.delete("/api/people/:id", requireAuthApi, async (req, res) => {
  try {
    await run("DELETE FROM case_people WHERE person_id = ?", [req.params.id]);
    await run("DELETE FROM people WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Kişi silinemedi." });
  }
});

app.use(express.static(path.join(__dirname, "public")));

const port = process.env.PORT || 5000;

init()
  .then(() => {
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to init database", err);
    process.exit(1);
  });
