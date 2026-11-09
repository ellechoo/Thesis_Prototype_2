// Live lookups for name meanings.
//
// These call free public APIs straight from the browser, so the site needs no server:
//   - Wiktionary (en.wiktionary.org): etymology of a given name, and the Korean
//     reading and meaning (음훈) of a Hanja character.
//   - Wikipedia (en.wikipedia.org): a short summary of a "(given name)" article.
// Text from Wiktionary and Wikipedia is licensed CC BY-SA 4.0, so the site always
// shows where it came from and links back to the page.

const WIKTIONARY_API = "https://en.wiktionary.org/w/api.php";
const WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";

// Remembers results so the same name isn't fetched twice
const lookupCache = {};

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

// Fetch a Wiktionary page as parsed HTML. Returns null if the page doesn't exist.
async function fetchWiktionaryPage(title) {
  const key = "wikt:" + title;
  if (key in lookupCache) return lookupCache[key];
  const url = WIKTIONARY_API + "?action=parse&format=json&formatversion=2&prop=text&redirects=1&origin=*&page=" +
    encodeURIComponent(title);
  const res = await fetch(url);
  if (!res.ok) throw new Error("Wiktionary request failed");
  const json = await res.json();
  const result = json.error ? null : {
    title: json.parse.title,
    url: "https://en.wiktionary.org/wiki/" + encodeURIComponent(json.parse.title.replace(/ /g, "_")),
    doc: new DOMParser().parseFromString(json.parse.text, "text/html")
  };
  lookupCache[key] = result;
  return result;
}

// Is this element a heading of the given level (2 = language, 3+ = sub-sections)?
// Handles both Wiktionary's newer markup (<div class="mw-heading mw-heading2"><h2>)
// and the older one (<h2><span class="mw-headline">).
function headingLevel(el) {
  if (!el || el.nodeType !== 1) return 0;
  const m = (el.className || "").match(/mw-heading(\d)/);
  if (m) return Number(m[1]);
  const h = el.tagName.match(/^H(\d)$/);
  return h ? Number(h[1]) : 0;
}

function headingText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll(".mw-editsection").forEach(n => n.remove());
  return clone.textContent.trim();
}

// Clean text from a node: drop footnote markers, edit links, and hidden bits
function cleanText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll("sup, .mw-editsection, style, .maintenance-line, .previewonly, ul, dl, ol").forEach(n => n.remove());
  return clone.textContent.replace(/\s+/g, " ").trim();
}

// Returns the top-level nodes of one language section (e.g. "English", "Korean").
// If language is null, returns the first language section on the page.
function languageSection(doc, language) {
  // A flat list of headings, paragraphs and lists in reading order. This works whether
  // the page's sections are flat or wrapped in <section> elements.
  const nodes = Array.from(doc.querySelectorAll(".mw-heading, h2, h3, h4, h5, h6, p, ol"))
    .filter(el => !(/^H\d$/.test(el.tagName) && el.parentElement.classList.contains("mw-heading")))
    .filter(el => !(el.tagName === "OL" && el.parentElement.closest("ol")))
    .filter(el => !(el.tagName === "P" && el.closest("li")));
  let start = -1;
  let name = null;
  for (let i = 0; i < nodes.length; i++) {
    if (headingLevel(nodes[i]) === 2) {
      const text = headingText(nodes[i]);
      if (!language ? text !== "Translingual" : text === language) { start = i; name = text; break; }
    }
  }
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < nodes.length && headingLevel(nodes[i]) !== 2; i++) out.push(nodes[i]);
  return { language: name, nodes: out };
}

// Paragraphs that follow the first heading starting with `label`, until the next heading
function textAfterHeading(nodes, label, tag) {
  for (let i = 0; i < nodes.length; i++) {
    if (headingLevel(nodes[i]) >= 3 && headingText(nodes[i]).startsWith(label)) {
      const parts = [];
      for (let j = i + 1; j < nodes.length && headingLevel(nodes[j]) === 0; j++) {
        if (nodes[j].tagName === tag) parts.push(nodes[j]);
      }
      return parts;
    }
  }
  return [];
}

// Look up a given name on Wiktionary.
// Returns { language, etymology, definition, url } or null if nothing was found.
async function lookupNameWiktionary(name) {
  const tries = [capitalize(name), name];
  for (const title of tries) {
    const page = await fetchWiktionaryPage(title);
    if (!page) continue;
    const section = languageSection(page.doc, "English") || languageSection(page.doc, null);
    if (!section) continue;

    const etymology = textAfterHeading(section.nodes, "Etymology", "P").map(cleanText).filter(Boolean).join(" ");

    // The "Proper noun" definition, e.g. "A male given name from Irish."
    let definition = "";
    const lists = textAfterHeading(section.nodes, "Proper noun", "OL");
    if (lists.length) {
      const items = Array.from(lists[0].children).map(cleanText).filter(t => /given name/i.test(t));
      definition = items.join(" ");
    }
    if (!etymology && !definition) continue;
    return { language: section.language, etymology, definition, url: page.url };
  }
  return null;
}

// Look up a short Wikipedia summary for "<Name> (given name)" or "<Name> (name)".
// Returns { title, extract, url } or null.
async function lookupNameWikipedia(name) {
  const base = capitalize(name);
  for (const title of [base + " (given name)", base + " (name)"]) {
    const key = "wp:" + title;
    if (!(key in lookupCache)) {
      const res = await fetch(WIKIPEDIA_SUMMARY + encodeURIComponent(title.replace(/ /g, "_")));
      lookupCache[key] = res.ok ? await res.json() : null;
    }
    const j = lookupCache[key];
    if (j && j.type !== "disambiguation" && j.extract) {
      return { title: j.title, extract: j.extract, url: j.content_urls ? j.content_urls.desktop.page : "" };
    }
  }
  return null;
}

// Look up the Korean reading and meaning (음훈, eumhun) of one Hanja on Wiktionary,
// e.g. 智 -> "슬기 지" (meaning 슬기 "wisdom", sound 지 "ji").
// Returns { eumhun, url } or null.
async function lookupHanjaEumhun(ch) {
  const page = await fetchWiktionaryPage(ch);
  if (!page) return null;
  const section = languageSection(page.doc, "Korean");
  if (!section) return null;
  const text = section.nodes.map(n => n.textContent).join(" ");
  const found = [];
  const re = /eumhun\s*[:：]?\s*([가-힣][가-힣 ,]*[가-힣])/g;
  let m;
  while ((m = re.exec(text))) {
    const v = m[1].trim();
    if (!found.includes(v)) found.push(v);
  }
  return found.length ? { eumhun: found.join(", "), url: page.url } : null;
}

// Find the English Wikipedia article about a Korean given name written in Hangul (e.g. 지연 -> "Ji-yeon").
// Searches Wikipedia, then confirms the match by checking that the article's Korean name
// info box is for exactly this name ("hangul = 지연"), so a page that only mentions the
// name somewhere isn't picked by mistake.
// Returns { title, extract, url } or null.
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&";

async function lookupKoreanNameWikipedia(hangul) {
  const key = "kowp:" + hangul;
  if (key in lookupCache) return lookupCache[key];

  const search = await fetch(WIKIPEDIA_API + "action=query&list=search&srlimit=10&srsearch=" +
    encodeURIComponent('"' + hangul + '" "Korean given name"')).then(r => r.json());
  const titles = (search.query ? search.query.search : []).map(s => s.title)
    .filter(t => !/^(List of|Korean name)/.test(t));

  let found = null;
  if (titles.length) {
    const pages = await fetch(WIKIPEDIA_API + "action=query&prop=revisions&rvprop=content&rvslots=main&titles=" +
      encodeURIComponent(titles.join("|"))).then(r => r.json());
    const infobox = new RegExp("hangul\\s*=\\s*(%_)?" + hangul + "\\s*[\\n|}]");
    const match = titles
      .map(t => pages.query.pages.find(p => p.title === t))
      .find(p => p && p.revisions && infobox.test(p.revisions[0].slots.main.content.slice(0, 1500)));
    if (match) {
      const res = await fetch(WIKIPEDIA_SUMMARY + encodeURIComponent(match.title.replace(/ /g, "_")));
      if (res.ok) {
        const j = await res.json();
        found = { title: j.title, extract: j.extract, url: j.content_urls ? j.content_urls.desktop.page : "" };
      }
    }
  }
  lookupCache[key] = found;
  return found;
}
