// Hanja Roots: Korean Hanja words, grouped by which other languages
// (Chinese, Japanese, Vietnamese) use the same characters as a word.
// Two views (a map of every word as a dot, and a card list), filters by group,
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
  { title: "Shared with one", groups: ["j", "z", "v"] }
];
// Korean words not found in any of the three are left out of the site (kept in backup/words-unshared.js)
const GROUP_ORDER = ["zjv", "zj", "jv", "zv", "j", "z", "v"];

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

const state = {
  view: "map",       // "map" (the summary of every word, shown first) or "list"
  group: null,       // null = every word (no language buttons on), otherwise a category ("zjv", "zj", ...)
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

// A short line beside the filters: "480 everyday words shared only with Japanese"
function shortWhere(cat) {
  if (cat === "zjv") return "shared with all three";
  return "shared only with " + joinList(Array.from(cat).map(c => LANG_NAME[c]));
}

function updateStatus() {
  const where = state.group === null ? "" : " " + shortWhere(state.group);
  const listOnly = state.everyday && state.view === "list";   // the list shows only everyday words
  const inGroup = i => state.group === null || WORDS[i][CAT] === state.group;
  let count, bare;   // bare: just the number, for phones ("21,838 words", "261 matches")
  if (state.matches) {
    const n = listOnly ? visibleWords().length : state.matches.filter(inGroup).length;
    bare = n.toLocaleString() + " match" + (n === 1 ? "" : "es");
    count = n.toLocaleString() + (listOnly ? " everyday" : "") + " match" + (n === 1 ? "" : "es") + " for “" + state.query + "”";
  } else {
    const n = listOnly ? visibleWords().length : state.group === null ? WORDS.length : (COUNTS[state.group] || 0);
    bare = n.toLocaleString() + (n === 1 ? " word" : " words");
    count = n.toLocaleString() + (listOnly ? " everyday" : "") + (n === 1 ? " word" : " words");
  }
  const tail = state.everyday && !listOnly ? ", everyday ones highlighted" : "";
  // Phones: the count sits at the end of the language buttons' row, so only the number fits
  if (window.matchMedia("(max-width: 640px)").matches) { fitStatus(bare, bare); $("status").title = count + where + tail; return; }
  // The full line, and a shorter one without the languages (the language buttons beside it already show them)
  fitStatus(count + where + tail, count + (tail ? " · everyday highlighted" : ""));
}

// Keeps the count on one line beside the filters: a long line first gets a little smaller (down to 11px);
// if it still doesn't fit, the shorter version is shown instead. The full line is always in the tooltip.
let statusTexts = ["", ""];
function fitStatus(full, short) {
  if (full !== undefined) statusTexts = [full, short];
  const st = $("status");
  st.title = statusTexts[0];
  const tryText = (text, min) => {
    st.textContent = text;
    st.style.fontSize = "";
    let size = 13;
    while (st.scrollWidth > st.clientWidth && size > min) { size -= 0.5; st.style.fontSize = size + "px"; }
    return st.scrollWidth <= st.clientWidth;
  };
  if (!tryText(statusTexts[0], 11) && st.clientWidth) tryText(statusTexts[1], 10);
}
window.addEventListener("resize", () => updateStatus());

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

// Korean is plain text (every word here is Korean), followed by a toggle for each other language.
// With none switched on, every word is shown.
function renderGroupButtons() {
  const box = $("groups");
  box.innerHTML = "";
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "Languages that share the word");
  box.appendChild(el("span", "ko-fixed", "Korean"));
  box.appendChild(el("span", "ko-plus", "+"));
  ["z", "j", "v"].forEach(c => {
    const on = state.group !== null && state.group.includes(c);
    const b = el("button", "lang-toggle lang-" + c, LANG_NAME[c]);
    b.type = "button";
    b.setAttribute("aria-pressed", String(on));
    b.dataset.lang = c;
    // Keyboard (Enter/Space) toggles one language; pointer presses are handled by the swipe below
    b.addEventListener("click", e => { if (e.detail === 0) { setPressed(b, b.getAttribute("aria-pressed") !== "true"); applyLanguageToggles(); } });
    box.appendChild(b);
  });
}

function setPressed(b, on) { b.setAttribute("aria-pressed", String(on)); }

// The filter, from whichever language buttons are pressed (none pressed = every word)
function applyLanguageToggles() {
  const cat = Array.from($("groups").querySelectorAll(".lang-toggle"))
    .filter(b => b.getAttribute("aria-pressed") === "true").map(b => b.dataset.lang).join("");
  if ((cat || null) !== state.group) setGroup(cat); else renderGroupButtons();
}

// Press one language and swipe across the others: every button passed over is set the way the first one went
// (all on, or all off), and the filter changes once, on release.
(function languageSwipe() {
  const box = $("groups");
  let paint = null;   // true = switching on, false = switching off, null = not swiping
  const toggleAt = (x, y) => { const t = document.elementFromPoint(x, y); return t && t.closest("#groups .lang-toggle"); };
  box.addEventListener("pointerdown", e => {
    const b = e.target.closest(".lang-toggle");
    if (!b || e.button > 0) return;
    e.preventDefault();
    paint = b.getAttribute("aria-pressed") !== "true";
    setPressed(b, paint);
    box.classList.add("swiping");
  });
  window.addEventListener("pointermove", e => {
    if (paint === null) return;
    const b = toggleAt(e.clientX, e.clientY);
    if (b) setPressed(b, paint);
  });
  const end = () => {
    if (paint === null) return;
    paint = null;
    box.classList.remove("swiping");
    applyLanguageToggles();
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
})();

function setGroup(cat) {
  state.group = cat || null;   // no languages chosen = every word
  renderGroupButtons();
  refresh();
}

function setView(view) {
  state.view = view;
  if (!$("detail").classList.contains("has-word")) renderIntro();
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

// ---------- Map: every word as a dot ----------
// Every word is a dot, in bands. Each band holds a set of words (for example, those shared with two languages) and has
// the same number of rows as the others, so its length shows how many words it holds. Single-language words are dots
// in that language's ink; a word shared by two or three languages carries a gradient through their inks, which slowly
// flows across its block. Hover a dot for its word, with lines to every word that shares one of its characters.
// Zoom in (pinch, or Ctrl/⌘ and scroll) and the dots become tiles with their words written on them.

const MAP_INK = ["#B8412E", "#2F4F86", "#4F8C74"], MAP_SLOT = { z: 0, j: 1, v: 2 };
const mapLevel = i => LEVEL_ORDER[WORDS[i][LEVEL]] ?? 3;
const mapEverydayFirst = (a, b) => mapLevel(a) - mapLevel(b) || a - b;
const MAP_BY_GROUP = {};
WORDS.forEach((w, i) => (MAP_BY_GROUP[w[CAT]] = MAP_BY_GROUP[w[CAT]] || []).push(i));
Object.values(MAP_BY_GROUP).forEach(a => a.sort(mapEverydayFirst));

// The gradient for each combination of languages, in steps
const MAP_STEPS = 48, MAP_GRAD = {};
["zj", "jv", "zv", "zjv"].forEach(g => {
  const rgb = Array.from(g).map(c => { const h = MAP_INK[MAP_SLOT[c]]; return [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)); });
  MAP_GRAD[g] = Array.from({ length: MAP_STEPS }, (_, b) => {
    const q = b / MAP_STEPS * rgb.length, a = Math.floor(q) % rgb.length, n = (a + 1) % rgb.length;
    const f = q - Math.floor(q), e = f * f * (3 - 2 * f);
    return "rgb(" + rgb[a].map((v, k) => Math.round(v + (rgb[n][k] - v) * e)).join(",") + ")";
  });
});
const MAP_STILL = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Space around the field, and how much taller than the canvas's own shape it is laid out (below 1 = taller and narrower)
const MAP_PAD = { left: 30, right: 80, top: 22, bottom: 44 }, MAP_ASPECT = 0.9;
// On phones the sides match the site's narrower 16px edge
const mapPad = () => window.innerWidth <= 640 ? { ...MAP_PAD, left: 16, right: 16 } : MAP_PAD;

// The ways to arrange the dots: each is a list of bands, and each band a list of blocks
const MAP_LEVELS = ["Beginner", "Intermediate", "Advanced", "No learner level"];
const mapSectionCache = {};
function mapSections(name) {
  if (mapSectionCache[name]) return mapSectionCache[name];
  const block = (cat, idx, label) => ({ cat, idx, label });
  const byLanguages = keep => GROUP_ORDER.map(g => block(g, (MAP_BY_GROUP[g] || []).filter(keep), groupName(g))).filter(b => b.idx.length);
  let secs;
  if (name === "length") {
    secs = [2, 3, 4, 5].map(n => ({ title: n === 5 ? "5 or more characters" : n + " characters",
      blocks: byLanguages(i => n === 5 ? WORDS[i][HANJA].length >= 5 : WORDS[i][HANJA].length === n) }));
  } else if (name === "level") {
    secs = MAP_LEVELS.map((title, n) => ({ title, blocks: byLanguages(i => mapLevel(i) === n) }));
  } else {
    secs = [
      { title: "Shared with all three", blocks: [block("zjv", MAP_BY_GROUP.zjv || [], "")] },
      { title: "Shared with two", blocks: ["zj", "jv", "zv"].map(g => block(g, MAP_BY_GROUP[g] || [], groupName(g))) },
      { title: "Shared with one language", blocks: ["j", "z", "v"].map(g => block(g, MAP_BY_GROUP[g] || [], groupName(g))) }
    ];
  }
  return (mapSectionCache[name] = secs);
}

let mapArrange = "lang";
let mapCam = { s: 1, x: 0, y: 0 }, mapFit = null, mapAnim = null, mapCamAnim = null, mapRaf = 0, mapFlowT = 0;
let mapHover = -1, mapRel = null;
const mapCur = { X: new Float32Array(WORDS.length), Y: new Float32Array(WORDS.length) };
const mapFrom = { X: new Float32Array(WORDS.length), Y: new Float32Array(WORDS.length) };
const mapDelay = new Float32Array(WORDS.length);   // dots set off at slightly different times when the arrangement changes
{ const rand = seededRandom(9); for (let i = 0; i < WORDS.length; i++) mapDelay[i] = rand(); }

function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Words that share a character with word i
let mapCharWords = null;
function mapRelatives(i) {
  if (!mapCharWords) {
    mapCharWords = new Map();
    WORDS.forEach((w, j) => new Set(w[HANJA]).forEach(c => { if (!mapCharWords.has(c)) mapCharWords.set(c, []); mapCharWords.get(c).push(j); }));
  }
  const s = new Set();
  new Set(WORDS[i][HANJA]).forEach(c => (mapCharWords.get(c) || []).forEach(j => s.add(j)));
  s.delete(i);
  return s;
}

// A word's colour: its language's ink, or, if two or three languages share it, its place in their flowing gradient
function mapColor(i) {
  const cat = WORDS[i][CAT];
  if (cat.length === 1) return MAP_INK[MAP_SLOT[cat]];
  const q = ((layout.P[i] - mapFlowT) % 1 + 1) % 1;
  return MAP_GRAD[cat][Math.floor(q * MAP_STEPS) % MAP_STEPS];
}

// In the current filter, search, and Everyday setting; other words fade
function mapStrong(i) {
  const w = WORDS[i];
  if (state.group !== null && w[CAT] !== state.group) return false;
  if (state.matchSet) return state.matchSet.has(i);
  if (state.everyday) return isEveryday(w);
  return true;
}

// ---------- Map layout ----------

// Lays the words out for the canvas's size; animate = glide the dots from where they are
function buildLayout(animate) {
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return false;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const secs = mapSections(mapArrange), n = WORDS.length, P0 = mapPad();
  const availW = W - P0.left - P0.right, availH = H - P0.top - P0.bottom;
  // every band has R rows; each block fills down a column, then moves right
  const measure = (R, hdr) => {
    let w = 0, h = 0;
    secs.forEach(s => { w = Math.max(w, s.blocks.reduce((a, b) => a + Math.ceil(b.idx.length / R) + 2, -2)); h += hdr * 1.5 + R; });
    return { w, h: h - hdr * 0.5 };
  };
  const choose = hdr => {
    let best = null;
    for (let R = 8; R <= 600; R += 2) {
      const m = measure(R, hdr), score = Math.abs(Math.log((m.w / m.h) / (availW / availH * MAP_ASPECT)));
      if (!best || score < best.score) best = { R, score, ...m };
    }
    return best;
  };
  let hdr = 10, best = choose(hdr);
  hdr = 44 / Math.min(availW / best.w, availH / best.h);   // headings about 44px tall on screen
  best = choose(hdr);
  const R = best.R;

  const X = new Float32Array(n), Y = new Float32Array(n), P = new Float32Array(n), heads = [];
  let y = 0, width = 0;
  secs.forEach(s => {
    const total = s.blocks.reduce((a, b) => a + b.idx.length, 0);
    heads.push({ kind: "band", x: 0, y, title: s.title.toUpperCase(), count: total.toLocaleString(),
      // a band with no block labels under its title (all three) puts its title down in their row, closer to its dots
      labelY: s.blocks.some(b => b.label) ? null : y + hdr * 0.62 });
    const top = y + hdr;
    let c = 0;
    s.blocks.forEach((b, bi) => {
      const cols = Math.ceil(b.idx.length / R);
      if (b.label) heads.push({ kind: "block", x: c, w: cols, last: bi === s.blocks.length - 1, y: y + hdr * 0.62, cat: b.cat,
        text: b.label + " " + b.idx.length.toLocaleString(), short: b.cat ? b.idx.length.toLocaleString() : b.label });
      b.idx.forEach((i, k) => {
        X[i] = c + Math.floor(k / R) + 0.5;
        Y[i] = top + (k % R) + 0.5;
        P[i] = (Math.floor(k / R) + (k % R) * 0.6) / (cols + R * 0.6);   // its place along the block's diagonal, for the gradient
      });
      c += cols + 2;
    });
    width = Math.max(width, c - 2);
    y = top + R + hdr * 0.5;
  });
  const height = y - hdr * 0.5;

  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const key = Math.floor(X[i] / 4) + "," + Math.floor(Y[i] / 4);
    let g = grid.get(key); if (!g) grid.set(key, g = []); g.push(i);
  }

  const s = Math.min(availW / width, availH / height);
  const fit = { s, x: P0.left, y: P0.top };
  const L = { W, H, name: mapArrange, X, Y, P, heads, grid, width, height };
  if (animate && layout) {
    mapFrom.X.set(mapCur.X); mapFrom.Y.set(mapCur.Y);
    mapAnim = { t0: performance.now(), dur: 1100 };
    mapCamAnim = { from: { ...mapCam }, to: fit, t0: performance.now(), dur: 900 };
    mapHover = -1; mapRel = null;
  } else {
    mapCur.X.set(X); mapCur.Y.set(Y);
    mapCam = fit; mapAnim = null; mapCamAnim = null;
  }
  layout = L;
  mapFit = fit;
  return true;
}

function relayoutMap() {
  if (!layout || layout.W !== canvas.clientWidth || layout.H !== canvas.clientHeight || layout.name !== mapArrange) buildLayout(false);
  mapSchedule();
}
function redrawMap() { mapSchedule(); }

function setArrangement(name) {
  if (name === mapArrange) return;
  mapArrange = name;
  if ($("arrange")) $("arrange").value = name;
  if (buildLayout(true)) mapSchedule();
}
if ($("arrange")) $("arrange").addEventListener("change", e => setArrangement(e.target.value));   // the menu is hidden for now

// ---------- Map drawing ----------

const mapEase = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const mapShowing = () => state.view === "map" && !$("map-wrap").hidden && !document.body.classList.contains("on-subpage");

function mapSchedule() { if (!mapRaf) mapRaf = requestAnimationFrame(mapTick); }
function mapTick() {
  mapRaf = 0;
  if (!layout || !mapShowing()) return;
  const now = performance.now();
  if (mapAnim) {
    const T = (now - mapAnim.t0) / mapAnim.dur;
    for (let i = 0; i < WORDS.length; i++) {
      const t = mapEase(Math.max(0, Math.min(1, T * 1.4 - mapDelay[i] * 0.4)));
      mapCur.X[i] = mapFrom.X[i] + (layout.X[i] - mapFrom.X[i]) * t;
      mapCur.Y[i] = mapFrom.Y[i] + (layout.Y[i] - mapFrom.Y[i]) * t;
    }
    if (T >= 1) { mapCur.X.set(layout.X); mapCur.Y.set(layout.Y); mapAnim = null; }
  }
  if (mapCamAnim) {
    const a = mapCamAnim, t = mapEase(Math.min(1, (now - a.t0) / a.dur));
    mapCam = { s: a.from.s * Math.pow(a.to.s / a.from.s, t), x: a.from.x + (a.to.x - a.from.x) * t, y: a.from.y + (a.to.y - a.from.y) * t };
    if (t >= 1) mapCamAnim = null;
  }
  if (!MAP_STILL) mapFlowT = now / 7000;   // one full turn of the gradient every 7 seconds
  draw();
  // keep going while the gradient flows (it stops by itself when the map isn't showing)
  if (mapAnim || mapCamAnim || !MAP_STILL) mapSchedule();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A word as a pill: Hangul, Hanja, and meaning. dark = the selected word.
function mapPill(i, x, y, dark, extra) {
  const { W } = layout, w = WORDS[i], s = mapCam.s;
  const main = w[HANGUL] + "  " + w[HANJA] + "  ·  " + meaningOf(i).short;
  ctx.font = "12px Inter, system-ui, sans-serif";
  const ew = extra ? ctx.measureText(extra).width : 0;
  ctx.font = '500 15px Inter, "Noto Sans KR", "Noto Sans TC", sans-serif';
  const mw = ctx.measureText(main).width, pw = mw + ew + 28, ph = 32, off = Math.max(10, s * 0.6);
  // kept clear of the canvas's edges by the site's side padding (30px, or 16px on phones), above the dot if there's room
  const edge = window.innerWidth <= 640 ? 16 : 30, H = layout.H;
  const px = Math.max(edge, Math.min(W - pw - edge, x - pw / 2));
  const py = y - ph - off >= edge ? y - ph - off : Math.min(H - ph - edge, y + off);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#000"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, Math.max(4.5, s * 0.55), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = dark ? "#000" : "#fffdf9";
  roundRect(px, py, pw, ph, ph / 2); ctx.fill();
  ctx.lineWidth = 1; ctx.stroke();
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = dark ? "#fff" : "#000";
  ctx.fillText(main, px + 14, py + ph / 2 + 1);
  if (extra) { ctx.font = "12px Inter, system-ui, sans-serif"; ctx.fillStyle = dark ? "#ccc" : "#4a453d"; ctx.fillText(extra, px + 14 + mw, py + ph / 2 + 1); }
}

function draw() {
  if (!layout) return;
  const { W, H, heads } = layout, n = WORDS.length, s = mapCam.s;
  const sx = i => mapCam.x + mapCur.X[i] * s, sy = i => mapCam.y + mapCur.Y[i] * s;
  ctx.clearRect(0, 0, W, H);

  // headings: each band's title, and each block's languages and count
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  let lastEnd = -1e9;
  heads.forEach(h => {
    const x = mapCam.x + h.x * s, y = mapCam.y + h.y * s;
    if (h.kind === "band") {
      // small caps: the title in tracked capitals, then its count in grey
      const bx = Math.max(x, 8), ty = h.labelY === null ? y + 16 : mapCam.y + h.labelY * s + 2;
      ctx.letterSpacing = "0.08em";
      ctx.font = '600 10.5px Inter, "Noto Sans KR", system-ui, sans-serif'; ctx.fillStyle = "#000";
      ctx.fillText(h.title, bx, ty);
      const tw = ctx.measureText(h.title).width;
      ctx.letterSpacing = "0px";
      ctx.font = '400 10.5px Inter, "Noto Sans KR", system-ui, sans-serif'; ctx.fillStyle = "#4a453d";
      ctx.fillText("  ·  " + h.count, bx + tw, ty);
      lastEnd = -1e9;
      return;
    }
    // a block's label sits above it, within the room up to the next block (the last block may run to the edge);
    // a narrower block gets a shorter label (its languages' dots and its count), and one too narrow for that gets none
    ctx.font = "10.5px Inter, system-ui, sans-serif";
    const dotsW = h.cat.length ? h.cat.length * 6.5 + 3.5 : 0;
    const room = h.last ? W - 6 - x : (h.w + 1.5) * s;
    let text = h.text;
    if (dotsW + ctx.measureText(text).width > room) text = h.short;
    if (dotsW + ctx.measureText(text).width > room || x < lastEnd + 6) return;
    Array.from(h.cat).forEach((l, k) => { ctx.fillStyle = MAP_INK[MAP_SLOT[l]]; ctx.beginPath(); ctx.arc(x + 2.6 + k * 6.5, y + 5.4, 2.6, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = "#4a453d";
    ctx.fillText(text, x + dotsW, y + 9);
    lastEnd = x + dotsW + ctx.measureText(text).width;
  });

  const rel = mapHover >= 0 ? mapRel : null;
  const tiles = s >= 30 && !mapAnim;
  const onScreen = (x, y, m) => x > -m && y > -m && x < W + m && y < H + m;

  if (!tiles) {
    // dots, batched by colour: faded ones first, then the rest
    const r = Math.max(0.75, s * 0.36), faint = new Map(), strong = new Map();
    for (let i = 0; i < n; i++) {
      if (rel && rel.has(i)) continue;
      const x = sx(i), y = sy(i);
      if (!onScreen(x, y, 5)) continue;
      const m = !rel && mapStrong(i) ? strong : faint, col = mapColor(i);
      let b = m.get(col); if (!b) m.set(col, b = []); b.push(i);
    }
    const fill = (m, alpha) => {
      ctx.globalAlpha = alpha;
      m.forEach((b, col) => {
        ctx.fillStyle = col; ctx.beginPath();
        b.forEach(i => { const x = sx(i), y = sy(i); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); });
        ctx.fill();
      });
    };
    fill(faint, rel ? 0.13 : 0.14);
    fill(strong, 1);
    ctx.globalAlpha = 1;
    if (rel) {
      // lines from the hovered word to every word that shares one of its characters
      const hx = sx(mapHover), hy = sy(mapHover);
      ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 0.7; ctx.beginPath();
      let k = 0;
      for (const j of rel) { if (k++ > 1200) break; ctx.moveTo(hx, hy); ctx.lineTo(sx(j), sy(j)); }
      ctx.stroke();
      const rr = Math.max(1.6, r * 1.4);
      for (const j of rel) { ctx.fillStyle = mapColor(j); ctx.beginPath(); ctx.arc(sx(j), sy(j), rr, 0, Math.PI * 2); ctx.fill(); }
    }
  } else {
    // zoomed in: each dot becomes a tile with its word
    const size = s * 0.88, fs = Math.min(15, s * 0.26);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = '500 ' + fs.toFixed(1) + 'px "Noto Sans KR", sans-serif';
    for (let i = 0; i < n; i++) {
      const x = sx(i), y = sy(i);
      if (!onScreen(x, y, s)) continue;
      ctx.globalAlpha = rel ? (rel.has(i) || i === mapHover ? 1 : 0.15) : mapStrong(i) ? 1 : 0.18;
      ctx.fillStyle = mapColor(i);
      roundRect(x - size / 2, y - size / 2, size, size, Math.min(6, size * 0.12)); ctx.fill();
      ctx.fillStyle = "#fff";
      const t = WORDS[i][HANGUL];
      ctx.fillText(s >= 46 || t.length <= 3 ? t : t.slice(0, 2) + "…", x, y);
    }
    ctx.globalAlpha = 1;
    if (rel) {
      const hx = sx(mapHover), hy = sy(mapHover);
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1; ctx.beginPath();
      for (const j of rel) { ctx.moveTo(hx, hy); ctx.lineTo(sx(j), sy(j)); }
      ctx.stroke();
    }
  }

  // the selected word stays labelled; the hovered word gets a pill too
  if (!mapAnim) {
    if (state.selected >= 0 && state.selected !== mapHover) mapPill(state.selected, sx(state.selected), sy(state.selected), true, "");
    if (mapHover >= 0) mapPill(mapHover, sx(mapHover), sy(mapHover), false,
      rel ? "    " + rel.size.toLocaleString() + (rel.size === 1 ? " word shares" : " words share") + " a character" : "");
  }

  // "Reset view" shows once the map has been zoomed or moved
  const moved = mapFit && !mapCamAnim && (Math.abs(mapCam.s / mapFit.s - 1) > 0.02 || Math.abs(mapCam.x - mapFit.x) > 4 || Math.abs(mapCam.y - mapFit.y) > 4);
  if ($("reset-view").hidden === !!moved) $("reset-view").hidden = !moved;
}

// ---------- Map interaction ----------

// The word nearest the pointer, within a few pixels
function nearestWord(mx, my) {
  if (!layout || mapAnim) return -1;
  const wx = (mx - mapCam.x) / mapCam.s, wy = (my - mapCam.y) / mapCam.s, reach = Math.max(0.75, 7 / mapCam.s);
  let best = -1, bestD = reach * reach;
  for (let gx = Math.floor((wx - reach) / 4); gx <= Math.floor((wx + reach) / 4); gx++)
    for (let gy = Math.floor((wy - reach) / 4); gy <= Math.floor((wy + reach) / 4); gy++)
      (layout.grid.get(gx + "," + gy) || []).forEach(i => {
        const d = (layout.X[i] - wx) ** 2 + (layout.Y[i] - wy) ** 2;
        if (d < bestD) { bestD = d; best = i; }
      });
  return best;
}

function mapSetHover(i) {
  if (i === mapHover) return;
  mapHover = i;
  mapRel = i >= 0 ? mapRelatives(i) : null;
  canvas.style.cursor = i >= 0 ? "pointer" : "";
  mapSchedule();
}

// Keeps the field on screen: it can't be zoomed out past fitting the canvas, and its edges can't be moved past the
// canvas's edges (with a small margin). A side that fits on screen stays where it sits when the whole field is shown.
function mapClamp(c) {
  if (!layout || !mapFit) return c;
  const s = Math.max(mapFit.s, Math.min(90, c.s)), P0 = mapPad();
  const cw = layout.width * s, ch = layout.height * s;
  const x = cw <= layout.W - P0.left - P0.right + 0.5 ? mapFit.x : Math.min(P0.left, Math.max(layout.W - P0.right - cw, c.x));
  const y = ch <= layout.H - P0.top - P0.bottom + 0.5 ? mapFit.y : Math.min(P0.top, Math.max(layout.H - P0.bottom - ch, c.y));
  return { s, x, y };
}

function mapZoomAt(mx, my, k) {
  const s2 = Math.max(mapFit ? mapFit.s : 0.5, Math.min(90, mapCam.s * k)), f = s2 / mapCam.s;
  mapCamAnim = null;
  mapCam = mapClamp({ s: s2, x: mx - (mx - mapCam.x) * f, y: my - (my - mapCam.y) * f });
  mapSchedule();
}

// Glides back to the whole field
function mapResetView() {
  if (!mapFit) return;
  mapCamAnim = { from: { ...mapCam }, to: mapFit, t0: performance.now(), dur: 600 };
  mapSchedule();
}

// Moves the view so the word is on screen, if it isn't
function mapReveal(i) {
  if (!layout) return;
  const x = mapCam.x + layout.X[i] * mapCam.s, y = mapCam.y + layout.Y[i] * mapCam.s;
  if (x > 40 && y > 40 && x < layout.W - 40 && y < layout.H - 40) return;
  mapCamAnim = { from: { ...mapCam }, to: mapClamp({ s: mapCam.s, x: layout.W / 2 - layout.X[i] * mapCam.s, y: layout.H / 2 - layout.Y[i] * mapCam.s }), t0: performance.now(), dur: 600 };
  mapSchedule();
}
function selectAndFly(i) {
  select(i);
  if (state.view === "map") mapReveal(i);
}

function pointer(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

// Click a dot to select its word. Drag or swipe with two fingers to move; pinch, or Ctrl/⌘ and scroll, to zoom;
// double-click to see the whole field again.
const mapPointers = new Map();
let mapDrag = null, mapPinch = null;
canvas.addEventListener("pointerdown", e => {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  mapPointers.set(e.pointerId, pointer(e));
  if (mapPointers.size === 2) {
    const [a, b] = [...mapPointers.values()];
    mapPinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
    mapDrag = null;
  } else {
    mapDrag = { x: e.clientX, y: e.clientY, cx: mapCam.x, cy: mapCam.y, moved: false };
  }
});
canvas.addEventListener("pointermove", e => {
  const [mx, my] = pointer(e);
  if (mapPointers.has(e.pointerId)) mapPointers.set(e.pointerId, [mx, my]);
  if (mapPinch && mapPointers.size === 2) {
    const [a, b] = [...mapPointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    mapZoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / mapPinch.d);
    mapPinch.d = d;
    return;
  }
  if (mapDrag) {
    const dx = e.clientX - mapDrag.x, dy = e.clientY - mapDrag.y;
    if (mapDrag.moved || Math.abs(dx) + Math.abs(dy) > 4) {
      mapDrag.moved = true;
      canvas.classList.add("dragging");
      mapCamAnim = null;
      mapCam = mapClamp({ ...mapCam, x: mapDrag.cx + dx, y: mapDrag.cy + dy });
      mapSetHover(-1);
      mapSchedule();
    }
    return;
  }
  if (e.pointerType === "mouse") mapSetHover(nearestWord(mx, my));
});
const mapPointerEnd = e => {
  const tap = mapDrag && !mapDrag.moved && !mapPinch;
  mapPointers.delete(e.pointerId);
  if (mapPointers.size < 2) mapPinch = null;
  if (tap && e.type === "pointerup") {
    const [mx, my] = pointer(e), i = nearestWord(mx, my);
    if (i >= 0) select(i);
    else if (state.selected >= 0) deselect();   // a click off the dots clears the selected word
  }
  mapDrag = null;
  canvas.classList.remove("dragging");
};
canvas.addEventListener("pointerup", mapPointerEnd);
canvas.addEventListener("pointercancel", mapPointerEnd);
canvas.addEventListener("pointerleave", e => { if (!mapDrag && e.pointerType === "mouse") mapSetHover(-1); });
canvas.addEventListener("dblclick", e => { e.preventDefault(); mapResetView(); });
// Two-finger swipe (or the scroll wheel) moves the view; pinch (or Ctrl/⌘ and scroll) zooms. When the field can't
// move any further that way, the page scrolls as usual.
canvas.addEventListener("wheel", e => {
  const [mx, my] = pointer(e);
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); mapZoomAt(mx, my, Math.exp(-e.deltaY * 0.01)); return; }
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? layout.H : 1;
  const next = mapClamp({ ...mapCam, x: mapCam.x - e.deltaX * unit, y: mapCam.y - e.deltaY * unit });
  if (Math.abs(next.x - mapCam.x) < 0.01 && Math.abs(next.y - mapCam.y) < 0.01) return;
  e.preventDefault();
  mapCamAnim = null;
  mapCam = next;
  mapSetHover(-1);
  mapSchedule();
}, { passive: false });
$("reset-view").addEventListener("click", mapResetView);

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
      : listItems.length.toLocaleString() + (listItems.length === 1 ? " word" : " words");
}

function card(i) {
  const w = WORDS[i];
  const b = document.createElement("button");
  b.type = "button";
  b.className = "card";
  b.dataset.index = i;
  b.setAttribute("aria-pressed", String(state.selected === i));
  // The meaning leads (for English readers), then the Korean word with its Hanja, then the romanization.
  // A column of dots on the right has a fixed slot for Chinese, Japanese, and Vietnamese, filled when that language shares the word.
  const m = meaningOf(i);
  const en = el("div", "gloss" + (m.source !== "ko" ? " borrowed" : ""), m.short);
  const ko = el("div", "ko", w[HANGUL]);
  ko.lang = "ko";
  ko.appendChild(el("span", "hj", w[HANJA]));
  const roman = el("div", "roman", KO_ROMAN[i]);
  const bar = el("div", "share-bar");
  const names = Array.from(w[CAT]).map(c => LANG_NAME[c]);
  bar.title = "Also a word in " + joinList(names);
  bar.appendChild(el("span", "visually-hidden", bar.title));
  ["z", "j", "v"].forEach(c => bar.appendChild(el("i", w[CAT].includes(c) ? "on lang-" + c : "")));
  b.append(en, ko, roman, bar);
  b.title = "Double-click to open this word's page";
  b.addEventListener("click", () => select(i));
  b.addEventListener("dblclick", () => openWord(i));
  return b;
}

$("list-wrap").addEventListener("scroll", () => {
  const el = $("list-wrap");
  if (listShown < listItems.length && el.scrollTop + el.clientHeight > el.scrollHeight - 400) appendListChunk();
});
// On phones the list scrolls with the page, so more words load as the page nears its end
window.addEventListener("scroll", () => {
  if (state.view !== "list" || listShown >= listItems.length) return;
  const end = $("list-end").getBoundingClientRect().top;
  if (end < window.innerHeight + 400) appendListChunk();
}, { passive: true });

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

// A word's English meaning, from the best source there is:
//  ko    — the Korean dictionaries (Basic Korean Dictionary or kengdic)
//  ja/zh/vi — when the Korean dictionaries have no English, the meaning of the same word in Japanese, Chinese, or Vietnamese
//  chars — otherwise, the meanings of its characters one by one (Unicode Unihan), which only hint at the meaning
// .full is for the word's own page and panel; .short is for labels (≈ marks a borrowed meaning, parentheses mark characters)
const meaningCache = new Map();
function meaningOf(i) {
  if (meaningCache.has(i)) return meaningCache.get(i);
  const w = WORDS[i];
  let m;
  if (w[KO_MEANING].trim()) m = { source: "ko", full: w[KO_MEANING], short: englishShort(w[KO_MEANING]) };
  else {
    const borrowed = [["ja", w[JP_MEANING]], ["zh", w[ZH_MEANING]], ["vi", w[VI_MEANING]]].find(([, x]) => x && x.trim());
    if (borrowed) m = { source: borrowed[0], full: borrowed[1], short: "≈ " + englishShort(borrowed[1]) };
    else {
      const parts = Array.from(w[HANJA]).map(c => (CHAR_MEANING[c] || "?").split(",")[0]);
      m = { source: "chars", full: Array.from(w[HANJA]).map(c => c + " " + (CHAR_MEANING[c] || "?")).join(" · "),
            short: "(" + parts.join(" + ") + ")" };
    }
  }
  meaningCache.set(i, m);
  return m;
}
const BORROWED_FROM = { ja: "Japanese", zh: "Chinese", vi: "Vietnamese" };
// One line explaining where a meaning came from, when it isn't from the Korean dictionaries
function meaningNote(m) {
  if (m.source === "ko") return "";
  if (m.source === "chars") return "No English meaning in the Korean dictionaries used here. These are the meanings of its characters one by one, which only hint at what the word means.";
  return "No English meaning in the Korean dictionaries used here. This is what the same word means in " + BORROWED_FROM[m.source] + ", which may differ from the Korean meaning.";
}

// "학교 學校 · school"
function wordLabel(i) {
  const g = meaningOf(i).short;
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

// The intro shown in the side panel when no word is selected. The map's how-to appears only in the map view.
// What each language calls the characters, and how many of the site's words it shares
const CHAR_NAMES = [
  { c: "",  lang: "Korean",     say: "hanja",   word: "한자 漢字" },
  { c: "z", lang: "Chinese",    say: "hànzì",   word: "汉字 漢字" },
  { c: "j", lang: "Japanese",   say: "kanji",   word: "漢字" },
  { c: "v", lang: "Vietnamese", say: "chữ Hán", word: "Hán tự 漢字" }
];

// The example word in the intro, read four ways
const INTRO_EXAMPLE = "가족";

function renderIntro() {
  const panel = $("detail");
  panel.classList.remove("has-word");
  document.body.classList.add("intro-showing");   // the panel shows the title, so the top bar's title steps aside
  panel.innerHTML = "";
  const box = el("div", "intro");
  box.appendChild(el("h2", "intro-title", "The roots beneath Korean words"));
  box.appendChild(el("p", "intro-lead", "More than half of Korean vocabulary is built from Chinese characters. Korean, Chinese, " +
    "Japanese, and Vietnamese were all once written with them, and each has its own name for them:"));

  // The same two characters, four names: 漢字 large, with each language's name for it beside it
  const names = el("div", "char-names");
  const glyph = el("span", "char-glyph", "漢字");
  glyph.lang = "ko";
  glyph.setAttribute("aria-hidden", "true");
  names.appendChild(glyph);
  CHAR_NAMES.forEach(n => {
    const cell = el("div", "char-name");
    cell.append(inked("span", "char-name-lang", n.lang), el("span", "char-name-say", n.say));
    cell.title = n.lang + ": " + n.say + " (" + n.word + ")";
    names.appendChild(cell);
  });
  box.appendChild(names);

  box.appendChild(el("p", "", "Hanja Roots traces " + WORDS.length.toLocaleString() + " Korean words whose characters are also a word in " +
    "Chinese, Japanese, or Vietnamese. For example:"));

  // One word, four languages; clicking it opens the word
  const i = WORDS.findIndex(w => w[HANGUL] === INTRO_EXAMPLE);
  if (i >= 0) {
    const w = WORDS[i];
    const ex = el("button", "intro-example");
    ex.type = "button";
    const head = el("span", "ex-head");
    head.append(el("span", "ex-ko", w[HANGUL]), el("span", "ex-sub", w[HANJA] + " · " + meaningOf(i).short));
    const grid = el("span", "ex-grid");
    [["Korean", KO_ROMAN[i]], ["Mandarin", w[ZH_PINYIN] && pinyinMarks(w[ZH_PINYIN]).replace(/ /g, "")],
     ["Japanese", w[JP_READING] && romajiWithMacrons(JP_ROMAN[i])], ["Vietnamese", w[VI_WORD]]].forEach(([lang, say]) => {
      if (!say) return;
      const cell = el("span", "ex-cell");
      cell.append(inked("span", "ex-lang", lang), el("span", "ex-say", say));
      grid.appendChild(cell);
    });
    ex.append(head, grid);
    ex.setAttribute("aria-label", "See " + w[HANGUL] + ", " + meaningOf(i).short);
    ex.addEventListener("click", () => selectAndFly(i));
    box.appendChild(ex);
  }

  const more = el("button", "intro-more", "More about Hanja Roots →");
  more.type = "button";
  more.addEventListener("click", () => openAbout());
  box.appendChild(more);
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

  panel.classList.add("has-word");
  document.body.classList.remove("intro-showing");

  // The English meaning, as the panel's heading
  const meaning = meaningOf(i);
  const head = el("div", "panel-head");
  head.appendChild(el("h2", "panel-en" + (meaning.source === "ko" ? "" : " borrowed"), meaning.short));
  if (meaning.source !== "ko") head.appendChild(el("p", "panel-note", meaning.source === "chars"
    ? "No English meaning in the Korean dictionaries; these are its characters' meanings."
    : "No English meaning in the Korean dictionaries; this is the " + BORROWED_FROM[meaning.source] + " meaning."));
  panel.appendChild(head);

  // One card per language, all built the same way. Each whole card is a play button for that language.
  // Languages that don't have the word are greyed out and go to the bottom, after the ones that do.
  const missing = [];
  panel.appendChild(soundCard({
    label: "Korean", definition: meaning.source === "ko" ? meaning.full : "",
    variants: [{ lang: "ko", word: w[HANGUL], alt: w[HANJA], reading: KO_ROMAN[i], text: w[HANGUL], forms: [w[HANGUL]] }]
  }));
  if (w[ZH_MEANING]) {
    const simp = w[ZH_SIMPLIFIED] && w[ZH_SIMPLIFIED] !== zhForm(w) ? w[ZH_SIMPLIFIED] : "";
    panel.appendChild(soundCard({
      label: "Chinese", definition: w[ZH_MEANING], remember: "chinese",
      variants: [
        { lang: "zh", name: "Mandarin", word: zhForm(w), alt: simp, reading: pinyinMarks(w[ZH_PINYIN]),
          text: w[ZH_SIMPLIFIED] || zhForm(w), forms: [w[ZH_SIMPLIFIED], zhForm(w), pinyinMarks(w[ZH_PINYIN]).replace(/ /g, "")] },
        { lang: "yue", name: "Cantonese", word: zhForm(w), alt: simp, reading: w[YUE] || "",
          text: zhForm(w), forms: w[YUE] ? [zhForm(w), w[YUE].replace(/ /g, "")] : [], unavailable: !w[YUE] && "No Cantonese reading found for this word" }
      ]
    }));
  } else missing.push(missingCard("Chinese", "Not a word in Chinese"));
  if (w[JP_MEANING]) panel.appendChild(soundCard({
    label: "Japanese", definition: w[JP_MEANING],
    variants: [{ lang: "ja", word: w[JP_FORM] || w[HANJA], reading: romajiWithMacrons(JP_ROMAN[i]), text: w[JP_READING],
                 forms: [w[JP_FORM], w[HANJA], w[JP_READING], romajiWithMacrons(JP_ROMAN[i])] }]
  })); else missing.push(missingCard("Japanese", "Not a word in Japanese"));
  if (w[VI_WORD]) panel.appendChild(soundCard({
    label: "Vietnamese", definition: w[VI_MEANING],
    variants: [{ lang: "vi", word: w[VI_WORD], reading: "", text: w[VI_WORD], forms: [w[VI_WORD]] }]
  })); else missing.push(missingCard("Vietnamese", "Not a word in Vietnamese"));
  missing.forEach(m => panel.appendChild(m));

  // "Trace its roots": a small link under the English heading to the word's full page, naming its characters
  const open = el("button", "trace-link");
  open.type = "button";
  open.setAttribute("aria-label", "Trace the roots of " + w[HANGUL] + ": open its full breakdown");
  open.append(document.createTextNode("Trace its roots: "));
  Array.from(w[HANJA]).forEach((c, k) => {
    if (k) open.append(document.createTextNode(" + "));
    open.appendChild(el("b", "", c));
  });
  open.append(document.createTextNode(" →"));
  open.addEventListener("click", () => openWord(i));
  head.appendChild(open);

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

// ---------- Side panel cards ----------
// A language card in the side panel: the whole card plays the word in that language. It plays a native speaker's
// recording when Wikimedia Commons has one, otherwise the device's voice. The speaker icon fills in while playing.
const SPEAKER_SVG = '<svg class="speaker" viewBox="0 0 32 24" aria-hidden="true"><path class="cone" d="M3 8h5l7-5v18l-7-5H3z"/>' +
  '<path class="wave" d="M20 8.5c1.6 1.8 1.6 5.2 0 7"/><path class="wave" d="M24 5c3.2 3.6 3.2 10.4 0 14"/></svg>';
let playingCard = null;
function setPlaying(card, on) {
  if (on && playingCard && playingCard !== card) playingCard.classList.remove("is-playing");
  card.classList.toggle("is-playing", on);
  playingCard = on ? card : (playingCard === card ? null : playingCard);
}
// o: label, definition, variants (one per pronunciation; Chinese has Mandarin and Cantonese), remember (a key
// to remember which variant was last chosen, across words). Every card has the same parts in the same order:
// label (with the switch when there's more than one pronunciation), word, reading, meaning, speaker.
const chosenVariant = {};
function soundCard(o) {
  const card = el("div", "lang-card");
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  const labelRow = el("div", "lang-label-row");
  labelRow.appendChild(inked("span", "lang-label", o.label));
  card.appendChild(labelRow);
  const wordEl = el("div", "lang-word"), readingEl = el("div", "lang-reading");
  card.append(wordEl, readingEl);
  if (o.definition) card.appendChild(el("div", "lang-def", o.definition));
  const status = el("div", "lang-status");
  card.appendChild(status);
  card.insertAdjacentHTML("beforeend", SPEAKER_SVG);

  let current = 0;
  if (o.remember && chosenVariant[o.remember] !== undefined && !o.variants[chosenVariant[o.remember]].unavailable) current = chosenVariant[o.remember];
  const recordings = o.variants.map(() => null);
  o.variants.forEach((v, k) => {
    if (!v.forms.length) return;
    findRecording(v.lang, v.forms.filter(Boolean)).then(rec => { recordings[k] = rec; if (k === current) show(); }).catch(() => {});
  });

  // The switch between pronunciations (Chinese: Mandarin | Cantonese)
  let switchButtons = [];
  if (o.variants.length > 1) {
    const sw = el("div", "variant-switch");
    sw.setAttribute("role", "radiogroup");
    sw.setAttribute("aria-label", o.label + " pronunciation");
    switchButtons = o.variants.map((v, k) => {
      const b = el("button", "", v.name);
      b.type = "button";
      b.setAttribute("role", "radio");
      if (v.unavailable) { b.disabled = true; b.title = v.unavailable; }
      b.addEventListener("click", e => {
        e.stopPropagation();   // switching doesn't play; tapping the card does
        current = k;
        if (o.remember) chosenVariant[o.remember] = k;
        status.classList.remove("error");
        show();
      });
      b.addEventListener("keydown", e => e.stopPropagation());
      sw.appendChild(b);
      return b;
    });
    card.appendChild(sw);   // sits in the card's top right corner
  }

  function show() {
    const v = o.variants[current];
    wordEl.textContent = v.word;
    wordEl.lang = FONT_LANG[v.lang] || "";
    if (v.alt) { const a = el("span", "lang-alt", " " + v.alt); a.lang = v.lang === "zh" || v.lang === "yue" ? "zh-Hans" : wordEl.lang; wordEl.appendChild(a); }
    readingEl.textContent = v.reading;
    readingEl.hidden = !v.reading;
    switchButtons.forEach((b, k) => b.setAttribute("aria-checked", String(k === current)));
    const rec = recordings[current];
    if (!status.classList.contains("error")) status.textContent = rec ? "Native speaker recording by " + rec.speaker : "";
    card.setAttribute("aria-label", o.label + (v.name ? " (" + v.name + ")" : "") + ": " + v.word + ". Play pronunciation");
    card.dataset.lang = v.lang;
  }
  show();

  function play() {
    const v = o.variants[current];
    const done = () => setPlaying(card, false);
    status.classList.remove("error");
    const rec = recordings[current];
    if (rec) {
      setPlaying(card, true);
      playRecording(rec).then(() => { currentAudio.onended = done; currentAudio.onpause = done; }).catch(() => speakIt());
    } else speakIt();
    function speakIt() {
      if (!speechSupported || !voiceFor(v.lang)) {
        status.textContent = "No " + SPEECH_LANGS[v.lang].name + " voice on this device yet. See About for how to add one.";
        status.classList.add("error");
        done();
        return;
      }
      setPlaying(card, true);
      speak(v.text, v.lang, null, done);
    }
  }
  card.addEventListener("click", play);
  card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); play(); } });
  return card;
}
function missingCard(lang, text) {
  const card = el("div", "lang-card missing");
  card.appendChild(el("div", "lang-def", text));   // "Not a word in Japanese" says it all
  return card;
}

// The Korean, Chinese, Japanese, and Vietnamese sections for a word, used by the side panel and the word page
function appendLangSections(box, i) {
  const w = WORDS[i];
  const meaning = meaningOf(i);
  box.appendChild(langSection("Korean", w[HANGUL] + " " + w[HANJA], KO_ROMAN[i],
    meaning.source === "ko" ? meaning.full
      : meaning.source === "chars" ? "Its characters: " + meaning.full + "."
      : "In " + BORROWED_FROM[meaning.source] + ": " + meaning.full,
    meaning.source !== "ko" ? meaningNote(meaning)
      : w[KO_SOURCE].includes("k") ? "From the Basic Korean Dictionary." : "From kengdic only, a community dictionary.",
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

// ---------- Phones: the word sheet ----------
// On phones a selected word's panel slides up from the bottom (style.css). A tap on the dimmed page behind it, Escape, or
// pulling the sheet down from its top closes it.
const sheetIsOpen = () => window.matchMedia("(max-width: 640px)").matches && $("detail").classList.contains("has-word");
$("sheet-backdrop").addEventListener("click", () => deselect());
document.addEventListener("keydown", e => { if (e.key === "Escape" && sheetIsOpen() && !onSubpage) deselect(); });
(() => {
  const sheet = $("detail");
  let startY = null, dy = 0;
  sheet.addEventListener("touchstart", e => {
    if (!sheetIsOpen() || sheet.scrollTop > 0) { startY = null; return; }
    startY = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  sheet.addEventListener("touchmove", e => {
    if (startY === null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (dy > 0) { sheet.style.transition = "none"; sheet.style.transform = "translateY(" + dy + "px)"; }
  }, { passive: true });
  sheet.addEventListener("touchend", () => {
    if (startY === null) return;
    startY = null;
    sheet.style.transition = "transform 0.2s ease";
    if (dy > 90) { sheet.style.transform = "translateY(100%)"; setTimeout(() => { sheet.style.transform = ""; sheet.style.transition = ""; deselect(); }, 200); }
    else { sheet.style.transform = ""; setTimeout(() => { sheet.style.transition = ""; }, 200); }
  });
})();

// Language names are written in their language's ink colour (Chinese, Mandarin, and Cantonese all in the Chinese colour)
const INK = { Chinese: "z", Mandarin: "z", Cantonese: "z", Japanese: "j", Vietnamese: "v" };
function inked(tag, cls, name) { const e = el(tag, cls, name); if (INK[name]) e.classList.add("ink-" + INK[name]); return e; }

// The language tag for each language's text, so its characters use that language's font (see :lang in style.css)
const FONT_LANG = { ko: "ko", zh: "zh-Hant", yue: "zh-Hant", ja: "ja", vi: "vi", Korean: "ko", Chinese: "zh-Hant", Japanese: "ja", Vietnamese: "vi" };

function langSection(lang, word, reading, meaning, note, say) {
  const sec = el("section", "lang");
  sec.appendChild(inked("h3", "", lang));
  const wordEl = el("div", "word", word);
  wordEl.lang = FONT_LANG[lang] || "";
  sec.appendChild(wordEl);
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
  delete e.target.dataset.random;
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
  e.currentTarget.setAttribute("aria-checked", String(state.everyday));
  refresh();
});
// Random word: like a slot machine, English meanings flicker through the search box, slowing down, and land on a
// random word, which is then selected; the list scrolls to its card, the map moves to it. The landed word sits in the
// search box as a label (it isn't searched); clicking into the box clears it so you can type straight away.
let rolling = false;
$("random").addEventListener("click", () => {
  if (rolling) return;
  if (state.query) { $("search").value = ""; runSearch(""); }   // roll from all the words shown, not a search
  const pool = visibleWords();
  const from = pool.length ? pool : WORDS.map((_, i) => i);
  const pick = () => from[Math.floor(Math.random() * from.length)];
  const i = pick();
  const box = $("search"), dice = $("random");
  const land = () => {
    rolling = false;
    box.classList.remove("rolling");
    dice.classList.remove("rolling");
    box.value = meaningOf(i).short.replace(/^≈ /, "");
    box.dataset.random = "1";
    selectAndFly(i);
    if (state.view === "list") revealInList(i);
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { land(); return; }
  rolling = true;
  box.classList.add("rolling");
  dice.classList.remove("rolling"); void dice.offsetWidth; dice.classList.add("rolling");
  const delays = [40, 40, 45, 50, 55, 60, 70, 80, 95, 110, 130, 160];   // speeding past, then slowing down
  let k = 0;
  const step = () => {
    if (k >= delays.length) { land(); return; }
    box.value = meaningOf(pick()).short.replace(/^≈ /, "");
    setTimeout(step, delays[k++]);
  };
  step();
});
// A landed random word clears as soon as you click or tab into the search box
function clearRandomLabel() {
  const box = $("search");
  if (box.dataset.random) { box.value = ""; delete box.dataset.random; }
}
$("search").addEventListener("pointerdown", clearRandomLabel);
$("search").addEventListener("focus", clearRandomLabel);

// Scrolls the list to a word's card, loading more of the list first if the card isn't there yet
function revealInList(i) {
  const pos = listItems.indexOf(i);
  if (pos < 0) return;
  while (listShown <= pos) appendListChunk();
  const c = document.querySelector('.card[data-index="' + i + '"]');
  if (!c) return;
  const wrap = $("list-wrap");
  if (wrap.scrollHeight <= wrap.clientHeight + 1) {   // phones: the page scrolls, not the list
    // just under the pinned top bar, so the word sheet that opens over the bottom doesn't hide it
    const bar = document.querySelector(".topbar").getBoundingClientRect().height;
    window.scrollTo({ top: Math.max(0, c.getBoundingClientRect().top + window.scrollY - bar - 12) });
    c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash");
    return;
  }
  const top = c.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
  const target = Math.max(0, top - wrap.clientHeight / 2 + c.offsetHeight / 2);
  // Glide for short distances; jump straight there for long ones (a long glide would load the whole list on the way)
  wrap.scrollTo({ top: target, behavior: Math.abs(target - wrap.scrollTop) > wrap.clientHeight * 3 ? "auto" : "smooth" });
  // A brief flash, so it's easy to see where the list landed
  c.classList.remove("flash");
  void c.offsetWidth;
  c.classList.add("flash");
}
document.querySelectorAll("[data-view]").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));

$("about-open").addEventListener("click", () => openAbout());
$("page-about").addEventListener("click", () => openAbout());   // on word pages, About sits beside the title

// The title in the top bar resets the gallery to how it looks on arrival: no search, no filters,
// Everyday off, no word selected, the summary view
function resetGallery() {
  $("search").value = "";
  delete $("search").dataset.random;
  state.query = ""; state.matches = null; state.matchSet = null;
  hideSuggestions();
  state.group = null;
  renderGroupButtons();
  state.everyday = false;
  $("everyday").setAttribute("aria-checked", "false");
  state.selected = -1;
  document.querySelectorAll(".card[aria-pressed='true']").forEach(c => c.setAttribute("aria-pressed", "false"));
  $("detail").classList.remove("has-word");
  setView("map");   // also redraws the summary and the intro
  $("list-wrap").scrollTop = 0;
  $("detail").scrollTop = 0;
  window.scrollTo(0, 0);
}
$("home").addEventListener("click", resetGallery);
// Contents links on the About page scroll to their section (the address bar's # is used for routing, so no plain anchors)
document.querySelectorAll("[data-jump]").forEach(a => a.addEventListener("click", e => {
  e.preventDefault();
  $(a.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" });
}));

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.view === "map") relayoutMap(); }, 150);
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
  $("page-about").hidden = about;   // shown on word pages, not on the About page itself
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

// A coloured dot for each language that shares the word (colours set in style.css: Chinese, Japanese, Vietnamese)
function langDots(cat, className) {
  const box = el("span", className);
  const names = Array.from(cat).map(c => LANG_NAME[c]);
  box.title = "Also a word in " + joinList(names);
  box.appendChild(el("span", "visually-hidden", box.title));
  Array.from(cat).forEach(c => box.appendChild(el("span", "lang-dot lang-" + c)));
  return box;
}

function wordButton(i) {
  const b = el("button", "word-chip");
  b.type = "button";
  b.append(el("span", "chip-ko", WORDS[i][HANGUL] + " " + WORDS[i][HANJA]), el("span", "chip-en", meaningOf(i).short));
  b.appendChild(langDots(WORDS[i][CAT], "chip-tags"));
  b.addEventListener("click", () => openWord(i));
  return b;
}

function renderWordPage(i) {
  const w = WORDS[i];
  state.selected = i;   // lets the Vietnamese check finish for this word
  const page = $("word-content");
  page.innerHTML = "";
  document.title = w[HANGUL] + " " + w[HANJA] + " · " + meaningOf(i).short + " · Hanja Roots";

  // Heading
  const hero = el("header", "hero");
  const title = el("h1", "hero-word");
  title.id = "page-title";
  title.tabIndex = -1;
  title.append(el("span", "hero-ko", w[HANGUL]), el("span", "hero-hanja", w[HANJA]));
  hero.appendChild(title);
  hero.appendChild(el("p", "hero-roman", KO_ROMAN[i]));
  const meaning = meaningOf(i);
  hero.appendChild(el("p", "hero-meaning" + (meaning.source === "ko" ? "" : " borrowed"),
    meaning.source === "ko" ? meaning.full : meaning.source === "chars" ? meaning.short : "≈ " + meaning.full));
  if (meaning.source !== "ko") hero.appendChild(el("p", "hero-note", meaningNote(meaning)));
  const facts = el("p", "hero-facts");
  const group = el("button", "fact-group", comboLabel(w[CAT]));
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
      box.append(inked("span", "sound-lang", lang), el("span", "sound-roman", roman));
      if (native !== roman) {
        const n = el("span", "sound-native", native);
        n.lang = { Korean: "ko", Japanese: "ja", Mandarin: "zh-Hans", Cantonese: "zh-Hant", Vietnamese: "vi" }[lang] || "";
        box.appendChild(n);
      }
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
    if (CHAR_MEANING[c]) card.appendChild(el("p", "char-meaning", CHAR_MEANING[c]));

    // How this character is read in this word
    const reads = [];
    if (TANG[c]) reads.push(["Tang era", TANG[c]]);
    if (hangul.length === n) reads.push(["Korean", hangul[k] + " " + romanizeKorean(hangul[k])]);
    const vi = syllableAt(w[VI_WORD], k, n); if (vi) reads.push(["Vietnamese", vi]);
    const yue = syllableAt(w[YUE], k, n); if (yue) reads.push(["Cantonese", yue]);
    const zh = syllableAt(w[ZH_PINYIN], k, n).toLowerCase(); if (zh) reads.push(["Mandarin", pinyinMarks(zh)]);
    if (reads.length) {
      const dl = el("dl", "char-reads");
      reads.forEach(([lang, r]) => dl.append(inked("dt", lang === "Tang era" ? "tang" : "", lang), el("dd", lang === "Tang era" ? "tang" : "", r)));
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
    const uses = others.length + 1;
    card.appendChild(el("p", "char-count", "Used in " + uses.toLocaleString() + " Korean word" + (uses === 1 ? "" : "s") + " on this site."));
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
refresh();
if (wordFromHash() >= 0 || location.hash === "#about") route();

// ---------- No orphans ----------
// Keeps the last two words of every paragraph, list item, and heading together, so a line never ends with one
// word on its own. CSS text-wrap: pretty does this in newer browsers; this covers the rest, including text
// added later (word pages, the side panel).
const ORPHAN_SELECTOR = "p, li, h1, h2, h3, dd, figcaption, .lang-def, .hero-meaning, .hero-summary";
function joinLastWords(root) {
  const els = root.matches && root.matches(ORPHAN_SELECTOR) ? [root] : [];
  if (root.querySelectorAll) els.push(...root.querySelectorAll(ORPHAN_SELECTOR));
  els.forEach(e => {
    // Text nodes from the end: find the last space (it may sit before a link or bold word) and make it non-breaking,
    // as long as what follows it is short
    const nodes = [];
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    let tail = 0;
    for (let k = nodes.length - 1; k >= 0; k--) {
      const v = nodes[k].nodeValue;
      const t = k === nodes.length - 1 ? v.trimEnd() : v;
      const m = /[ \t\n\r]+(?=[^ \t\n\r]*$)/.exec(t);   // the last run of breakable spaces
      if (!m) { tail += t.length; continue; }
      const before = t.slice(0, m.index) + nodes.slice(0, k).map(n => n.nodeValue).join("");
      if (tail + t.length - m.index - m[0].length <= 20 && /\S/.test(before))
        nodes[k].nodeValue = v.slice(0, m.index) + "\u00A0" + v.slice(m.index + m[0].length);
      return;
    }
  });
}
joinLastWords(document.body);
new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) joinLastWords(n); })))
  .observe(document.body, { childList: true, subtree: true });
