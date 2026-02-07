const caseForm = document.getElementById("case-form");
const personForm = document.getElementById("person-form");
const linkForm = document.getElementById("link-form");
const caseStatus = document.getElementById("case-status");
const personStatus = document.getElementById("person-status");
const linkStatus = document.getElementById("link-status");
const caseList = document.getElementById("case-list");
const personList = document.getElementById("person-list");
const caseSelect = document.getElementById("person-case");
const linkCase = document.getElementById("link-case");
const linkPerson = document.getElementById("link-person");
const logoutBtn = document.getElementById("logout");
const relatedProfiles = document.getElementById("related-profiles");
const superiors = document.getElementById("superiors");
const subordinates = document.getElementById("subordinates");

let cases = [];
let people = [];

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function fillSelect(select, items, labelKey = "title") {
  select.innerHTML = "";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item[labelKey];
    select.appendChild(option);
  }
}

function fillMultiSelect(select, items) {
  select.innerHTML = "";
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
  }
}

function parseLines(value) {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseEvidence(value) {
  return parseLines(value).map((line) => {
    const [type, description, reference] = line.split("|").map((part) => part.trim());
    return {
      type: type || "document",
      description: description || line,
      reference: reference || ""
    };
  });
}

function renderLists() {
  caseList.innerHTML = "";
  personList.innerHTML = "";

  for (const c of cases) {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${c.title}</strong><br /><span class="muted">${c.status || "Status unset"}</span>`;
    caseList.appendChild(div);
  }

  for (const p of people) {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `<strong>${p.name}</strong><br /><span class="muted">${p.role || "Role unset"}</span>`;
    personList.appendChild(div);
  }
}

async function loadData() {
  cases = await fetchJSON("/api/cases");
  people = await fetchJSON("/api/people");
  fillSelect(caseSelect, cases, "title");
  fillSelect(linkCase, cases, "title");
  fillSelect(linkPerson, people, "name");
  fillMultiSelect(relatedProfiles, people);
  fillMultiSelect(superiors, people);
  fillMultiSelect(subordinates, people);
  renderLists();
}

caseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  caseStatus.textContent = "";

  const payload = Object.fromEntries(new FormData(caseForm).entries());
  payload.tck_articles = parseLines(payload.tck_articles).map((line) => {
    const [code, title] = line.split("|").map((part) => part.trim());
    return { code, title: title || "" };
  });

  try {
    await fetchJSON("/api/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    caseForm.reset();
    caseStatus.textContent = "Case saved.";
    await loadData();
  } catch (err) {
    caseStatus.textContent = err.message;
  }
});

personForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  personStatus.textContent = "";

  const formData = new FormData(personForm);
  const payload = Object.fromEntries(formData.entries());
  const relationship = payload.relationship;
  const caseId = payload.caseId;
  const related = Array.from(relatedProfiles.selectedOptions).map((opt) => opt.value);
  const sup = Array.from(superiors.selectedOptions).map((opt) => opt.value);
  const sub = Array.from(subordinates.selectedOptions).map((opt) => opt.value);

  payload.tck_articles = payload.tck_articles
    ? payload.tck_articles.split(",").map((item) => item.trim()).filter(Boolean)
    : [];
  payload.accusations = parseLines(payload.accusations);
  payload.defense = parseLines(payload.defense);
  payload.evidence_items = parseEvidence(payload.evidence_items);
  payload.related_profiles = related;
  payload.hierarchy = { superiors: sup, subordinates: sub };
  payload.is_external = payload.is_external ? 1 : 0;

  delete payload.relationship;
  delete payload.caseId;

  try {
    const person = await fetchJSON("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (caseId) {
      await fetchJSON("/api/case-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, personId: person.id, relationship })
      });
    }

    personForm.reset();
    personStatus.textContent = "Person saved.";
    await loadData();
  } catch (err) {
    personStatus.textContent = err.message;
  }
});

linkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  linkStatus.textContent = "";

  const payload = Object.fromEntries(new FormData(linkForm).entries());

  try {
    await fetchJSON("/api/case-people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    linkForm.reset();
    linkStatus.textContent = "Link created.";
    await loadData();
  } catch (err) {
    linkStatus.textContent = err.message;
  }
});

logoutBtn.addEventListener("click", async () => {
  await fetchJSON("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/admin/login.html";
});

loadData();
