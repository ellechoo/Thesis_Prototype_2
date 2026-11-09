// Native speaker recordings from Wikimedia Commons.
// Looks up a word live, plays a real person's recording when one exists, and credits them.
// Recordings come mostly from Lingua Libre (https://lingualibre.org), plus older Commons
// collections such as the Shtooka Project (Mandarin) and the general Cantonese, Japanese,
// Korean, and Vietnamese pronunciation categories. Each file keeps its own license.

const COMMONS_API = "https://commons.wikimedia.org/w/api.php?format=json&formatversion=2&origin=*&";

// Lingua Libre names files "LL-<Wikidata language ID> (<code>)-<speaker>-<word>.wav"
const LINGUA_LIBRE = { ko: "Q9176", zh: "Q9192", yue: "Q9186", ja: "Q5287", vi: "Q9199" };
// Older Commons files are named "<Prefix>-<word or romanization>.ogg"
const OLD_PREFIXES = { ko: ["Ko"], zh: ["Zh", "Cmn"], yue: ["Yue"], ja: ["Ja"], vi: ["Vi"] };
const OLD_EXTENSIONS = [".ogg", ".oga", ".wav", ".mp3"];

const recordingCache = {};

// The word part of a Commons file name
function recordingKey(title) {
  const t = title.replace(/^File:/, "").replace(/\.(wav|ogg|oga|mp3|flac|webm|opus)$/i, "").normalize("NFC");
  let m = t.match(/^LL-Q\d+ \([^)]*\)-.*-(.+)$/);
  if (m) return m[1].trim();
  m = t.match(/^[A-Za-z]{2,3}-(.+)$/);
  return (m ? m[1] : t).trim();
}

function stripTags(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent.replace(/\s+/g, " ").trim();
}

// Picks a playable URL: an MP3 copy if Commons made one (Safari can't play Ogg), else the original
function playableUrl(info) {
  const derivatives = info.derivatives || [];
  const mp3 = derivatives.find(d => /audio\/mpeg/.test(d.type || ""));
  return mp3 ? mp3.src : info.url;
}

function toRecording(page) {
  const info = (page.videoinfo || page.imageinfo || [])[0];
  if (!info) return null;
  const meta = info.extmetadata || {};
  const ll = page.title.match(/^File:LL-Q\d+ \([^)]*\)-(.*)-[^-]+\.\w+$/);
  return {
    title: page.title,
    url: playableUrl(info),
    page: "https://commons.wikimedia.org/wiki/" + encodeURIComponent(page.title.replace(/ /g, "_")),
    speaker: ll ? ll[1] : stripTags(meta.Artist && meta.Artist.value) || "a contributor",
    license: stripTags(meta.LicenseShortName && meta.LicenseShortName.value) || "see file page",
    source: ll ? "Lingua Libre" : "Wikimedia Commons"
  };
}

const INFO_PROPS = "prop=videoinfo&viprop=url|derivatives|extmetadata&viextmetadatafilter=Artist|LicenseShortName";

// Finds a recording of exactly this word. forms = the spellings to accept, most likely first
// (for example the characters plus a romanization). Returns a recording or null.
async function findRecording(lang, forms) {
  forms = forms.filter(Boolean).map(f => f.normalize("NFC"));
  if (!forms.length) return null;
  const cacheKey = lang + ":" + forms.join("|");
  if (cacheKey in recordingCache) return recordingCache[cacheKey];

  const wanted = new Set(forms.flatMap(f => [f, f.toLowerCase()]));
  const matches = p => {
    if (!p || p.missing) return false;
    const k = recordingKey(p.title);
    return wanted.has(k) || wanted.has(k.toLowerCase());
  };
  let found = null;

  // 1. Lingua Libre: search titles for the word within that language's recordings,
  //    one spelling at a time (combining them with OR doesn't search reliably)
  for (const f of forms.slice(0, 3)) {
    const query = 'intitle:"LL-' + LINGUA_LIBRE[lang] + '" intitle:"' + f.replace(/"/g, "") + '"';
    const search = await fetch(COMMONS_API + "action=query&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=" +
      encodeURIComponent(query) + "&" + INFO_PROPS).then(r => r.json());
    const hits = (search.query ? search.query.pages : []).filter(matches);
    if (hits.length) { found = toRecording(hits[0]); break; }
  }

  // 2. Older collections: check the exact file names they use
  if (!found) {
    const titles = [];
    OLD_PREFIXES[lang].forEach(pre => forms.forEach(f => OLD_EXTENSIONS.forEach(ext => titles.push("File:" + pre + "-" + f + ext))));
    for (let i = 0; i < titles.length && !found; i += 50) {
      const r = await fetch(COMMONS_API + "action=query&titles=" + encodeURIComponent(titles.slice(i, i + 50).join("|")) + "&" + INFO_PROPS)
        .then(r => r.json());
      const page = (r.query ? r.query.pages : []).find(p => !p.missing && (p.videoinfo || p.imageinfo));
      if (page) found = toRecording(page);
    }
  }

  recordingCache[cacheKey] = found;
  return found;
}

let currentAudio = null;

function playRecording(rec) {
  if (currentAudio) currentAudio.pause();
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  currentAudio = new Audio(rec.url);
  return currentAudio.play();
}
