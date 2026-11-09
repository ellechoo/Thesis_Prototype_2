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
const SOURCE_LABEL = { family: "Known", suggested: "Picked from the site's suggestions", unknown: "Unknown" };
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
  if (e.privacy === "anonymous") return { ko: "Korean name", en: "English name", title: "Anonymous" };
  return { ko: koGiven, en: e.english.first, title: e.english.first + " / " + koGiven };
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
      // Grows from the shared starting point (the person, at birth)
      d = `M ${rootX} ${rootY} C ${rootX + 50} ${rootY}, ${startX - 40} ${line.y}, ${startX} ${line.y} L ${endX} ${line.y}`;
      labelX = startX;
    }

    const width = 2 + (n.use || 3) * 1.6;
    const color = COLORS[n.givenBy] || COLORS.other;

    // Solid / dashed / dotted shows how the name's meaning is known
    let dash = "";
    if (n.meaningSource === "suggested") dash = `${width * 2} ${width * 1.2}`;
    if (n.meaningSource === "unknown") dash = `0.1 ${width * 1.8}`;

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

  // Shared starting point: the person
  el("circle", { cx: rootX, cy: rootY, r: 6, fill: "#333" }, svg);

  // Timeline axis: birth year and country, the year they moved, and now
  el("line", { x1: startX, y1: yAxis, x2: endX, y2: yAxis, stroke: "#999" }, svg);
  text(svg, startX, yAxis + 14, [e.birthYear, e.country].filter(Boolean).join(" · "), { "font-size": 10, fill: "#555" });
  text(svg, endX, yAxis + 14, String(NOW), { "font-size": 10, fill: "#555", "text-anchor": "end" });
  if (e.movedYear) {
    const ax = xFor(e.movedYear);
    el("line", { x1: ax, y1: yAxis - 6, x2: ax, y2: yAxis + 4, stroke: "#555" }, svg);
    text(svg, ax, yAxis - 9, "moved to US " + e.movedYear, { "font-size": 10, fill: "#555", "text-anchor": "middle" });
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
  const when = (n.when === "later" ? "later in life" : "at birth") + (n.year ? ", in " + n.year : "");
  return `<li><strong>${label}:</strong> given by ${GIVER_LABEL[n.givenBy].toLowerCase()} ${when}; ${STATUS_LABEL[n.status].toLowerCase()}</li>`;
}

function renderPerson(id) {
  const e = findEntry(id);
  const box = document.getElementById("person-detail");
  if (!e) { box.innerHTML = "<p>Entry not found.</p>"; return; }

  const names = displayNames(e);
  const relatives = entries.filter(r => r.familyId && r.familyId === e.familyId && r.id !== e.id);
  const hanja = e.korean.hanja.filter(Boolean).join("");

  box.innerHTML = `
    <h2>${esc(names.title)}</h2>
    <p>${GEN_LABEL[e.generation]}${e.sample ? " · sample entry" : ""}</p>
    <svg id="person-route" width="640" height="190"></svg>

    <h3>Where the names came from</h3>
    <ul>
      ${describeName(e.korean, "Korean name")}
      ${describeName(e.english, "English name")}
    </ul>

    <h3>Meanings</h3>
    <p><strong>Korean name:</strong> ${hanja ? esc(hanja) + " — " : ""}${e.korean.meaning ? esc(e.korean.meaning) : "Not known yet"}
       <br><small>${e.korean.meaningSource === "suggested" ? "A guess from possible Hanja, not confirmed" : (SOURCE_LABEL[e.korean.meaningSource] || "Unknown")}${koSourceLinks(e.korean)}</small></p>
    <p><strong>English name:</strong> ${e.english.meaning ? esc(e.english.meaning) : "Not known yet"}
       <br><small>${SOURCE_LABEL[e.english.meaningSource] || "Unknown"}${e.english.sourceUrl ? ` · Source: <a href="${esc(e.english.sourceUrl)}" target="_blank" rel="noopener">${sourceName(e.english.sourceUrl)}</a>` : ""}</small></p>
    ${e.korean.nameArticle ? `<p><small>About the name ${esc(e.korean.given.join(""))}: <a href="${esc(e.korean.nameArticle.url)}" target="_blank" rel="noopener">Wikipedia, “${esc(e.korean.nameArticle.title)}”</a></small></p>` : ""}
    ${e.english.reason ? `<p><strong>Why this English name:</strong> ${esc(e.english.reason)}</p>` : ""}

    <h3>Born and moved</h3>
    <ul>
      <li><strong>Born in:</strong> ${esc(e.country || "—")}</li>
      ${e.movedYear ? `<li><strong>Moved to the US:</strong> ${e.movedYear}</li>` : ""}
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

// Source links for Korean meanings picked from the site's Hanja suggestions
function koSourceLinks(n) {
  if (!n.sources || !n.sources.length) return "";
  const links = n.sources.map(u => {
    const ch = String.fromCodePoint(parseInt(u, 16));
    return `<a href="${unihanUrl(u)}" target="_blank" rel="noopener">${ch}</a>`;
  });
  let out = " · Source: Unicode Han Database (" + links.join(", ") + ")";
  if (n.wiktSources && n.wiktSources.length) {
    out += "; Korean meanings from Wiktionary (" + n.wiktSources.map(url =>
      `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(decodeURIComponent(url.split("/wiki/")[1] || ""))}</a>`).join(", ") + ")";
  }
  return out;
}

// Readable name for a source link
function sourceName(url) {
  if (url.includes("wiktionary.org")) return "Wiktionary";
  if (url.includes("wikipedia.org")) return "Wikipedia";
  if (url.includes("behindthename.com")) return "Behind the Name";
  return "Source";
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
  if (n === 2) updateMovedFields();
  if (n === 3) { prepareMeaningStep(); updateKnow(); }
  if (n === 6) fillFamilySelect();
  if (n === 7) renderPreview();
}

function validateStep1() {
  const missing = [];
  if (!$("koGiven").value.trim()) missing.push("Korean given name");
  if (!$("enFirst").value.trim()) missing.push("English first name");
  $("step1-error").textContent = missing.length ? "Please add: " + missing.join(", ") + "." : "";
  return missing.length === 0;
}

// Step 2 needs the year each name was given
function validateStep2() {
  const missing = [];
  const ok = y => y >= 1900 && y <= NOW;
  if (!ok(Number($("koYear").value))) missing.push("the year your Korean name was given");
  if (!ok(Number($("enYear").value))) missing.push("the year your English name was given");
  $("step2-error").textContent = missing.length ? "Please add " + missing.join(" and ") + "." : "";
  return missing.length === 0;
}

// Only ask for country and moving year if the person moved to the US
function updateMovedFields() {
  $("moved-fields").hidden = radio("generation") !== "immigrant";
}

function updateKnow() {
  $("ko-know-yes").hidden = radio("koKnow") !== "yes";
  $("ko-know-no").hidden = radio("koKnow") !== "no";
  $("en-know-yes").hidden = radio("enKnow") !== "yes";
  $("en-know-no").hidden = radio("enKnow") !== "no";
}

// Builds the Korean and English suggestions for step 3.
// Only rebuilt when the name changes, so the person's picks and edits are kept.
let lastKoGiven = null;
let lastEnFirst = null;

function prepareMeaningStep() {
  const koGiven = $("koGiven").value.trim();
  const enFirst = $("enFirst").value.trim();
  $("ko-name-label").textContent = koGiven;
  $("en-name-label").textContent = enFirst;

  if (koGiven !== lastKoGiven) {
    lastKoGiven = koGiven;
    renderHanjaSuggestions(koGiven);
    renderKoreanNameLookup(koGiven);
  }
  if (enFirst !== lastEnFirst) {
    lastEnFirst = enFirst;
    renderEnglishSuggestion(enFirst);
  }
}

// Small helper for making a link that opens in a new tab
function makeLink(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

// Korean: for each syllable, a short list of common possibilities and a dropdown of every
// Hanja on the official name list for that reading (common ones first)
function renderHanjaSuggestions(koGiven) {
  const box = $("suggestions");
  box.innerHTML = "";
  $("koSuggestedMeaning").value = "";

  // Message the person can send to family
  // Topic particle: 은 after a final consonant (지연은), 는 after a vowel (서아는)
  const last = koGiven.charCodeAt(koGiven.length - 1) - 0xAC00;
  const particle = last >= 0 && last < 11172 && last % 28 === 0 ? "는" : "은";
  $("ask-family-ko").textContent = "엄마, 아빠, 제 이름 " + koGiven + particle + " 무슨 한자예요? 무슨 뜻이에요?";
  $("ask-family-en").textContent = "(“Mom, Dad, which Hanja are in my name, " + koGiven + "? What does it mean?”)";
  $("copy-status").textContent = "";

  Array.from(koGiven).forEach((syl, i) => {
    const options = NAME_HANJA[syl] || [];
    const common = options.filter(o => o[2]);
    const rare = options.filter(o => !o[2]);
    const div = document.createElement("div");

    const title = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = syl;
    title.appendChild(strong);
    if (!options.length) {
      title.appendChild(document.createTextNode(" — No characters on the official name list are read as " + syl +
        ". This syllable may be native Korean (순우리말), which has no Hanja."));
      div.appendChild(title);
      box.appendChild(div);
      return;
    }
    title.appendChild(document.createTextNode(" can be written " + options.length + " ways in names. " +
      (common.length ? "Some common ones: " : "")));
    div.appendChild(title);

    // A readable preview of common possibilities
    if (common.length) {
      const ul = document.createElement("ul");
      common.slice(0, 8).forEach(([c, d]) => {
        const li = document.createElement("li");
        li.textContent = c + " — " + (d ? d.split(";")[0] : "no definition");
        ul.appendChild(li);
      });
      div.appendChild(ul);
    }

    const p = document.createElement("p");
    const label = document.createElement("label");
    label.textContent = "If one sounds familiar: ";
    const sel = document.createElement("select");
    sel.className = "hanja-pick";
    sel.dataset.index = i;
    sel.add(new Option("Not sure", ""));
    [["Common characters", common], ["Less common characters", rare]].forEach(([name, list]) => {
      if (!list.length) return;
      const group = document.createElement("optgroup");
      group.label = name;
      list.forEach(([c, d]) => {
        const u = c.codePointAt(0).toString(16).toUpperCase();
        const opt = new Option(c + (d ? " — " + d : ""), c + "|" + d + "|" + u);
        group.appendChild(opt);
      });
      sel.appendChild(group);
    });
    sel.addEventListener("change", updateKoSuggestedMeaning);
    label.appendChild(sel);
    p.appendChild(label);
    const note = document.createElement("small");
    note.className = "hanja-source";
    p.appendChild(note);
    div.appendChild(p);
    box.appendChild(div);
  });
}

// Link to a character's entry in the Unicode Han Database
function unihanUrl(code) {
  return "https://www.unicode.org/cgi-bin/GetUnihanData.pl?codepoint=" + code;
}

// Fills the editable meaning box from the Hanja the person picked, shows source links,
// and looks up each character's Korean meaning (음훈) on Wiktionary
function updateKoSuggestedMeaning() {
  const parts = [];
  document.querySelectorAll(".hanja-pick").forEach(sel => {
    const note = sel.closest("p").querySelector(".hanja-source");
    if (!sel.value) {
      if (sel.options.length > 1) note.innerHTML = "";
      delete note.dataset.char;
      delete note.dataset.eumhun;
      return;
    }
    const [c, d, u] = sel.value.split("|");
    const eumhun = note.dataset.char === c ? note.dataset.eumhun : "";
    const def = d ? d.split(";")[0] : "";
    parts.push(eumhun ? eumhun + (def ? " (" + def + ")" : "") : def);
    if (note.dataset.char === c) return;   // already showing this character's sources
    note.dataset.char = c;
    delete note.dataset.eumhun;
    note.innerHTML = "";
    note.appendChild(document.createTextNode(" Source: "));
    note.appendChild(makeLink(unihanUrl(u), "Unihan entry for " + c));
    const korean = document.createElement("span");
    korean.textContent = " · Looking up Korean meaning…";
    note.appendChild(korean);
    lookupHanjaEumhun(c).then(r => {
      if (note.dataset.char !== c) return;
      korean.innerHTML = "";
      if (r) {
        korean.appendChild(document.createTextNode(" · Korean meaning (음훈): " + r.eumhun + " ("));
        korean.appendChild(makeLink(r.url, "Wiktionary"));
        korean.appendChild(document.createTextNode(")"));
        // Add the Korean meaning and its source to the suggested meaning
        note.dataset.eumhun = r.eumhun;
        note.dataset.wikt = r.url;
        updateKoSuggestedMeaning();
      } else {
        korean.textContent = " · No Korean meaning found on Wiktionary";
      }
    }).catch(() => {
      if (note.dataset.char === c) korean.textContent = " · Couldn't reach Wiktionary";
    });
  });
  $("koSuggestedMeaning").value = parts.filter(Boolean).join(" / ");
}

// Korean: look up an English Wikipedia article about this Korean given name
let koNameArticle = null;
let koLookupId = 0;

async function renderKoreanNameLookup(koGiven) {
  const results = $("ko-lookup-results");
  const lookupId = ++koLookupId;
  koNameArticle = null;
  results.innerHTML = "<p>Looking up " + esc(koGiven) + "…</p>";
  let wiki = null, failed = false;
  try { wiki = await lookupKoreanNameWikipedia(koGiven); } catch (e) { failed = true; }
  if (lookupId !== koLookupId) return;
  results.innerHTML = "";
  if (wiki) {
    koNameArticle = { title: wiki.title, url: wiki.url };
    const p = document.createElement("p");
    p.textContent = wiki.extract;
    results.appendChild(p);
    const src = document.createElement("p");
    const small = document.createElement("small");
    small.appendChild(document.createTextNode("Source: "));
    small.appendChild(makeLink(wiki.url, "Wikipedia, “" + wiki.title + "”"));
    small.appendChild(document.createTextNode(", CC BY-SA 4.0. The full article often lists Hanja commonly used for this name."));
    src.appendChild(small);
    results.appendChild(src);
  } else {
    const p = document.createElement("p");
    p.textContent = failed
      ? "The lookup couldn't connect right now."
      : "No Wikipedia article about " + koGiven + " as a given name was found. Its meaning depends on the Hanja your family chose, if any.";
    results.appendChild(p);
  }
}

// English: look the name up live on Wiktionary and Wikipedia
let enSuggestionUrl = "";
let enLookupId = 0;

async function renderEnglishSuggestion(enFirst) {
  const results = $("en-lookup-results");
  const note = $("en-suggestion-note");
  const lookupId = ++enLookupId;
  results.innerHTML = "<p>Looking up " + esc(enFirst) + "…</p>";
  note.innerHTML = "";
  $("enSuggestedMeaning").value = "";
  enSuggestionUrl = "";

  let wikt = null, wiki = null, failed = false;
  try {
    [wikt, wiki] = await Promise.all([
      lookupNameWiktionary(enFirst).catch(() => { failed = true; return null; }),
      lookupNameWikipedia(enFirst).catch(() => null)
    ]);
  } catch (e) { failed = true; }
  if (lookupId !== enLookupId) return;   // a newer lookup has started

  results.innerHTML = "";

  if (wikt) {
    const block = document.createElement("div");
    const h = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = "Wiktionary" + (wikt.language && wikt.language !== "English" ? " (" + wikt.language + ")" : "");
    h.appendChild(strong);
    block.appendChild(h);
    if (wikt.definition) {
      const p = document.createElement("p");
      p.textContent = wikt.definition;
      block.appendChild(p);
    }
    if (wikt.etymology) {
      const p = document.createElement("p");
      p.textContent = "Etymology: " + wikt.etymology;
      block.appendChild(p);
    }
    const src = document.createElement("p");
    const small = document.createElement("small");
    small.appendChild(document.createTextNode("Source: "));
    small.appendChild(makeLink(wikt.url, "Wiktionary, “" + capitalize(enFirst) + "”"));
    small.appendChild(document.createTextNode(", CC BY-SA 4.0"));
    src.appendChild(small);
    block.appendChild(src);
    results.appendChild(block);

    $("enSuggestedMeaning").value = wikt.etymology || wikt.definition;
    enSuggestionUrl = wikt.url;
  }

  if (wiki) {
    const block = document.createElement("div");
    const h = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = "Wikipedia";
    h.appendChild(strong);
    block.appendChild(h);
    const p = document.createElement("p");
    p.textContent = wiki.extract;
    block.appendChild(p);
    const src = document.createElement("p");
    const small = document.createElement("small");
    small.appendChild(document.createTextNode("Source: "));
    small.appendChild(makeLink(wiki.url, "Wikipedia, “" + wiki.title + "”"));
    small.appendChild(document.createTextNode(", CC BY-SA 4.0"));
    src.appendChild(small);
    block.appendChild(src);
    results.appendChild(block);

    if (!$("enSuggestedMeaning").value) {
      $("enSuggestedMeaning").value = wiki.extract;
      enSuggestionUrl = wiki.url;
    }
  }

  // Offline backup: the 20 names checked by hand on Behind the Name
  const backup = ENGLISH_NAMES[enFirst.toLowerCase()];
  if (!wikt && !wiki && backup) {
    const p = document.createElement("p");
    p.appendChild(document.createTextNode((failed ? "The live lookup couldn't connect. " : "") + "Behind the Name: " + backup.m + " "));
    const small = document.createElement("small");
    small.appendChild(document.createTextNode("(Source: "));
    small.appendChild(makeLink(backup.url, "Behind the Name"));
    small.appendChild(document.createTextNode(")"));
    p.appendChild(small);
    results.appendChild(p);
    $("enSuggestedMeaning").value = backup.m;
    enSuggestionUrl = backup.url;
  }

  if (!results.childNodes.length) {
    const p = document.createElement("p");
    p.textContent = failed
      ? "The lookup couldn't connect right now. You can still describe your name in your own words."
      : "No source has an entry for " + enFirst + " yet. That's okay. Many names, spellings, and stories aren't written down anywhere, which is part of why this archive exists. You can describe your name in your own words.";
    results.appendChild(p);
  }

  note.textContent = $("enSuggestedMeaning").value
    ? "This is taken from the sources above. Keep it, shorten it, change it, or clear it."
    : "";
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
  const sources = [];
  const wiktSources = [];

  // Korean meaning
  if (radio("koKnow") === "yes") {
    const typed = Array.from($("hanjaInput").value.trim());
    hanja = given.map((_, i) => typed[i] || "");
    meaning = $("meaningInput").value.trim();
    meaningSource = meaning || typed.length ? "family" : "unknown";
  } else {
    document.querySelectorAll(".hanja-pick").forEach(sel => {
      if (!sel.value) return;
      const [c, , u] = sel.value.split("|");
      hanja[Number(sel.dataset.index)] = c;
      sources.push(u);
      const note = sel.closest("p").querySelector(".hanja-source");
      if (note.dataset.char === c && note.dataset.wikt) wiktSources.push(note.dataset.wikt);
    });
    meaning = $("koSuggestedMeaning").value.trim();
    meaningSource = meaning || hanja.some(Boolean) ? "suggested" : "unknown";
  }

  // English meaning
  let enMeaning, enMeaningSource, enSourceUrl = "";
  if (radio("enKnow") === "yes") {
    enMeaning = $("enMeaningInput").value.trim();
    enMeaningSource = enMeaning ? "family" : "unknown";
  } else {
    enMeaning = $("enSuggestedMeaning").value.trim();
    enMeaningSource = enMeaning ? "suggested" : "unknown";
    if (enMeaning) enSourceUrl = enSuggestionUrl;
  }

  const linked = findEntry($("familyLink").value);
  const id = "u" + Date.now();
  let familyId = id;
  if (linked) {
    if (!linked.familyId) linked.familyId = linked.id;
    familyId = linked.familyId;
  }

  const moved = radio("generation") === "immigrant";
  const koWhen = radio("koWhen");
  const enWhen = radio("enWhen");

  return {
    id,
    sample: false,
    familyId,
    generation: radio("generation"),
    // The timeline starts at the earliest year a name was given
    birthYear: Math.min(Number($("koYear").value) || NOW, Number($("enYear").value) || NOW),
    privacy: radio("privacy"),
    korean: {
      given, hanja, meaning, meaningSource,
      sources: meaningSource === "suggested" ? sources : [],
      wiktSources: meaningSource === "suggested" ? wiktSources : [],
      givenBy: $("koGivenBy").value,
      when: koWhen,
      year: Number($("koYear").value) || null,
      status: $("koStatus").value,
      nameArticle: koNameArticle,
      use: Number($("koUse").value)
    },
    english: {
      first: $("enFirst").value.trim(),
      meaning: enMeaning,
      meaningSource: enMeaningSource,
      sourceUrl: enSourceUrl,
      reason: $("enReason").value.trim(),
      givenBy: $("enGivenBy").value,
      when: enWhen,
      year: Number($("enYear").value) || null,
      status: $("enStatus").value,
      use: Number($("enUse").value)
    },
    country: moved ? $("country").value.trim() : "United States",
    movedYear: moved ? Number($("movedYear").value) || null : null,
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
  if (currentStep === 2 && !validateStep2()) return;
  showStep(Math.min(TOTAL_STEPS, currentStep + 1));
});
$("back-btn").addEventListener("click", () => showStep(Math.max(1, currentStep - 1)));
$("copy-ask").addEventListener("click", () => {
  const text = $("ask-family-ko").textContent;
  try {
    navigator.clipboard.writeText(text).then(
      () => { $("copy-status").textContent = "Copied"; },
      () => { $("copy-status").textContent = "Select the message and copy it"; });
  } catch (e) {
    $("copy-status").textContent = "Select the message and copy it";
  }
});
document.querySelectorAll('input[name="koKnow"], input[name="enKnow"]').forEach(r => r.addEventListener("change", updateKnow));
["f-gen", "f-giver", "f-when"].forEach(id => $(id).addEventListener("change", renderArchive));

$("add-form").addEventListener("submit", ev => {
  ev.preventDefault();
  const entry = buildEntry();
  entries.push(entry);
  saveSubmission(entry);
  $("add-form").reset();
  lastKoGiven = null;
  lastEnFirst = null;
  currentStep = 1;
  location.hash = "#person/" + entry.id;
});

window.addEventListener("hashchange", showPage);

loadSaved();
showPage();
