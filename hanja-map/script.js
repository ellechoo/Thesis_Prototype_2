// Shared Characters: Korean Hanja words, grouped by which other languages
// (Chinese, Japanese, Vietnamese) use the same characters as a word.

// Row fields (see words.js)
const HANGUL = 0, HANJA = 1, KO_MEANING = 2, CAT = 3, LEVEL = 4,
      ZH_PINYIN = 5, ZH_MEANING = 6, JP_FORM = 7, JP_READING = 8, JP_MEANING = 9,
      ZH_SIMPLIFIED = 10, VI_WORD = 11, VI_MEANING = 12, KO_SOURCE = 13, YUE = 14;

// "Everyday" words: beginner and intermediate vocabulary in the Basic Korean Dictionary
const isEveryday = w => w[LEVEL] === "beginner" || w[LEVEL] === "intermediate";
const LEVEL_ORDER = { beginner: 0, intermediate: 1, advanced: 2 };

// Romanized spellings for each word, worked out once (see romanize.js)
const KO_ROMAN = WORDS.map(w => romanizeKorean(w[HANGUL]));
const JP_ROMAN = WORDS.map(w => w[JP_READING] ? kanaToRomaji(w[JP_READING]) : "");
// Loose search keys
const KEY_KO = KO_ROMAN.map(looseRoman);
const KEY_JP = JP_ROMAN.map(looseRoman);
const KEY_ZH = WORDS.map(w => plainPinyin(w[ZH_PINYIN]));
const KEY_JP_KANA = WORDS.map(w => toHiragana(w[JP_READING]));
const KEY_VI = WORDS.map(w => plainVietnamese(w[VI_WORD]));
const KEY_YUE = WORDS.map(w => (w[YUE] || "").replace(/[^a-z]/g, ""));

const LANG_NAME = { z: "Chinese", j: "Japanese", v: "Vietnamese" };

// Every combination of languages, arranged in columns by how many languages share the word
const COLUMNS = [
  { title: "Shared with all three", groups: ["zjv"] },
  { title: "Shared with two", groups: ["zj", "jv", "zv"] },
  { title: "Shared with one", groups: ["j", "z", "v"] },
  { title: "Not shared", groups: [""] }
];

function groupName(cat) {
  if (!cat) return "None of them";
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

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");
const $ = id => document.getElementById(id);

let layout = null;        // geometry and dot positions for the current size
let selected = -1;        // index of the selected word
let matches = new Set();  // indexes of search matches

// ---------- Layout ----------

// Small seeded random number generator, so the layout looks the same every time
function seededRandom(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildLayout() {
  const width = canvas.clientWidth;
  let height = Math.round(Math.min(Math.max(width * 0.72, 460), 760));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.height = height + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const top = 34, labelH = 30, gap = 14, side = 12;

  // Every circle's area is proportional to its word count: r = s * sqrt(count).
  // Find the largest s where all columns fit the width and height.
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
  let lo = 0, hi = 50;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
  const s = lo;

  // Trim unused height below the tallest column
  const tallest = Math.max(...COLUMNS.map(col => {
    const rs = col.groups.map(g => s * Math.sqrt(COUNTS[g] || 0));
    return top + rs.reduce((sum, r) => sum + 2 * r + labelH, 0) + gap * (rs.length - 1);
  }));
  if (tallest + 10 < height) {
    height = Math.round(tallest + 10);
    canvas.height = height * dpr;
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Place the circles, centering each column vertically
  const circles = {};
  const colWidths = COLUMNS.map(col => Math.max(...col.groups.map(g => 2 * s * Math.sqrt(COUNTS[g] || 0)), 110));
  const totalW = colWidths.reduce((a, b) => a + b, 0) + gap * (COLUMNS.length - 1);
  let x = (width - totalW) / 2;
  const colX = [];
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

  // Put each word at a random spot inside its group's circle
  const rand = seededRandom(7);
  const total = WORDS.length;
  const xs = new Float32Array(total), ys = new Float32Array(total);
  WORDS.forEach((w, i) => {
    const c = circles[w[CAT]];
    let px, py;
    do { px = (rand() * 2 - 1); py = (rand() * 2 - 1); } while (px * px + py * py > 1);
    xs[i] = c.x + px * c.r * 0.97;
    ys[i] = c.y + py * c.r * 0.97;
  });

  // Grid index for fast hover lookups
  const cell = 10, grid = new Map();
  for (let i = 0; i < total; i++) {
    const key = Math.floor(xs[i] / cell) + "," + Math.floor(ys[i] / cell);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }

  const dot = Math.max(0.8, s * 0.6);
  layout = { width, height, circles, colX, xs, ys, grid, cell, dot, labelH };
}

// ---------- Drawing ----------

function draw() {
  const { width, height, circles, colX, xs, ys, dot } = layout;
  const everyday = $("everyday").checked;
  ctx.clearRect(0, 0, width, height);

  // Dots: faint ones first, then highlighted ones on top
  const faint = [], strong = [];
  for (let i = 0; i < WORDS.length; i++) {
    const isStrong = matches.size ? matches.has(i) : everyday ? isEveryday(WORDS[i]) : true;
    (isStrong ? strong : faint).push(i);
  }
  ctx.fillStyle = "rgba(0,0,0,0.10)";
  ctx.beginPath();
  faint.forEach(i => { ctx.moveTo(xs[i] + dot, ys[i]); ctx.arc(xs[i], ys[i], dot, 0, Math.PI * 2); });
  ctx.fill();
  ctx.fillStyle = matches.size || everyday ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.5)";
  ctx.beginPath();
  strong.forEach(i => { ctx.moveTo(xs[i] + dot, ys[i]); ctx.arc(xs[i], ys[i], dot, 0, Math.PI * 2); });
  ctx.fill();

  // Circle outlines and labels
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  Object.entries(circles).forEach(([g, c]) => {
    ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(c.r, 2), 0, Math.PI * 2); ctx.stroke();
    ctx.font = "500 13px Inter, system-ui, sans-serif";
    ctx.fillText(groupName(g), c.x, c.y + c.r + 14);
    ctx.font = "12px Inter, system-ui, sans-serif";
    ctx.fillText((COUNTS[g] || 0).toLocaleString() + " words", c.x, c.y + c.r + 27);
  });
  ctx.font = "500 14px Inter, system-ui, sans-serif";
  COLUMNS.forEach((col, ci) => ctx.fillText(col.title, colX[ci], 18));

  // Selected word
  if (selected >= 0) {
    const x = xs[selected], y = ys[selected];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, dot + 6, 0, Math.PI * 2); ctx.stroke();
    const label = wordLabel(selected);
    ctx.font = "500 15px Inter, system-ui, sans-serif";
    const w = ctx.measureText(label).width + 10;
    const lx = Math.min(Math.max(x - w / 2, 2), width - w - 2);
    const ly = y - dot - 32 < 2 ? y + dot + 10 : y - dot - 32;
    ctx.fillStyle = "#fff"; ctx.fillRect(lx, ly, w, 22);
    ctx.strokeRect(lx, ly, w, 22);
    ctx.fillStyle = "#000"; ctx.textAlign = "left";
    ctx.fillText(label, lx + 5, ly + 16);
  }
}

// ---------- Hover and click ----------

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

function pointer(e) {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

canvas.addEventListener("mousemove", e => {
  const [x, y] = pointer(e);
  const i = nearestWord(x, y);
  if (i < 0) { tooltip.hidden = true; return; }
  tooltip.textContent = WORDS[i][HANGUL] + " (" + KO_ROMAN[i] + ") " + WORDS[i][HANJA] + " · " + WORDS[i][KO_MEANING];
  tooltip.hidden = false;
  tooltip.style.left = Math.min(x + 12, layout.width - tooltip.offsetWidth - 4) + "px";
  tooltip.style.top = (y + 14) + "px";
});
canvas.addEventListener("mouseleave", () => { tooltip.hidden = true; });
canvas.addEventListener("click", e => {
  const [x, y] = pointer(e);
  const i = nearestWord(x, y);
  if (i >= 0) select(i);
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

function select(i) {
  selected = i;
  const w = WORDS[i];
  const panel = $("detail");
  panel.hidden = false;
  panel.innerHTML = "";

  const title = document.createElement("h2");
  title.textContent = "“" + englishShort(w[KO_MEANING]) + "”";
  panel.appendChild(title);

  const head = document.createElement("p");
  head.textContent = "Written " + w[HANJA] + ". " + sharedSentence(w[CAT]) +
    (w[LEVEL] ? " Korea's Basic Korean Dictionary lists it as " + (w[LEVEL] === "intermediate" ? "an " : "a ") + w[LEVEL] + "-level word." : "");
  panel.appendChild(head);

  // How the same characters sound across the languages that share them
  const sounds = [["Korean", KO_ROMAN[i]]];
  if (w[VI_WORD]) sounds.push(["Vietnamese", w[VI_WORD]]);
  if (w[JP_MEANING]) sounds.push(["Japanese", JP_ROMAN[i]]);
  if (w[YUE]) sounds.push(["Cantonese", w[YUE].replace(/[1-6]/g, "")]);
  if (w[ZH_MEANING]) sounds.push(["Mandarin", pinyinMarks(w[ZH_PINYIN])]);
  if (sounds.length > 1) {
    const line = document.createElement("p");
    line.className = "sounds";
    line.textContent = "How " + w[HANJA] + " sounds: " + sounds.map(([l, t]) => l + " " + t).join(" · ");
    panel.appendChild(line);
  }

  const cols = document.createElement("div");
  cols.className = "cols";
  cols.appendChild(column("Korean", "Hangul, with Hanja", w[HANGUL] + " " + w[HANJA], KO_ROMAN[i], w[KO_MEANING],
    w[KO_SOURCE].includes("k") ? "From the Basic Korean Dictionary." : "From kengdic only, a community dictionary.",
    { text: w[HANGUL], lang: "ko" }));
  cols.appendChild(w[ZH_MEANING]
    ? column("Chinese", "hanzi, with Mandarin pinyin and Cantonese Jyutping",
        w[HANJA] + (w[ZH_SIMPLIFIED] && w[ZH_SIMPLIFIED] !== w[HANJA] ? " (simplified: " + w[ZH_SIMPLIFIED] + ")" : ""),
        "Mandarin: " + pinyinMarks(w[ZH_PINYIN]) + (w[YUE] ? " · Cantonese: " + w[YUE] : ""), w[ZH_MEANING], "",
        [{ text: w[ZH_SIMPLIFIED] || w[HANJA], lang: "zh", label: "Mandarin" }, { text: w[YUE] ? w[HANJA] : "", lang: "yue", label: "Cantonese" }])
    : column("Chinese", "hanzi", w[HANJA], "", "", "Not a word in the Chinese dictionary used here (CC-CEDICT)"));
  cols.appendChild(w[JP_MEANING]
    ? column("Japanese", "kanji, with kana and romaji", w[JP_FORM], w[JP_READING] + " · " + JP_ROMAN[i], w[JP_MEANING],
        w[JP_FORM] !== w[HANJA] ? "Japan writes some characters in a simpler modern form." : "",
        { text: w[JP_READING], lang: "ja" })
    : column("Japanese", "kanji", w[HANJA], "", "", "Not a word in the Japanese dictionary used here (JMdict)"));
  const viCol = w[VI_MEANING]
    ? column("Vietnamese", "written in the Latin alphabet today", w[VI_WORD], "", w[VI_MEANING],
        "Matched by its Sino-Vietnamese reading.", { text: w[VI_WORD], lang: "vi" })
    : column("Vietnamese", "Sino-Vietnamese", "", "", "", "No Vietnamese word with this reading was found in the dictionary used here.");
  cols.appendChild(viCol);
  panel.appendChild(cols);
  if (w[VI_WORD]) checkVietnamese(i, viCol);

  const voiceNote = document.createElement("p");
  voiceNote.className = "voice-note";
  voiceNote.textContent = "Pronunciations use your device's built-in voices, so they may sound robotic or occasionally misread a word. " +
    "Japanese is read from its kana spelling. If a Listen button is grayed out, your device has no voice for that language. " +
    "Voices on this device: " + voiceSummary();
  panel.appendChild(voiceNote);

  const more = document.createElement("p");
  more.appendChild(makeLink("https://en.wiktionary.org/wiki/" + encodeURIComponent(w[HANJA]), "Look up " + w[HANJA] + " on Wiktionary"));
  panel.appendChild(more);

  draw();
}

function makeLink(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

function column(lang, script, word, reading, meaning, note, say) {
  const div = document.createElement("div");
  const h = document.createElement("h3");
  h.textContent = lang;
  div.appendChild(h);
  const sub = document.createElement("small");
  sub.textContent = script;
  div.appendChild(sub);
  if (word) {
    const big = document.createElement("div");
    big.className = "word";
    big.textContent = word;
    div.appendChild(big);
  }
  if (reading) {
    const r = document.createElement("div");
    r.className = "reading";
    r.textContent = reading;
    div.appendChild(r);
  }
  [].concat(say || []).forEach(x => { if (x.text) div.appendChild(speakButton(x.text, x.lang, x.label)); });
  const m = document.createElement("p");
  if (meaning) m.textContent = meaning;
  else { m.className = "missing"; m.textContent = note; }
  div.appendChild(m);
  if (meaning && note) {
    const n = document.createElement("small");
    n.className = "note";
    n.textContent = note;
    div.appendChild(n);
  }
  return div;
}

// Vietnamese words are matched by sound, so check Wiktionary live to see which
// characters it lists for the Vietnamese word, and say if they differ.
const viCheckCache = {};
async function checkVietnamese(i, col) {
  const w = WORDS[i];
  const status = document.createElement("small");
  status.className = "note";
  status.textContent = " Checking Wiktionary…";
  col.appendChild(document.createElement("br"));
  col.appendChild(status);
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
        const section = start >= 0 ? text.slice(start, start + 4000) : "";
        han = Array.from(new Set(section.match(/[一-鿿㐀-䶿]{2,}/g) || []));
      }
      viCheckCache[w[VI_WORD]] = han;
    }
    if (selected !== i) return;
    const han = viCheckCache[w[VI_WORD]];
    const forms = [w[HANJA], w[JP_FORM], w[ZH_SIMPLIFIED]].filter(Boolean);
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
    if (selected === i) status.textContent = " Couldn't reach Wiktionary to check this match.";
  }
}

// ---------- Search ----------

// Searches in any of the four languages, in romanized spelling, or in English.
// Exact matches come first, then words that start with the search, then others.
function search(q) {
  q = q.trim();
  const results = $("results");
  results.innerHTML = "";
  matches = new Set();
  if (!q) { draw(); return; }

  const isHangul = /[가-힣]/.test(q);
  const isKana = /[぀-ヿ]/.test(q);
  const isHan = /[一-鿿]/.test(q);
  const lower = q.toLowerCase();
  const loose = looseRoman(q);
  const pin = plainPinyin(q);
  const viKey = plainVietnamese(q);
  const hasViMarks = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(q);
  const wordRe = new RegExp("\\b" + lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const ranked = [[], [], []];   // exact, starts with, contains / meaning match
  const kana = toHiragana(q);

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
    else if (isHan) { test(w[HANJA], q); test(w[JP_FORM], q); test(w[ZH_SIMPLIFIED], q); }
    else if (hasViMarks) {
      // Vietnamese with tone marks: compare exactly
      if (w[VI_WORD] && w[VI_WORD].toLowerCase() === lower) rank = 0;
      else if (w[VI_WORD] && w[VI_WORD].toLowerCase().startsWith(lower)) rank = 1;
    } else {
      // Romanized Korean, Japanese, Chinese, or Vietnamese without tone marks
      [[KEY_KO[i], loose], [KEY_JP[i], loose], [KEY_ZH[i], pin], [KEY_VI[i], viKey], [KEY_YUE[i], pin]].forEach(([value, key]) => {
        if (!key || key.length < 2 || !value) return;
        if (value === key) rank = 0;
        else if (value.startsWith(key) && key.length >= 3 && rank !== 0) rank = 1;
      });
      // English meanings in all four languages
      if (rank < 0) {
        const meanings = [w[KO_MEANING], w[ZH_MEANING], w[JP_MEANING], w[VI_MEANING]].map(m => m.toLowerCase());
        if (meanings[0] === lower || englishShort(meanings[0]) === lower) rank = 0;
        else if (meanings.some(m => wordRe.test(m))) rank = 2;
      }
    }
    if (rank >= 0) ranked[rank].push(i);
  });

  // Everyday words first within each group
  const byLevel = (a, b) => (LEVEL_ORDER[WORDS[a][LEVEL]] ?? 3) - (LEVEL_ORDER[WORDS[b][LEVEL]] ?? 3);
  const found = ranked.flatMap(list => list.sort(byLevel));
  found.forEach(i => matches.add(i));

  const summary = document.createElement("p");
  summary.textContent = found.length
    ? found.length.toLocaleString() + " match" + (found.length === 1 ? "" : "es") + (found.length > 30 ? ", showing the first 30" : "")
    : "No words here match “" + q + "”. Try another spelling or an English word.";
  results.appendChild(summary);
  found.slice(0, 30).forEach(i => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = wordLabel(i);
    b.addEventListener("click", () => select(i));
    results.appendChild(b);
  });
  if (ranked[0].length === 1 || found.length === 1) select(found[0]);
  else {
    // Clear an earlier word that isn't part of these results
    if (selected >= 0 && !matches.has(selected)) { selected = -1; $("detail").hidden = true; }
    draw();
  }
}

let searchTimer = null;
$("search").addEventListener("input", e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => search(e.target.value), 200);
});
$("random").addEventListener("click", () => {
  const pool = $("everyday").checked ? WORDS.map((w, i) => isEveryday(w) ? i : -1).filter(i => i >= 0) : WORDS.map((_, i) => i);
  select(pool[Math.floor(Math.random() * pool.length)]);
});
$("everyday").addEventListener("change", draw);
document.querySelectorAll("[data-example]").forEach(b => b.addEventListener("click", () => {
  $("search").value = b.dataset.example;
  search(b.dataset.example);
}));

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { buildLayout(); draw(); }, 150);
});

buildLayout();
draw();
