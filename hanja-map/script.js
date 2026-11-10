// Hanja Roots: Korean Hanja words, grouped by which other languages
// (Chinese, Japanese, Vietnamese) use the same characters as a word.
// Two views (an area-proportional map and a card list), filters by group,
// search in any language, and a side panel comparing a word across languages.

// ---------- Data ----------

// Row fields (see words.js)
const HANGUL = 0, HANJA = 1, KO_MEANING = 2, CAT = 3, LEVEL = 4,
      ZH_PINYIN = 5, ZH_MEANING = 6, JP_FORM = 7, JP_READING = 8, JP_MEANING = 9,
      ZH_SIMPLIFIED = 10, VI_WORD = 11, VI_MEANING = 12, KO_SOURCE = 13, YUE = 14, ZH_FORM = 15;
// The Chinese traditional form: usually the same as the Korean Hanja, but Korean sometimes writes a variant (敎 for 教)
const zhForm = w => w[ZH_FORM] || w[HANJA];

// "Everyday" words: beginner and intermediate vocabulary in the Basic Korean Dictionary
const isEveryday = w => w[LEVEL] === "beginner" || w[LEVEL] === "intermediate";
const LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2 };

// Romanized spellings and loose search keys, worked out once (see romanize.js)
const KO_ROMAN = WORDS.map(w => romanizeKorean(w[HANGUL]));
const JP_ROMAN = WORDS.map(w => w[JP_READING] ? kanaToRomaji(w[JP_READING]) : "");
const KEY_KO = KO_ROMAN.map(looseRoman);
const KEY_JP = JP_ROMAN.map(looseRoman);
const KEY_ZH = WORDS.map(w => plainPinyin(w[ZH_PINYIN]));
const KEY_JP_KANA = WORDS.map(w => toHiragana(w[JP_READING]));
const KEY_VI = WORDS.map(w => plainVietnamese(w[VI_WORD]));
const KEY_YUE = WORDS.map(w => (w[YUE] || "").replace(/[^a-z]/g, ""));

const LANG_NAME = { z: "Chinese", j: "Japanese", v: "Vietnamese" };

// Every combination of languages, in columns by how many languages share the word
const COLUMNS = [
  { title: "Shared with all three", groups: ["zjv"] },
  { title: "Shared with two", groups: ["zj", "jv", "zv"] },
  { title: "Shared with one", groups: ["j", "z", "v"] },
  { title: "Not shared", groups: [""] }
];
const GROUP_ORDER = ["zjv", "zj", "jv", "zv", "j", "z", "v", ""];

function groupName(cat) {
  if (!cat) return "Not shared";
  if (cat === "zjv") return "All three";
  const names = Array.from(cat).map(c => LANG_NAME[c]);
  return names.length === 1 ? names[0] + " only" : names.join(" + ");
}

function sharedSentence(cat) {
  if (!cat) return "These characters aren't a word in Chinese, Japanese, or Vietnamese, in the dictionaries used here.";
  const names = Array.from(cat).map(c => LANG_NAME[c]);
  const list = names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + (names.length > 2 ? "," : "") + " and " + names[names.length - 1];
  return "These characters are also a word in " + list + ".";
}

// ---------- State ----------

const $ = id => document.getElementById(id);
const canvas = $("map");
const ctx = canvas.getContext("2d");
const tooltip = $("tooltip");

const state = {
  view: "map",       // "map" or "list"
  group: null,       // null = all groups, otherwise a category ("zjv", "", ...)
  query: "",
  matches: null,     // array of word indexes matching the search, best first; null = no search
  matchSet: null,
  everyday: false,
  selected: -1
};

let layout = null;   // map geometry for the current size and group

// ---------- Filtering ----------

// The words the list shows, in display order
function visibleWords() {
  const base = state.matches || WORDS.map((_, i) => i);
  return base.filter(i =>
    (state.group === null || WORDS[i][CAT] === state.group) &&
    (!state.everyday || isEveryday(WORDS[i])));
}

function updateStatus() {
  const parts = [];
  const where = state.group === null ? "all words" : comboSentence(state.group);
  const listOnly = state.everyday && state.view === "list";   // the list shows only everyday words
  if (state.matches) {
    const n = listOnly ? visibleWords().length : state.matches.filter(i => state.group === null || WORDS[i][CAT] === state.group).length;
    parts.push(n.toLocaleString() + (listOnly ? " everyday" : "") + " match" + (n === 1 ? "" : "es") + " for “" + state.query + "”" + (state.group === null ? "" : ", among words " + where));
  } else {
    const n = listOnly ? visibleWords().length : state.group === null ? WORDS.length : (COUNTS[state.group] || 0);
    parts.push(n.toLocaleString() + (listOnly ? " everyday" : "") + " Korean words" + (state.group === null ? (listOnly ? "" : ", grouped by which other languages share them") : " " + where));
  }
  if (state.everyday && !listOnly) parts.push("everyday words highlighted");
  $("status").textContent = parts.join(" · ");
}

// ---------- Group buttons ----------

// The filter: "All words", or a combination of languages. Korean is always on; each other language can be
// switched on or off, and the map and list show the words shared by exactly the languages that are on.
// "also a word in Chinese and Japanese, but not Vietnamese"
function comboSentence(cat) {
  const has = Array.from(cat).map(c => LANG_NAME[c]);
  const not = ["z", "j", "v"].filter(c => !cat.includes(c)).map(c => LANG_NAME[c]);
  if (!has.length) return "that aren't a word in Chinese, Japanese, or Vietnamese";
  return "that are also a word in " + joinList(has) + (not.length ? ", but not " + joinList(not).replace(" and ", " or ") : "");
}

function comboLabel(cat) {
  return cat ? "Korean + " + Array.from(cat).map(c => LANG_NAME[c]).join(" + ") : "Korean only";
}

function renderGroupButtons() {
  const box = $("groups");
  box.innerHTML = "";
  const all = el("button", "all-btn", "All");
  all.type = "button";
  all.title = "Show all " + WORDS.length.toLocaleString() + " words";
  all.setAttribute("aria-pressed", String(state.group === null));
  all.addEventListener("click", () => setGroup(null));
  box.appendChild(all);

  const langs = el("div", "lang-toggles");
  langs.setAttribute("role", "group");
  langs.setAttribute("aria-label", "Languages that share the word");
  langs.appendChild(el("span", "toggles-label", "Shared by"));
  const ko = el("button", "lang-toggle locked", "Korean");
  ko.type = "button";
  ko.setAttribute("aria-pressed", "true");
  ko.setAttribute("aria-disabled", "true");
  ko.title = "Every word here is Korean, so Korean is always on";
  langs.appendChild(ko);
  ["z", "j", "v"].forEach(c => {
    const on = state.group !== null && state.group.includes(c);
    const b = el("button", "lang-toggle", LANG_NAME[c]);
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.addEventListener("click", () => {
      const now = new Set(state.group === null ? [] : Array.from(state.group));
      if (now.has(c)) now.delete(c); else now.add(c);
      setGroup(["z", "j", "v"].filter(x => now.has(x)).join(""));
    });
    langs.appendChild(b);
  });
  box.appendChild(langs);
}

function setGroup(cat) {
  state.group = cat;
  renderGroupButtons();
  refresh();
}

function setView(view) {
  state.view = view;
  document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === view)));
  $("map-wrap").hidden = view !== "map";
  $("list-wrap").hidden = view !== "list";
  refresh();
}

function refresh() {
  updateStatus();
  if (state.view === "map") relayoutMap();
  else renderList();
}

// ---------- 3D map (map3d.js), with the flat map below as a fallback when WebGL isn't available ----------

let map3d = null;
let flyNext = false;   // after the next selection, move the 3D camera to the word

// How a word looks in the map: 0 faded (not in the current filter), 1 normal, 2 highlighted
function lookOf(i) {
  const w = WORDS[i];
  if (state.group !== null && w[CAT] !== state.group) return 0;
  if (state.matchSet) return state.matchSet.has(i) ? 2 : 0;
  if (state.everyday) return isEveryday(w) ? 2 : 0;
  return 1;
}

function showTooltip(i, x, y) {
  if (i < 0) { tooltip.hidden = true; return; }
  const wrap = $("map-wrap");
  tooltip.textContent = WORDS[i][HANGUL] + " (" + KO_ROMAN[i] + ") " + WORDS[i][HANJA] + " · " + englishShort(WORDS[i][KO_MEANING]);
  tooltip.hidden = false;
  tooltip.style.left = Math.max(4, Math.min(x + 14, wrap.clientWidth - tooltip.offsetWidth - 4)) + "px";
  tooltip.style.top = Math.min(y + 16, wrap.clientHeight - 28) + "px";
}

function redrawMap() {
  if (map3d) {
    map3d.update({ group: state.group, selected: state.selected, flyToSelected: flyNext });
    flyNext = false;
  } else draw();
}

function relayoutMap() {
  if (map3d) { map3d.render(); redrawMap(); }
  else { buildLayout(); draw(); }
}

function selectAndFly(i) { flyNext = true; select(i); }

function startMap3D() {
  map3d = createMap3D($("map-wrap"), {
    words: WORDS,
    catOf: i => WORDS[i][CAT],
    groups: GROUP_ORDER,
    groupName,
    countOf: cat => COUNTS[cat] || 0,
    langName: c => LANG_NAME[c],
    labelOf: i => [WORDS[i][HANGUL] + " " + WORDS[i][HANJA], englishShort(WORDS[i][KO_MEANING])],
    hangulOf: i => WORDS[i][HANGUL],
    hanjaOf: i => WORDS[i][HANJA],
    levelOf: i => WORDS[i][LEVEL],
    look: lookOf,
    pickable: i => lookOf(i) > 0,
    currentGroup: () => state.group,
    onHover: showTooltip,
    onSelect: i => select(i),
    onOpen: i => openWord(i),
    onGroup: cat => setGroup(cat)
  });
  if (!map3d) { $("map-note").hidden = false; return; }
  $("map").hidden = true;
  $("map-wrap").classList.add("is-3d");
  $("zoom-in").addEventListener("click", () => map3d.zoom(0.6));
  $("zoom-out").addEventListener("click", () => map3d.zoom(1.6));
  $("reset-view").addEventListener("click", () => map3d.home());
}

// ---------- Map layout ----------

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildLayout() {
  const wrap = $("map-wrap");
  const width = wrap.clientWidth, height = wrap.clientHeight;
  if (!width || !height) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const circles = {};
  const colX = [];
  let s, top = state.group === null ? 36 : 16;
  const labelH = 30, gap = 14, side = 16;

  if (state.group !== null) {
    // One group, as large as fits
    const count = COUNTS[state.group] || 0;
    const r =Math.max(20, Math.min(width / 2 - side, (height - top - labelH - 10) / 2));
    circles[state.group] = { x: width / 2, y: top + r, r };
    s = r / Math.sqrt(Math.max(count, 1));
  } else {
    // All groups: every circle's area is proportional to its word count, r = s * sqrt(count)
    const fits = s => {
      let w = side * 2 + gap * (COLUMNS.length - 1);
      for (const col of COLUMNS) {
        const rs = col.groups.map(g => s * Math.sqrt(COUNTS[g] || 0));
        w += Math.max(...rs.map(r => 2 * r), 110);
        const h = top + rs.reduce((sum, r) => sum + 2 * r + labelH, 0) + gap * (rs.length - 1);
        if (h > height - 6) return false;
      }
      return w <= width;
    };
    let lo = 0, hi = 60;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    s = lo;
    const colWidths = COLUMNS.map(col => Math.max(...col.groups.map(g => 2 * s * Math.sqrt(COUNTS[g] || 0)), 110));
    const totalW = colWidths.reduce((a, b) => a + b, 0) + gap * (COLUMNS.length - 1);
    let x = (width - totalW) / 2;
    COLUMNS.forEach((col, ci) => {
      const cx = x + colWidths[ci] / 2;
      colX.push(cx);
      const rs = col.groups.map(g => s * Math.sqrt(COUNTS[g] || 0));
      const colH = rs.reduce((sum, r) => sum + 2 * r + labelH, 0) + gap * (rs.length - 1);
      let y = top + Math.max(0, (height - top - 6 - colH) / 2);
      col.groups.forEach((g, gi) => {
        circles[g] = { x: cx, y: y + rs[gi], r: rs[gi] };
        y += 2 * rs[gi] + labelH + gap;
      });
      x += colWidths[ci] + gap;
    });
  }

  // Place each word at a random spot in its circle (same seed, so positions are stable)
  const rand = seededRandom(7);
  const xs = new Float32Array(WORDS.length), ys = new Float32Array(WORDS.length);
  const shown = new Uint8Array(WORDS.length);
  WORDS.forEach((w, i) => {
    let px, py;
    do { px = rand() * 2 - 1; py = rand() * 2 - 1; } while (px * px + py * py > 1);
    const c = circles[w[CAT]];
    if (!c) return;
    shown[i] = 1;
    xs[i] = c.x + px * c.r * 0.97;
    ys[i] = c.y + py * c.r * 0.97;
  });

  const cell = 12, grid = new Map();
  for (let i = 0; i < WORDS.length; i++) {
    if (!shown[i]) continue;
    const key = Math.floor(xs[i] / cell) + "," + Math.floor(ys[i] / cell);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }

  const dot = Math.min(5, Math.max(0.8, s * 0.6));
  layout = { width, height, circles, colX, xs, ys, shown, grid, cell, dot };
}

// ---------- Map drawing ----------

function draw() {
  if (!layout) return;
  const { width, height, circles, colX, xs, ys, shown, dot } = layout;
  ctx.clearRect(0, 0, width, height);

  const faint = [], strong = [];
  for (let i = 0; i < WORDS.length; i++) {
    if (!shown[i]) continue;
    const isStrong = state.matchSet ? state.matchSet.has(i) : state.everyday ? isEveryday(WORDS[i]) : true;
    (isStrong ? strong : faint).push(i);
  }
  const drawDots = (list, style) => {
    ctx.fillStyle = style;
    ctx.beginPath();
    list.forEach(i => { ctx.moveTo(xs[i] + dot, ys[i]); ctx.arc(xs[i], ys[i], dot, 0, Math.PI * 2); });
    ctx.fill();
  };
  drawDots(faint, "rgba(0,0,0,0.10)");
  drawDots(strong, state.matchSet || state.everyday ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.5)");

  // Circles and labels
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  Object.entries(circles).forEach(([g, c]) => {
    ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(c.r, 2), 0, Math.PI * 2); ctx.stroke();
    ctx.font = "600 13px Inter, system-ui, sans-serif";
    ctx.fillText(groupName(g), c.x, c.y + c.r + 15);
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.fillText((COUNTS[g] || 0).toLocaleString() + " words", c.x, c.y + c.r + 28);
  });
  ctx.font = "600 14px Inter, system-ui, sans-serif";
  if (state.group === null) {
    COLUMNS.forEach((col, ci) => ctx.fillText(col.title, colX[ci], 20));
  }

  // Selected word
  if (state.selected >= 0 && shown[state.selected]) {
    const x = xs[state.selected], y = ys[state.selected];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, dot + 6, 0, Math.PI * 2); ctx.stroke();
    const label = wordLabel(state.selected);
    ctx.font = "500 15px Inter, system-ui, sans-serif";
    const w = ctx.measureText(label).width + 12;
    const lx = Math.min(Math.max(x - w / 2, 2), width - w - 2);
    const ly = y - dot - 34 < 2 ? y + dot + 10 : y - dot - 34;
    ctx.fillStyle = "#fff"; ctx.fillRect(lx, ly, w, 24);
    ctx.strokeRect(lx, ly, w, 24);
    ctx.fillStyle = "#000"; ctx.textAlign = "left";
    ctx.fillText(label, lx + 6, ly + 17);
  }
}

// ---------- Map interaction ----------

function nearestWord(x, y) {
  const { grid, cell, xs, ys } = layout;
  const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  let best = -1, bestD = 8 * 8;
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      (grid.get(gx + "," + gy) || []).forEach(i => {
        const d = (xs[i] - x) ** 2 + (ys[i] - y) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
    }
  }
  return best;
}

// The group whose name label (below its circle) is under the pointer;
// with circles = true, also the group whose circle is under the pointer
function groupAt(x, y, circles) {
  for (const [g, c] of Object.entries(layout.circles)) {
    const inCircle = (x - c.x) ** 2 + (y - c.y) ** 2 <= c.r ** 2;
    const onLabel = Math.abs(x - c.x) < 80 && y > c.y + c.r && y < c.y + c.r + 32;
    if (onLabel || (circles && inCircle)) return g;
  }
  return undefined;
}

function pointer(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

canvas.addEventListener("mousemove", e => {
  if (!layout) return;
  const [x, y] = pointer(e);
  const i = nearestWord(x, y);
  if (i >= 0) {
    showTooltip(i, x, y);
    canvas.style.cursor = "pointer";
    return;
  }
  tooltip.hidden = true;
  const g = state.group === null ? groupAt(x, y, false) : undefined;
  canvas.style.cursor = g !== undefined ? "zoom-in" : "crosshair";
  canvas.title = g !== undefined ? "View " + groupName(g) + " by itself" : "";
});
canvas.addEventListener("mouseleave", () => { tooltip.hidden = true; });
canvas.addEventListener("click", e => {
  if (!layout) return;
  const [x, y] = pointer(e);
  const i = nearestWord(x, y);
  if (i >= 0) { select(i); return; }
  if (state.group === null) {
    const g = groupAt(x, y, false);
    if (g !== undefined) setGroup(g);
  }
});
// Double-clicking a dot opens that word's page; double-clicking elsewhere in a circle views that group by itself
canvas.addEventListener("dblclick", e => {
  if (!layout) return;
  const [x, y] = pointer(e);
  const i = nearestWord(x, y);
  if (i >= 0) { openWord(i); return; }
  if (state.group !== null) return;
  const g = groupAt(x, y, true);
  if (g !== undefined) setGroup(g);
});

// ---------- List view ----------

const LIST_CHUNK = 240;
let listItems = [], listShown = 0;

function renderList() {
  listItems = visibleWords();
  listShown = 0;
  $("list").innerHTML = "";
  appendListChunk();
  $("list-wrap").scrollTop = 0;
}

function appendListChunk() {
  const box = $("list");
  const frag = document.createDocumentFragment();
  listItems.slice(listShown, listShown + LIST_CHUNK).forEach(i => frag.appendChild(card(i)));
  box.appendChild(frag);
  listShown = Math.min(listItems.length, listShown + LIST_CHUNK);
  $("list-end").textContent = !listItems.length
    ? "No words match these filters."
    : listShown < listItems.length
      ? "Showing " + listShown.toLocaleString() + " of " + listItems.length.toLocaleString() + " · scroll for more"
      : listItems.length.toLocaleString() + " words";
}

function card(i) {
  const w = WORDS[i];
  const b = document.createElement("button");
  b.type = "button";
  b.className = "card";
  b.dataset.index = i;
  b.setAttribute("aria-pressed", String(state.selected === i));
  const ko = document.createElement("div");
  ko.className = "ko";
  ko.textContent = w[HANGUL] + " " + w[HANJA];
  const roman = document.createElement("div");
  roman.className = "roman";
  roman.textContent = KO_ROMAN[i];
  const gloss = document.createElement("div");
  gloss.className = "gloss";
  gloss.textContent = englishShort(w[KO_MEANING]);
  const tags = document.createElement("div");
  tags.className = "tags";
  [["z", "ZH", "Chinese"], ["j", "JA", "Japanese"], ["v", "VI", "Vietnamese"]].forEach(([c, label, name]) => {
    const t = document.createElement("span");
    t.textContent = label;
    const on = w[CAT].includes(c);
    if (!on) t.className = "off";
    t.title = (on ? "Also a word in " : "Not a word in ") + name;
    tags.appendChild(t);
  });
  b.append(ko, roman, gloss, tags);
  b.title = "Double-click to open this word's page";
  b.addEventListener("click", () => select(i));
  b.addEventListener("dblclick", () => openWord(i));
  return b;
}

$("list-wrap").addEventListener("scroll", () => {
  const el = $("list-wrap");
  if (listShown < listItems.length && el.scrollTop + el.clientHeight > el.scrollHeight - 400) appendListChunk();
});

// ---------- Detail panel ----------

// Converts numbered pinyin ("xue2 xiao4") to tone marks ("xué xiào")
function pinyinMarks(s) {
  const marks = { a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", "ü": "ǖǘǚǜ" };
  return s.split(" ").map(syl => {
    const m = syl.match(/^([a-zA-Zü:]+)([1-5])$/);
    if (!m) return syl;
    let [, base, tone] = m;
    base = base.replace("u:", "ü").replace("v", "ü");
    if (tone === "5") return base;
    const t = Number(tone) - 1;
    const lower = base.toLowerCase();
    let idx = lower.search(/[ae]/);
    if (idx < 0 && lower.includes("ou")) idx = lower.indexOf("o");
    if (idx < 0) {
      for (let k = lower.length - 1; k >= 0; k--) if ("aeiouü".includes(lower[k])) { idx = k; break; }
    }
    if (idx < 0) return base;
    const ch = lower[idx];
    const marked = marks[ch][t];
    return base.slice(0, idx) + (base[idx] === ch ? marked : marked.toUpperCase()) + base.slice(idx + 1);
  }).join(" ");
}

// A short English gloss for labels: "A promise" -> "promise"
function englishShort(m) {
  const first = m.split(/[;,]/)[0].replace(/\([^)]*\)/g, "").replace(/^(a|an|the|to) /i, "").trim();
  return first || m.replace(/[()]/g, "").trim();
}

// "학교 學校 · school", leaving out the gloss when there isn't one
function wordLabel(i) {
  const g = englishShort(WORDS[i][KO_MEANING]);
  return WORDS[i][HANGUL] + " " + WORDS[i][HANJA] + (g ? " · " + g : "");
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function makeLink(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

// The intro shown in the side panel when no word is selected
function renderIntro() {
  const panel = $("detail");
  panel.innerHTML = "";
  const box = el("div", "intro");
  box.appendChild(el("h2", "", "Korean words, shared across Asia"));
  box.appendChild(el("p", "", "For centuries, Korean, Chinese, Japanese, and Vietnamese were all written with Chinese characters. " +
    "Each dot, tile, or card is a Korean word built from those characters, called Hanja. Select one to see whether the same characters " +
    "are also a word in Chinese, Japanese, and Vietnamese, what they mean there, and how they sound."));
  box.appendChild(el("p", "", "You don't need to read any of these languages. Search in English, or try:"));
  const ex = el("div", "examples");
  ["school", "promise", "學校", "hakgyo", "がっこう", "học hiệu"].forEach(q => {
    const b = el("button", "", q);
    b.type = "button";
    b.addEventListener("click", () => { $("search").value = q; runSearch(q, true); });
    ex.appendChild(b);
  });
  box.appendChild(ex);
  box.appendChild(el("p", "legend", "Map: each dot is a word. Clouds group the words by which languages share them, sized by word count; " +
    "the higher a cloud, the more languages share it. On a trackpad, swipe with two fingers to turn the map, hold Shift to move it, and pinch to zoom; with a mouse, drag to turn and scroll to zoom. " +
    "Zoom in close to read the nearest words. Open one group (click its name, or switch languages above) to see its words as tiles in layers, from everyday words to specialized ones; scroll to move through the layers. " +
    "List: the same words as cards, everyday words first. Double-click any word to open its own page."));
  const about = el("button", "", "More about this site");
  about.type = "button";
  about.addEventListener("click", () => openAbout());
  box.appendChild(about);
  panel.appendChild(box);
}

function select(i) {
  state.selected = i;
  const w = WORDS[i];

  // If the word isn't in the group being viewed, show all groups
  if (state.group !== null && w[CAT] !== state.group) { state.group = null; renderGroupButtons(); refresh(); }

  const panel = $("detail");
  panel.innerHTML = "";
  panel.scrollTop = 0;

  const close = el("button", "close", "Close");
  close.type = "button";
  close.setAttribute("aria-label", "Close word details");
  close.addEventListener("click", deselect);
  panel.appendChild(close);

  panel.appendChild(el("h2", "", "“" + englishShort(w[KO_MEANING]) + "”"));
  panel.appendChild(el("div", "headword", w[HANGUL] + " " + w[HANJA]));
  panel.appendChild(el("p", "summary", sharedSentence(w[CAT]) +
    (w[LEVEL] ? " Korea's Basic Korean Dictionary lists it as " + (w[LEVEL] === "intermediate" ? "an " : "a ") + w[LEVEL] + "-level word." : "")));

  // How the same characters sound in each language that shares them
  const sounds = [["Korean", KO_ROMAN[i]]];
  if (w[VI_WORD]) sounds.push(["Vietnamese", w[VI_WORD]]);
  if (w[JP_MEANING]) sounds.push(["Japanese", JP_ROMAN[i]]);
  if (w[YUE]) sounds.push(["Cantonese", w[YUE].replace(/[1-6]/g, "")]);
  if (w[ZH_MEANING]) sounds.push(["Mandarin", pinyinMarks(w[ZH_PINYIN])]);
  if (sounds.length > 1) {
    const table = el("table", "sounds");
    const cap = el("caption", "visually-hidden", "How " + w[HANJA] + " sounds in each language");
    table.appendChild(cap);
    sounds.forEach(([lang, text]) => {
      const tr = document.createElement("tr");
      tr.append(el("th", "", lang), el("td", "", text));
      table.appendChild(tr);
    });
    panel.appendChild(table);
  }

  const open = el("button", "open-page", "Open full page →");
  open.type = "button";
  open.addEventListener("click", () => openWord(i));
  panel.appendChild(open);

  appendLangSections(panel, i);

  const more = el("p");
  more.appendChild(makeLink("https://en.wiktionary.org/wiki/" + encodeURIComponent(w[HANJA]), "Look up " + w[HANJA] + " on Wiktionary"));
  panel.appendChild(more);
  panel.appendChild(voicesNote());

  // Keep the list and map in step with the selection
  document.querySelectorAll(".card[aria-pressed='true']").forEach(c => c.setAttribute("aria-pressed", "false"));
  const c = document.querySelector('.card[data-index="' + i + '"]');
  if (c) { c.setAttribute("aria-pressed", "true"); }
  if (state.view === "map") redrawMap();
}

function voicesNote() {
  const voices = el("details", "voices");
  voices.appendChild(el("summary", "", "About the Listen buttons"));
  voices.appendChild(el("p", "", "When a native speaker has recorded a word on Lingua Libre or Wikimedia Commons, Listen plays their " +
    "recording. Otherwise it uses your device's built-in voice, which may sound robotic or misread a word (Japanese is read from its " +
    "kana spelling). A grayed-out button means there's no recording and no voice for that language on this device."));
  voices.appendChild(el("p", "", "Voices on this device: " + voiceSummary()));
  return voices;
}

// The Korean, Chinese, Japanese, and Vietnamese sections for a word, used by the side panel and the word page
function appendLangSections(box, i) {
  const w = WORDS[i];
  box.appendChild(langSection("Korean", w[HANGUL] + " " + w[HANJA], KO_ROMAN[i], w[KO_MEANING],
    w[KO_SOURCE].includes("k") ? "From the Basic Korean Dictionary." : "From kengdic only, a community dictionary.",
    [{ text: w[HANGUL], lang: "ko", forms: [w[HANGUL]] }]));

  box.appendChild(w[ZH_MEANING]
    ? langSection("Chinese",
        zhForm(w) + (w[ZH_SIMPLIFIED] && w[ZH_SIMPLIFIED] !== zhForm(w) ? " · simplified " + w[ZH_SIMPLIFIED] : ""),
        "Mandarin " + pinyinMarks(w[ZH_PINYIN]) + (w[YUE] ? " · Cantonese " + w[YUE] : ""), w[ZH_MEANING],
        w[ZH_FORM] ? "Chinese writes " + w[HANJA] + " with a different form of the same character" + (Array.from(w[HANJA]).filter((c, k) => c !== Array.from(w[ZH_FORM])[k]).length > 1 ? "s" : "") + ": " + w[ZH_FORM] + "." : "",
        [{ text: w[ZH_SIMPLIFIED] || zhForm(w), lang: "zh", label: "Mandarin",
           forms: [w[ZH_SIMPLIFIED], zhForm(w), pinyinMarks(w[ZH_PINYIN]).replace(/ /g, "")] },
         { text: w[YUE] ? zhForm(w) : "", lang: "yue", label: "Cantonese",
           forms: w[YUE] ? [zhForm(w), w[YUE].replace(/ /g, "")] : [] }])
    : missingSection("Chinese", "Not a word in the Chinese dictionary used here (CC-CEDICT)."));

  box.appendChild(w[JP_MEANING]
    ? langSection("Japanese", w[JP_FORM], w[JP_READING] + " · " + JP_ROMAN[i], w[JP_MEANING],
        w[JP_FORM] !== w[HANJA] ? "Japan writes some of these characters in a simpler modern form." : "",
        [{ text: w[JP_READING], lang: "ja", forms: [w[JP_FORM], w[JP_READING], romajiWithMacrons(JP_ROMAN[i])] }])
    : missingSection("Japanese", "Not a word in the Japanese dictionary used here (JMdict)."));

  if (w[VI_MEANING]) {
    const vi = langSection("Vietnamese", w[VI_WORD], "", w[VI_MEANING], "Matched by its Sino-Vietnamese reading.",
      [{ text: w[VI_WORD], lang: "vi", forms: [w[VI_WORD]] }]);
    box.appendChild(vi);
    checkVietnamese(i, vi);
  } else {
    box.appendChild(missingSection("Vietnamese", "No Vietnamese word with this reading was found in the dictionary used here."));
  }
}

function deselect() {
  state.selected = -1;
  document.querySelectorAll(".card[aria-pressed='true']").forEach(c => c.setAttribute("aria-pressed", "false"));
  renderIntro();
  if (state.view === "map") redrawMap();
}

function langSection(lang, word, reading, meaning, note, say) {
  const sec = el("section", "lang");
  sec.appendChild(el("h3", "", lang));
  sec.appendChild(el("div", "word", word));
  if (reading) sec.appendChild(el("div", "reading", reading));
  sec.appendChild(el("p", "meaning", meaning));
  say.forEach(x => { if (x.text) sec.appendChild(speakButton(x.text, x.lang, x.label, x.forms)); });
  if (note) sec.appendChild(el("small", "note", note));
  return sec;
}

function missingSection(lang, text) {
  const sec = el("section", "lang missing");
  sec.appendChild(el("h3", "", lang));
  sec.appendChild(el("span", "missing-text", text));
  return sec;
}

// Vietnamese words are matched by sound, so check Wiktionary live to see which
// characters it lists for the Vietnamese word, and say if they differ.
const viCheckCache = {};
async function checkVietnamese(i, section) {
  const w = WORDS[i];
  const status = el("small", "note", "Checking Wiktionary…");
  section.appendChild(status);
  try {
    if (!(w[VI_WORD] in viCheckCache)) {
      const url = "https://en.wiktionary.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&redirects=1&origin=*&page=" +
        encodeURIComponent(w[VI_WORD]);
      const json = await fetch(url).then(r => r.json());
      let han = [];
      if (!json.error) {
        const doc = new DOMParser().parseFromString(json.parse.text, "text/html");
        doc.querySelectorAll("style").forEach(s => s.remove());
        const text = doc.body.textContent;
        const start = text.indexOf("Vietnamese");
        const part = start >= 0 ? text.slice(start, start + 4000) : "";
        han = Array.from(new Set(part.match(/[一-鿿㐀-䶿]{2,}/g) || []));
      }
      viCheckCache[w[VI_WORD]] = han;
    }
    if (state.selected !== i) return;
    const han = viCheckCache[w[VI_WORD]];
    const forms = [w[HANJA], w[JP_FORM], w[ZH_SIMPLIFIED], w[ZH_FORM]].filter(Boolean);
    status.textContent = "";
    if (han.some(h => forms.includes(h))) {
      status.appendChild(document.createTextNode("Wiktionary confirms it's written " + w[HANJA] + ". "));
    } else if (han.length) {
      status.appendChild(document.createTextNode("Wiktionary writes this word " + han.slice(0, 3).join(", ") +
        ", so it may be a different word that sounds the same, or a variant spelling. "));
    } else {
      status.appendChild(document.createTextNode("Wiktionary doesn't list characters for this word. "));
    }
    status.appendChild(makeLink("https://en.wiktionary.org/wiki/" + encodeURIComponent(w[VI_WORD]), "See it on Wiktionary"));
  } catch (e) {
    if (state.selected === i) status.textContent = "Couldn't reach Wiktionary to check this match.";
  }
}

// ---------- Search ----------

// Words matching a search in any of the languages, in romanized spelling, or in English.
// Exact matches come first, then words that start with the search, then others; everyday words first in each.
function findMatches(q) {
  const isHangul = /[가-힣]/.test(q);
  const isKana = /[぀-ヿ]/.test(q);
  const isHan = /[一-鿿]/.test(q);
  const lower = q.toLowerCase();
  const loose = looseRoman(q);
  const pin = plainPinyin(q);
  const viKey = plainVietnamese(q);
  const hasViMarks = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(q);
  const wordRe = new RegExp("\\b" + lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const kana = toHiragana(q);
  const ranked = [[], [], []];

  WORDS.forEach((w, i) => {
    let rank = -1;
    const test = (value, key) => {
      if (!value) return;
      if (value === key) rank = 0;
      else if (value.startsWith(key)) rank = rank < 0 || rank > 1 ? 1 : rank;
      else if (value.includes(key)) rank = rank < 0 ? 2 : rank;
    };
    if (isHangul) test(w[HANGUL], q);
    else if (isKana) test(KEY_JP_KANA[i], kana);
    else if (isHan) { test(w[HANJA], q); test(w[JP_FORM], q); test(w[ZH_SIMPLIFIED], q); test(w[ZH_FORM], q); }
    else if (hasViMarks) {
      if (w[VI_WORD] && w[VI_WORD].toLowerCase() === lower) rank = 0;
      else if (w[VI_WORD] && w[VI_WORD].toLowerCase().startsWith(lower)) rank = 1;
    } else {
      [[KEY_KO[i], loose], [KEY_JP[i], loose], [KEY_ZH[i], pin], [KEY_VI[i], viKey], [KEY_YUE[i], pin]].forEach(([value, key]) => {
        if (!key || key.length < 2 || !value) return;
        if (value === key) rank = 0;
        else if (value.startsWith(key) && key.length >= 3 && rank !== 0) rank = 1;
      });
      if (rank < 0) {
        const meanings = [w[KO_MEANING], w[ZH_MEANING], w[JP_MEANING], w[VI_MEANING]].map(m => m.toLowerCase());
        if (meanings[0] === lower || englishShort(meanings[0]).toLowerCase() === lower) rank = 0;
        else if (meanings.some(m => wordRe.test(m))) rank = 2;
      }
    }
    if (rank >= 0) ranked[rank].push(i);
  });

  const byLevel = (a, b) => (LEVEL_ORDER[WORDS[a][LEVEL]] ?? 3) - (LEVEL_ORDER[WORDS[b][LEVEL]] ?? 3);
  return { list: ranked.flatMap(r => r.sort(byLevel)), exact: ranked[0].length };
}

// Runs a search: highlights matches in the map, filters the list, and shows suggestions.
// pick = select the best match right away (for example after pressing Enter)
function runSearch(q, pick) {
  q = q.trim();
  state.query = q;
  if (!q) {
    state.matches = null;
    state.matchSet = null;
    hideSuggestions();
    refresh();
    return;
  }
  const { list, exact } = findMatches(q);
  state.matches = list;
  state.matchSet = new Set(list);
  refresh();
  if (pick || exact === 1) {
    hideSuggestions();
    if (list.length) selectAndFly(list[0]);
  } else {
    showSuggestions(list, q);
  }
}

let suggestionIndex = -1;

function showSuggestions(list, q) {
  const box = $("suggestions");
  box.innerHTML = "";
  suggestionIndex = -1;
  if (!list.length) {
    box.appendChild(el("div", "more", "No words match “" + q + "”. Try another spelling or an English word."));
  } else {
    list.slice(0, 8).forEach((i, n) => {
      const b = el("button", "", wordLabel(i));
      b.type = "button";
      b.setAttribute("role", "option");
      b.addEventListener("mousedown", e => e.preventDefault());   // keep focus in the search box
      b.addEventListener("click", () => { hideSuggestions(); selectAndFly(i); });
      box.appendChild(b);
    });
    if (list.length > 8) {
      box.appendChild(el("div", "more", list.length.toLocaleString() + " matches · all are highlighted in the map and shown in the list"));
    }
  }
  box.hidden = false;
  $("search").setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  $("suggestions").hidden = true;
  $("search").setAttribute("aria-expanded", "false");
}

let searchTimer = null;
$("search").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => runSearch(e.target.value, false), 200);
});
$("search").addEventListener("keydown", e => {
  const options = Array.from($("suggestions").querySelectorAll("button"));
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if ($("suggestions").hidden || !options.length) return;
    e.preventDefault();
    suggestionIndex = (suggestionIndex + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options.forEach((o, n) => o.setAttribute("aria-selected", String(n === suggestionIndex)));
  } else if (e.key === "Enter") {
    e.preventDefault();
    clearTimeout(searchTimer);
    if (suggestionIndex >= 0 && options[suggestionIndex]) options[suggestionIndex].click();
    else runSearch(e.target.value, true);
  } else if (e.key === "Escape") {
    hideSuggestions();
  }
});
$("search").addEventListener("blur", () => setTimeout(hideSuggestions, 150));
$("search").addEventListener("focus", () => { if (state.matches && state.query) showSuggestions(state.matches, state.query); });

// ---------- Other controls ----------

$("everyday").addEventListener("click", e => {
  state.everyday = !state.everyday;
  e.currentTarget.setAttribute("aria-pressed", String(state.everyday));
  refresh();
});
$("random").addEventListener("click", () => {
  const pool = visibleWords().filter(i => !state.everyday || isEveryday(WORDS[i]));
  const from = pool.length ? pool : WORDS.map((_, i) => i);
  selectAndFly(from[Math.floor(Math.random() * from.length)]);
});
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

$("about-open").addEventListener("click", () => openAbout());
$("about-nav").addEventListener("click", () => openAbout());

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.view === "map" && !map3d) { buildLayout(); draw(); } }, 150);
});

// ---------- Sound history ----------
// Explains, for one character, the regular sound changes that separate the languages, starting from its
// Tang-era reading (TANG, from characters.js). Only rules that the readings actually show are mentioned.

// Final and initial consonants of a Hangul syllable, romanized
function koParts(syl) {
  const code = syl ? syl.charCodeAt(0) - 0xAC00 : -1;
  if (code < 0 || code > 11171) return null;
  const f = code % 28, ini = Math.floor(code / 588);
  const FINAL = { 1: "k", 8: "l", 16: "m", 17: "p", 4: "n", 21: "ng" };
  const INITIAL = { 0: "g", 1: "kk", 15: "k", 18: "h" };
  return { final: FINAL[f] || "", initial: INITIAL[ini] || "", roman: romanizeKorean(syl) };
}

const plain = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[0-9*]/g, "").toLowerCase();
const joinList = a => a.length < 3 ? a.join(" and ") : a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];

function soundNotes(c, koSyl, vi, yue, zh) {
  const notes = [];
  const tang = plain(TANG[c]);
  if (!tang) return notes;
  const ko = koParts(koSyl);
  const v = plain(vi), y = plain(yue), z = plain(zh);
  const end = (tang.match(/(p|t|k|m)$/) || [])[1];
  const VI_END = { p: /p$/, t: /t$/, k: /(c|ch)$/, m: /m$/ };

  if (end && "ptk".includes(end)) {
    const kept = [], examples = [];
    if (ko && ko.final === end) { kept.push("Korean"); examples.push(ko.roman); }
    if (y && y.endsWith(end)) { kept.push("Cantonese"); examples.push(y); }
    if (v && VI_END[end].test(v)) { kept.push("Vietnamese"); examples.push(vi); }
    notes.push("The Tang-era reading ends in a short, clipped -" + end + "." +
      (kept.length ? " " + joinList(kept) + (kept.length > 1 ? " keep" : " keeps") + " it (" + examples.join(", ") + ")." : ""));
    if (end === "t" && ko && ko.final === "l") notes.push("Korean regularly turned this -t into -l: " + ko.roman + ". The same change gives " +
      joinList([["日", "il"], ["月", "wol"], ["八", "pal"], ["一", "il"]].filter(([ch]) => ch !== c).slice(0, 3).map(([ch, r]) => ch + " " + r)) + ".");
    if (z && !/[ptk]$/.test(z)) notes.push("Mandarin lost these endings entirely, which is a big reason it often sounds the least like the others: " + pinyinMarks(zh) + ".");
    notes.push(end === "p"
      ? "Japanese can't end a syllable in -p, so it became a vowel and later merged into a long vowel (十: Tang zhip, Japanese jū)."
      : "Japanese can't end a syllable in -" + end + ", so it usually adds a vowel: " +
        (end === "k" ? "-ku or -ki (" + (c === "學" ? "國: koku" : "學: gaku") + ")." : "-tsu or -chi (" + (c === "日" ? "八: hachi" : "日: nichi, jitsu") + ")."));
  } else if (end === "m") {
    const kept = [], examples = [];
    if (ko && ko.final === "m") { kept.push("Korean"); examples.push(ko.roman); }
    if (y && y.endsWith("m")) { kept.push("Cantonese"); examples.push(y); }
    if (v && v.endsWith("m")) { kept.push("Vietnamese"); examples.push(vi); }
    notes.push("The Tang-era reading ends in -m." + (kept.length ? " " + joinList(kept) + (kept.length > 1 ? " keep" : " keeps") + " it (" + examples.join(", ") + ")." : ""));
    if (z && z.endsWith("n")) notes.push("Mandarin and Japanese merged this -m into -n: Mandarin " + pinyinMarks(zh) + ".");
  }

  if (z && /^[jqx]/.test(z) && ko && ["g", "k", "kk", "h"].includes(ko.initial)) {
    notes.push("Mandarin's j, q, and x sounds grew out of older g, k, and h sounds before i and ü. Korean keeps the older sound (" + ko.roman + ")" +
      (y && /^[gkh]/.test(y) ? ", and so does Cantonese (" + y + ")." : "."));
  }
  return notes;
}

// ---------- Word pages ----------
// Each word has its own page at #word/<hangul>_<hanja>, so it can be bookmarked or shared,
// and the browser's back button returns to the gallery as it was left.

let pageIndex = -1;        // word shown on its own page, or -1
let onSubpage = false;     // a word page or the About page is showing, instead of the gallery
let lastWord = -1;         // the last word page seen, to keep it selected back in the gallery
let listScroll = 0;
let galleryDirty = false;   // the group was changed from a word page, so redraw on return

function wordHash(i) { return "#word/" + encodeURIComponent(WORDS[i][HANGUL] + "_" + WORDS[i][HANJA]); }

function wordFromHash() {
  const m = location.hash.match(/^#word\/(.+)$/);
  if (!m) return -1;
  const [h, hj] = decodeURIComponent(m[1]).split("_");
  return WORDS.findIndex(w => w[HANGUL] === h && w[HANJA] === hj);
}

// history.state.depth counts the word pages opened since leaving the gallery,
// so Back can return straight to the gallery, while the browser's back button steps back one page
function openSubpage(hash) {
  if (location.hash === hash) return;
  let depth = 1;
  if (!onSubpage) listScroll = $("list-wrap").scrollTop;
  else depth = ((history.state && history.state.depth) || 0) + 1;
  history.pushState({ depth }, "", hash);
  route();
}
function openWord(i) { openSubpage(wordHash(i)); }
function openAbout() { openSubpage("#about"); }

function backToGallery() {
  const depth = (history.state && history.state.depth) || 0;
  if (depth > 0) history.go(-depth);   // route() runs on popstate
  else { history.replaceState(null, "", location.pathname + location.search); route(); }
}

// Shows the gallery, a word page (#word/...), or the About page (#about), depending on the address
function route() {
  const i = wordFromHash();
  const about = location.hash === "#about";
  const sub = i >= 0 || about;
  document.body.classList.toggle("on-subpage", sub);
  $("word-page").hidden = !sub;
  $("word-content").hidden = !(i >= 0);
  $("about-content").hidden = !about;
  $("about-nav").setAttribute("aria-pressed", String(about));
  [document.querySelector(".topbar"), document.querySelector(".layout")].forEach(e => { e.hidden = sub; });
  pageIndex = i;

  if (sub) {
    onSubpage = true;
    if (i >= 0) { lastWord = i; renderWordPage(i); }
    else document.title = "About · Hanja Roots";
    $("word-page").scrollTop = 0;
    window.scrollTo(0, 0);
    $(i >= 0 ? "page-title" : "about-title").focus({ preventScroll: true });
    return;
  }

  // Back in the gallery: keep the last word selected, and restore the view as it was
  const wasSub = onSubpage, last = lastWord;
  onSubpage = false;
  lastWord = -1;
  document.title = "Hanja Roots";
  if (!wasSub) return;
  if (galleryDirty) { galleryDirty = false; refresh(); }
  if (last >= 0) select(last);
  if (state.view === "map") relayoutMap();
  else {
    $("list-wrap").scrollTop = listScroll;
    const c = last >= 0 && document.querySelector('.card[data-index="' + last + '"]');
    if (c) c.focus({ preventScroll: true });
  }
}

// Words containing each character, built the first time it's needed
let charIndex = null;
function wordsWithChar(c) {
  if (!charIndex) {
    charIndex = new Map();
    WORDS.forEach((w, i) => new Set(w[HANJA]).forEach(ch => {
      if (!charIndex.has(ch)) charIndex.set(ch, []);
      charIndex.get(ch).push(i);
    }));
  }
  return charIndex.get(c) || [];
}

// The syllable at position k of a spaced reading ("xue2 xiao4" → "xue2"), if it lines up with the characters
function syllableAt(reading, k, n) {
  const parts = (reading || "").trim().split(/\s+/);
  return parts.length === n ? parts[k] : "";
}

function wordButton(i) {
  const b = el("button", "word-chip");
  b.type = "button";
  b.append(el("span", "chip-ko", WORDS[i][HANGUL] + " " + WORDS[i][HANJA]), el("span", "chip-en", englishShort(WORDS[i][KO_MEANING])));
  const tags = el("span", "chip-tags", ["z", "j", "v"].filter(c => WORDS[i][CAT].includes(c)).map(c => ({ z: "ZH", j: "JA", v: "VI" })[c]).join(" "));
  b.appendChild(tags);
  b.addEventListener("click", () => openWord(i));
  return b;
}

function renderWordPage(i) {
  const w = WORDS[i];
  state.selected = i;   // lets the Vietnamese check finish for this word
  const page = $("word-content");
  page.innerHTML = "";
  document.title = w[HANGUL] + " " + w[HANJA] + " · " + englishShort(w[KO_MEANING]) + " · Hanja Roots";

  // Heading
  const hero = el("header", "hero");
  const title = el("h1", "hero-word");
  title.id = "page-title";
  title.tabIndex = -1;
  title.append(el("span", "hero-ko", w[HANGUL]), el("span", "hero-hanja", w[HANJA]));
  hero.appendChild(title);
  hero.appendChild(el("p", "hero-roman", KO_ROMAN[i]));
  hero.appendChild(el("p", "hero-meaning", w[KO_MEANING]));
  const facts = el("p", "hero-facts");
  const group = el("button", "fact-group", groupName(w[CAT]));
  group.type = "button";
  group.title = "See every word in this group";
  group.addEventListener("click", () => { state.group = w[CAT]; renderGroupButtons(); listScroll = 0; galleryDirty = true; backToGallery(); });
  facts.appendChild(group);
  if (w[LEVEL]) facts.appendChild(el("span", "fact", w[LEVEL][0].toUpperCase() + w[LEVEL].slice(1) + " word"));
  hero.appendChild(facts);
  hero.appendChild(el("p", "hero-summary", sharedSentence(w[CAT])));
  page.appendChild(hero);

  // How it sounds, side by side
  const sounds = [["Korean", KO_ROMAN[i], w[HANGUL]]];
  if (w[VI_WORD]) sounds.push(["Vietnamese", w[VI_WORD], w[VI_WORD]]);
  if (w[JP_MEANING]) sounds.push(["Japanese", JP_ROMAN[i], w[JP_READING]]);
  if (w[YUE]) sounds.push(["Cantonese", w[YUE].replace(/[1-6]/g, ""), w[YUE]]);
  if (w[ZH_MEANING]) sounds.push(["Mandarin", pinyinMarks(w[ZH_PINYIN]), w[ZH_SIMPLIFIED] || w[HANJA]]);
  if (sounds.length > 1) {
    const sec = el("section", "page-section");
    sec.appendChild(el("h2", "", "How it sounds"));
    const row = el("div", "sound-row");
    sounds.forEach(([lang, roman, native]) => {
      const box = el("div", "sound");
      box.append(el("span", "sound-lang", lang), el("span", "sound-roman", roman));
      if (native !== roman) box.appendChild(el("span", "sound-native", native));
      row.appendChild(box);
    });
    sec.appendChild(row);
    const tang = Array.from(w[HANJA]).map(c => TANG[c]);
    if (tang.every(Boolean)) {
      const note = el("p", "tang-note");
      note.append("These all grew out of one older pronunciation. In Tang-dynasty China (618–907), when much of this vocabulary spread, " +
        w[HANJA] + " was read roughly ", el("strong", "", tang.join(" ")), ". Each language then reshaped the sounds in its own way; see ",
        el("em", "", "The characters"), " below.");
      sec.appendChild(note);
    }
    page.appendChild(sec);
  }

  // Each language in full
  const langs = el("section", "page-section");
  langs.appendChild(el("h2", "", "In each language"));
  const grid = el("div", "lang-grid");
  appendLangSections(grid, i);
  langs.appendChild(grid);
  page.appendChild(langs);

  // The characters it's built from
  const chars = Array.from(w[HANJA]);
  const hangul = Array.from(w[HANGUL]);
  const n = chars.length;
  const charSec = el("section", "page-section");
  charSec.appendChild(el("h2", "", "The characters"));
  charSec.appendChild(el("p", "section-note", "Each character carries part of the meaning, appears in many other words, and has a sound history " +
    "that explains why it sounds the way it does in each language."));
  const charGrid = el("div", "char-grid");
  chars.forEach((c, k) => {
    const card = el("article", "char-card");
    const head = el("div", "char-head");
    head.appendChild(el("span", "char-big", c));
    const forms = [];
    if (w[ZH_SIMPLIFIED] && Array.from(w[ZH_SIMPLIFIED]).length === n && Array.from(w[ZH_SIMPLIFIED])[k] !== c) forms.push("simplified " + Array.from(w[ZH_SIMPLIFIED])[k]);
    if (w[JP_FORM] && Array.from(w[JP_FORM]).length === n && Array.from(w[JP_FORM])[k] !== c) forms.push("Japanese " + Array.from(w[JP_FORM])[k]);
    if (w[ZH_FORM] && Array.from(w[ZH_FORM]).length === n && Array.from(w[ZH_FORM])[k] !== c) forms.unshift("Chinese " + Array.from(w[ZH_FORM])[k]);
    if (forms.length) head.appendChild(el("span", "char-forms", forms.join(" · ")));
    card.appendChild(head);

    // How this character is read in this word
    const reads = [];
    if (TANG[c]) reads.push(["Tang era", TANG[c]]);
    if (hangul.length === n) reads.push(["Korean", hangul[k] + " " + romanizeKorean(hangul[k])]);
    const vi = syllableAt(w[VI_WORD], k, n); if (vi) reads.push(["Vietnamese", vi]);
    const yue = syllableAt(w[YUE], k, n); if (yue) reads.push(["Cantonese", yue]);
    const zh = syllableAt(w[ZH_PINYIN], k, n).toLowerCase(); if (zh) reads.push(["Mandarin", pinyinMarks(zh)]);
    if (reads.length) {
      const dl = el("dl", "char-reads");
      reads.forEach(([lang, r]) => dl.append(el("dt", lang === "Tang era" ? "tang" : "", lang), el("dd", lang === "Tang era" ? "tang" : "", r)));
      card.appendChild(dl);
    }
    const notes = soundNotes(c, hangul.length === n ? hangul[k] : "", vi, yue, zh);
    if (notes.length) {
      const why = el("div", "why");
      why.appendChild(el("h4", "", "Why it sounds this way"));
      const ul = el("ul");
      notes.forEach(s => ul.appendChild(el("li", "", s)));
      why.appendChild(ul);
      card.appendChild(why);
    }

    // Other words with this character
    const others = wordsWithChar(c).filter(j => j !== i);
    const shared = others.filter(j => WORDS[j][CAT]).length;
    card.appendChild(el("p", "char-count", "In " + (others.length + 1).toLocaleString() + " Korean words here" +
      (others.length ? ", " + Math.round(100 * (shared + (w[CAT] ? 1 : 0)) / (others.length + 1)) + "% shared with another language." : ".")));
    const picks = others.slice().sort((a, b) =>
      ((LEVEL_ORDER[WORDS[a][LEVEL]] ?? 3) - (LEVEL_ORDER[WORDS[b][LEVEL]] ?? 3)) || (WORDS[a][HANJA].length - WORDS[b][HANJA].length)).slice(0, 8);
    if (picks.length) {
      const list = el("div", "chip-list");
      picks.forEach(j => list.appendChild(wordButton(j)));
      card.appendChild(list);
    }
    const link = el("p", "char-link");
    link.appendChild(makeLink("https://en.wiktionary.org/wiki/" + encodeURIComponent(c), c + " on Wiktionary"));
    card.appendChild(link);
    charGrid.appendChild(card);
  });
  charSec.appendChild(charGrid);
  page.appendChild(charSec);

  // Sources and more
  const foot = el("section", "page-section page-foot");
  const more = el("p");
  more.appendChild(makeLink("https://en.wiktionary.org/wiki/" + encodeURIComponent(w[HANJA]), "Look up " + w[HANJA] + " on Wiktionary"));
  foot.appendChild(more);
  foot.appendChild(voicesNote());
  page.appendChild(foot);
}

$("back").addEventListener("click", backToGallery);
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && onSubpage) backToGallery();
});
window.addEventListener("popstate", route);

// ---------- Start ----------

renderGroupButtons();
renderIntro();
startMap3D();
refresh();
if (wordFromHash() >= 0 || location.hash === "#about") route();
