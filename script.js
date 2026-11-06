// Two Names prototype

const NOW = new Date().getFullYear();
const STORE_KEY = "twoNamesSubmissions";

const COLORS = {
  parents: "#3366aa",
  grandparents: "#7a4fa0",
  self: "#c0392b",
  teacher: "#c77c00",
  other: "#666666"
};
const GIVER_LABEL = { parents: "Parents", grandparents: "Grandparents", self: "Self", teacher: "A teacher", other: "Someone else" };
const STATUS_LABEL = { legal: "Legal first name", middle: "Legal middle name", unofficial: "Unofficial" };
const SOURCE_LABEL = { family: "Told by family", suggested: "Picked from suggestions", unknown: "Unknown" };
const GEN_LABEL = { immigrant: "Immigrant generation", usborn: "US-born generation" };
const FEELS_LABEL = { korean: "Korean name", english: "English name", both: "Both equally", depends: "Depends on where they are" };

// ---------- Data ----------

let entries = SEED_ENTRIES.slice();

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) entries = entries.concat(JSON.parse(raw));
  } catch (e) { /* storage unavailable; ignore */ }
}

function saveSubmission(entry) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.push(entry);
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch (e) { /* storage unavailable; entry stays in memory only */ }
}

function findEntry(id) {
  return entries.find(e => e.id === id);
}

// Names shown according to the person's privacy choice
function displayNames(e) {
  const koGiven = e.korean.given.join("");
  if (e.privacy === "anonymous") return { ko: "Korean name", en: "English name", root: "Family name", title: "Anonymous" };
  if (e.privacy === "first") return { ko: koGiven, en: e.english.first, root: "Family name", title: e.english.first + " / " + koGiven };
  const enSurname = e.surname.enAlt || e.surname.en;
  const en = [e.english.first, e.english.middle, enSurname].filter(Boolean).join(" ");
  const ko = (e.surname.ko || "") + koGiven;
  let root = e.surname.en + (e.surname.ko ? " (" + e.surname.ko + ")" : "");
  if (e.surname.enAlt) root += " / " + e.surname.enAlt;
  return { ko, en, root, title: en + " / " + ko };
}

// ---------- Drawing a route ----------

const SVG_NS = "http://www.w3.org/2000/svg";

function el(name, attrs, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

function text(parent, x, y, str, extra) {
  const t = el("text", Object.assign({ x, y, "font-size": 12, "font-family": "sans-serif" }, extra || {}), parent);
  t.textContent = str;
  return t;
}

function drawRoute(svg, e) {
  svg.innerHTML = "";
  svg.setAttribute("viewBox", "0 0 640 190");

  const rootX = 20, rootY = 90;
  const startX = 100, endX = 600;
  const yKo = 50, yEn = 130, yAxis = 172;
  const span = Math.max(1, NOW - e.birthYear);
  const xFor = year => {
    const x = startX + ((year - e.birthYear) / span) * (endX - startX);
    return Math.min(endX - 20, Math.max(startX, x));
  };

  const names = displayNames(e);
  const lines = [
    { key: "korean", data: e.korean, y: yKo, otherY: yEn, label: names.ko + (e.korean.hanja.join("") ? " (" + e.korean.hanja.join("") + ")" : "") },
    { key: "english", data: e.english, y: yEn, otherY: yKo, label: names.en }
  ];

  lines.forEach(line => {
    const n = line.data;
    const other = line.key === "korean" ? e.english : e.korean;
    let d, labelX;

    if (n.when === "later" && n.year) {
      // Branch off the other line (or the root) at the year this name began
      const x0 = xFor(n.year);
      const fromY = other.when === "birth" ? line.otherY : rootY;
      d = `M ${x0} ${fromY} C ${x0 + 25} ${fromY}, ${x0 + 15} ${line.y}, ${x0 + 40} ${line.y} L ${endX} ${line.y}`;
      labelX = x0 + 40;
    } else {
      // Grows from the shared family name at birth
      d = `M ${rootX} ${rootY} C ${rootX + 50} ${rootY}, ${startX - 40} ${line.y}, ${startX} ${line.y} L ${endX} ${line.y}`;
      labelX = startX;
    }

    const width = 2 + (n.use || 3) * 1.6;
    const color = COLORS[n.givenBy] || COLORS.other;

    // Solid / dashed / dotted shows how the Korean meaning is known
    let dash = "";
    if (line.key === "korean") {
      if (n.meaningSource === "suggested") dash = `${width * 2} ${width * 1.2}`;
      if (n.meaningSource === "unknown") dash = `0.1 ${width * 1.8}`;
    }

    const base = { d, fill: "none", stroke: color, "stroke-width": width, "stroke-linecap": "round" };
    if (dash) base["stroke-dasharray"] = dash;
    el("path", base, svg);

    // Outlined (hollow) line for an unofficial name
    if (n.status === "unofficial" && width > 4) {
      const inner = Object.assign({}, base, { stroke: "white", "stroke-width": width - 3 });
      el("path", inner, svg);
    }

    text(svg, labelX, line.y - width / 2 - 6, line.label);
  });

  // Shared root
  el("circle", { cx: rootX, cy: rootY, r: 6, fill: "#333" }, svg);
  text(svg, rootX - 8, rootY + 52, names.root, { "font-size": 11, fill: "#333" });

  // Timeline axis with places
  el("line", { x1: startX, y1: yAxis, x2: endX, y2: yAxis, stroke: "#999" }, svg);
  text(svg, startX, yAxis + 14, [e.birthYear, e.places.origin].filter(Boolean).join(" · "), { "font-size": 10, fill: "#555" });
  text(svg, endX, yAxis + 14, [NOW, e.places.now].filter(Boolean).join(" · "), { "font-size": 10, fill: "#555", "text-anchor": "end" });
  if (e.places.arrival && e.places.arrival.year) {
    const ax = xFor(e.places.arrival.year);
    el("line", { x1: ax, y1: yAxis - 6, x2: ax, y2: yAxis + 4, stroke: "#555" }, svg);
    text(svg, ax, yAxis - 9, "arrived " + e.places.arrival.year, { "font-size": 10, fill: "#555", "text-anchor": "middle" });
  }
}

// ---------- Pages ----------

function showPage() {
  const hash = location.hash.slice(1) || "home";
  const [page, id] = hash.split("/");
  const target = document.getElementById(page) && document.getElementById(page).classList.contains("page") ? page : "home";

  document.querySelectorAll(".page").forEach(s => { s.hidden = s.id !== target; });

  if (target === "home") drawRoute(document.getElementById("home-route"), SEED_ENTRIES[0]);
  if (target === "archive") renderArchive();
  if (target === "person") renderPerson(id);
  if (target === "add") showStep(currentStep);
  window.scrollTo(0, 0);
}

function renderArchive() {
  const gen = document.getElementById("f-gen").value;
  const giver = document.getElementById("f-giver").value;
  const when = document.getElementById("f-when").value;

  const list = entries.filter(e =>
    (!gen || e.generation === gen) &&
    (!giver || e.english.givenBy === giver) &&
    (!when || e.english.when === when)
  );

  document.getElementById("archive-count").textContent = list.length + " of " + entries.length + " people";
  const container = document.getElementById("archive-list");
  container.innerHTML = "";

  list.forEach(e => {
    const div = document.createElement("div");
    div.className = "entry";
    const names = displayNames(e);
    div.innerHTML =
      `<h3><a href="#person/${e.id}"></a></h3>` +
      `<p>${GEN_LABEL[e.generation]}${e.sample ? " · sample entry" : ""}</p>`;
    div.querySelector("a").textContent = names.title;
    const svg = el("svg", { width: 640, height: 190 });
    div.appendChild(svg);
    drawRoute(svg, e);
    container.appendChild(div);
  });
}

function describeName(n, label) {
  const when = n.when === "later" && n.year ? "later, in " + n.year : "at birth";
  return `<li><strong>${label}:</strong> given by ${GIVER_LABEL[n.givenBy].toLowerCase()} ${when}; ${STATUS_LABEL[n.status].toLowerCase()}</li>`;
}

function renderPerson(id) {
  const e = findEntry(id);
  const box = document.getElementById("person-detail");
  if (!e) { box.innerHTML = "<p>Entry not found.</p>"; return; }

  const names = displayNames(e);
  const relatives = entries.filter(r => r.familyId && r.familyId === e.familyId && r.id !== e.id);
  const arrival = e.places.arrival ? `${esc(e.places.arrival.place)} (${e.places.arrival.year})` : "—";
  const hanja = e.korean.hanja.filter(Boolean).join("");

  box.innerHTML = `
    <h2>${esc(names.title)}</h2>
    <p>${GEN_LABEL[e.generation]}${e.sample ? " · sample entry" : ""}</p>
    <svg id="person-route" width="640" height="190"></svg>

    <h3>Where the names came from</h3>
    <ul>
      ${describeName(e.korean, "Korean name")}
      ${describeName(e.english, "English name")}
      ${e.surname.clan ? `<li><strong>Clan origin:</strong> ${esc(e.surname.clan)}</li>` : ""}
      ${e.surname.enAlt ? `<li><strong>English family name:</strong> ${esc(e.surname.enAlt)} (${esc(e.surname.altNote || "differs from Korean")})</li>` : ""}
    </ul>

    <h3>Meaning</h3>
    <p>${hanja ? esc(hanja) + " — " : ""}${e.korean.meaning ? esc(e.korean.meaning) : "Not known yet"}
       <br><small>${SOURCE_LABEL[e.korean.meaningSource]}</small></p>

    <h3>Places</h3>
    <ul>
      <li><strong>Born:</strong> ${esc(e.places.origin || "—")}</li>
      <li><strong>Arrived in the US:</strong> ${arrival}</li>
      <li><strong>Lives now:</strong> ${esc(e.places.now || "—")}</li>
    </ul>

    <h3>Today</h3>
    <ul>
      <li><strong>Korean name used by:</strong> ${esc(e.usedBy.korean || "—")}</li>
      <li><strong>English name used by:</strong> ${esc(e.usedBy.english || "—")}</li>
      <li><strong>On their ID:</strong> ${esc(e.onId)}</li>
      <li><strong>Feels most like them:</strong> ${FEELS_LABEL[e.feelsLike] || "—"}</li>
    </ul>

    ${e.story ? `<h3>Story</h3><blockquote>${esc(e.story)}</blockquote>` : ""}

    ${relatives.length ? "<h3>Family in the archive</h3><ul id='relatives'></ul>" : ""}
  `;

  drawRoute(document.getElementById("person-route"), e);

  const ul = document.getElementById("relatives");
  relatives.forEach(r => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#person/" + r.id;
    a.textContent = displayNames(r).title + " (" + GEN_LABEL[r.generation] + ")";
    li.appendChild(a);
    if (ul) ul.appendChild(li);
  });
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

// ---------- Submission form ----------

let currentStep = 1;
const TOTAL_STEPS = 7;
const $ = id => document.getElementById(id);
const radio = name => (document.querySelector(`input[name="${name}"]:checked`) || {}).value;

function showStep(n) {
  currentStep = n;
  document.querySelectorAll("#add-form fieldset").forEach(f => { f.hidden = Number(f.dataset.step) !== n; });
  $("step-num").textContent = n;
  $("back-btn").disabled = n === 1;
  $("next-btn").hidden = n === TOTAL_STEPS;
  $("submit-btn").hidden = n !== TOTAL_STEPS;
  if (n === 3) { renderSuggestions(); updateKnow(); }
  if (n === 6) fillFamilySelect();
  if (n === 7) renderPreview();
}

function validateStep1() {
  const missing = [];
  if (!$("surnameEn").value.trim()) missing.push("English family name");
  if (!$("koGiven").value.trim()) missing.push("Korean given name");
  if (!$("enFirst").value.trim()) missing.push("English first name");
  const y = Number($("birthYear").value);
  if (!y || y < 1900 || y > NOW) missing.push("birth year");
  $("step1-error").textContent = missing.length ? "Please add: " + missing.join(", ") + "." : "";
  return missing.length === 0;
}

function updateKnow() {
  const v = radio("know");
  $("know-yes").hidden = v !== "yes";
  $("know-partly").hidden = v !== "partly";
  $("know-no").hidden = v !== "no";
}

function renderSuggestions() {
  const box = $("suggestions");
  box.innerHTML = "";
  Array.from($("koGiven").value.trim()).forEach((syl, i) => {
    const p = document.createElement("p");
    const label = document.createElement("label");
    label.textContent = syl + " ";
    const sel = document.createElement("select");
    sel.className = "hanja-pick";
    sel.dataset.index = i;
    sel.add(new Option("Not sure", ""));
    (HANJA[syl] || []).forEach(h => sel.add(new Option(h.c + " — " + h.m, h.c + "|" + h.m)));
    label.appendChild(sel);
    p.appendChild(label);
    if (!HANJA[syl]) {
      const note = document.createElement("small");
      note.textContent = " (no suggestions for this syllable in the sample list)";
      p.appendChild(note);
    }
    box.appendChild(p);
  });
}

function fillFamilySelect() {
  const sel = $("familyLink");
  const current = sel.value;
  sel.innerHTML = "";
  sel.add(new Option("No one", ""));
  entries.forEach(e => sel.add(new Option(displayNames(e).title, e.id)));
  sel.value = current;
}

function buildEntry() {
  const given = Array.from($("koGiven").value.trim());
  let hanja = given.map(() => "");
  let meaning = "";
  let meaningSource = "unknown";

  const know = radio("know");
  if (know === "yes") {
    const typed = Array.from($("hanjaInput").value.trim());
    hanja = given.map((_, i) => typed[i] || "");
    meaning = $("meaningInput").value.trim();
    meaningSource = meaning || typed.length ? "family" : "unknown";
  } else if (know === "partly") {
    const parts = [];
    document.querySelectorAll(".hanja-pick").forEach(sel => {
      if (!sel.value) return;
      const [c, m] = sel.value.split("|");
      hanja[Number(sel.dataset.index)] = c;
      parts.push(m);
    });
    meaning = parts.join(", ");
    meaningSource = parts.length ? "suggested" : "unknown";
  }

  const linked = findEntry($("familyLink").value);
  const id = "u" + Date.now();
  let familyId = id;
  if (linked) {
    if (!linked.familyId) linked.familyId = linked.id;
    familyId = linked.familyId;
  }

  const arrivalYear = Number($("arrivalYear").value);
  const koWhen = radio("koWhen");
  const enWhen = radio("enWhen");

  return {
    id,
    sample: false,
    familyId,
    generation: radio("generation"),
    birthYear: Number($("birthYear").value),
    privacy: radio("privacy"),
    surname: {
      ko: $("surnameKo").value.trim(),
      en: $("surnameEn").value.trim(),
      enAlt: $("surnameEnAlt").value.trim(),
      altNote: $("surnameEnAlt").value.trim() ? "differs from Korean" : "",
      clan: $("clan").value.trim()
    },
    korean: {
      given, hanja, meaning, meaningSource,
      givenBy: $("koGivenBy").value,
      when: koWhen,
      year: koWhen === "later" ? Number($("koYear").value) || null : null,
      status: $("koStatus").value,
      use: Number($("koUse").value)
    },
    english: {
      first: $("enFirst").value.trim(),
      middle: $("enMiddle").value.trim(),
      givenBy: $("enGivenBy").value,
      when: enWhen,
      year: enWhen === "later" ? Number($("enYear").value) || null : null,
      status: $("enStatus").value,
      use: Number($("enUse").value)
    },
    places: {
      origin: $("origin").value.trim(),
      arrival: $("arrivalPlace").value.trim() && arrivalYear ? { place: $("arrivalPlace").value.trim(), year: arrivalYear } : null,
      now: $("now").value.trim()
    },
    usedBy: { korean: $("usedByKo").value.trim(), english: $("usedByEn").value.trim() },
    onId: $("onId").value,
    feelsLike: $("feelsLike").value,
    story: $("story").value.trim()
  };
}

function renderPreview() {
  const e = buildEntry();
  const box = $("preview");
  box.innerHTML = "";
  const h = document.createElement("p");
  h.textContent = displayNames(e).title;
  box.appendChild(h);
  const svg = el("svg", { width: 640, height: 190 });
  box.appendChild(svg);
  drawRoute(svg, e);
}

// ---------- Wiring ----------

$("next-btn").addEventListener("click", () => {
  if (currentStep === 1 && !validateStep1()) return;
  showStep(Math.min(TOTAL_STEPS, currentStep + 1));
});
$("back-btn").addEventListener("click", () => showStep(Math.max(1, currentStep - 1)));
document.querySelectorAll('input[name="know"]').forEach(r => r.addEventListener("change", updateKnow));
["f-gen", "f-giver", "f-when"].forEach(id => $(id).addEventListener("change", renderArchive));

$("add-form").addEventListener("submit", ev => {
  ev.preventDefault();
  const entry = buildEntry();
  entries.push(entry);
  saveSubmission(entry);
  $("add-form").reset();
  currentStep = 1;
  location.hash = "#person/" + entry.id;
});

window.addEventListener("hashchange", showPage);

loadSaved();
showPage();
