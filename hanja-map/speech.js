// Pronunciation using the browser's built-in speech voices (Web Speech API).
// Which voices exist depends on the visitor's device and operating system.

const SPEECH_LANGS = {
  ko: { code: "ko-KR", name: "Korean" },
  zh: { code: "zh-CN", name: "Mandarin Chinese" },
  yue: { code: "zh-HK", name: "Cantonese" },
  ja: { code: "ja-JP", name: "Japanese" },
  vi: { code: "vi-VN", name: "Vietnamese" }
};

const speechSupported = "speechSynthesis" in window;
let speechVoices = [];

function loadVoices() {
  speechVoices = speechSupported ? window.speechSynthesis.getVoices() : [];
}
if (speechSupported) {
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    loadVoices();
    // Re-enable buttons that were waiting for voices to load
    document.querySelectorAll("button.speak").forEach(updateSpeakButton);
  });
}

// Apple's novelty voices (Eddy, Grandma, Rocko, ...) are listed as "Name (Language (Region))";
// prefer standard voices like Yuna, Tingting, Kyoko and Linh, then Google's, then anything else.
const NOVELTY = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/;

// The best voice for a language: an exact region match first, then any voice for the language
function voiceFor(lang) {
  const code = SPEECH_LANGS[lang].code.toLowerCase();
  const base = code.split("-")[0];
  const norm = v => v.lang.toLowerCase().replace("_", "-");
  // Cantonese voices are listed as zh-HK (or yue); never fall back to a Mandarin voice for Cantonese,
  // and don't use a Cantonese voice for Mandarin
  const isCantonese = v => norm(v) === "zh-hk" || norm(v).startsWith("yue");
  const candidates = speechVoices.filter(v => lang === "yue"
    ? isCantonese(v)
    : !isCantonese(v) && (norm(v) === code || norm(v).startsWith(base + "-") || norm(v) === base));
  // Lower score wins: exact region, higher-quality ("Premium"/"Enhanced") voices, standard voices, on-device voices
  const score = v => (norm(v) === code ? 0 : 10) + (/premium|enhanced|neural|natural/i.test(v.name) ? -3 : 0) +
    (NOVELTY.test(v.name) ? 5 : 0) + (v.localService ? 0 : 1);
  return candidates.sort((a, b) => score(a) - score(b))[0] || null;
}

// Browsers drop speech in a few situations, so this works around them:
// - Chrome can garbage-collect an utterance before it plays, so keep a reference to it
// - speaking right after cancel() can be silently ignored, so wait a moment after cancelling
// - Safari ignores the chosen voice unless the utterance's language matches the voice's language
let currentUtterance = null;

function speak(text, lang, button) {
  if (!speechSupported || !text) return;
  if (!speechVoices.length) loadVoices();
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(text);
  const v = voiceFor(lang);
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = SPEECH_LANGS[lang].code; }
  u.rate = 0.85;
  u.onerror = e => { if (button && e.error !== "interrupted" && e.error !== "canceled") showSpeechError(button, e.error); };
  currentUtterance = u;
  const start = () => { if (synth.paused && synth.resume) synth.resume(); synth.speak(u); };
  if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(start, 120); } else { start(); }
}

function showSpeechError(button, error) {
  let note = button.parentNode.querySelector(".speech-error");
  if (!note) {
    note = document.createElement("small");
    note.className = "speech-error";
    button.parentNode.appendChild(note);
  }
  note.textContent = " Couldn't play (" + error + ").";
}

// Which voice each language will use on this device, for the note under a word
function voiceSummary() {
  if (!speechSupported) return "This browser can't speak text aloud.";
  return Object.keys(SPEECH_LANGS).map(lang => {
    const v = voiceFor(lang);
    return SPEECH_LANGS[lang].name + ": " + (v ? v.name : "none installed");
  }).join(" · ");
}

function updateSpeakButton(b) {
  if (b.textContent.includes("native speaker")) return;
  const lang = b.dataset.lang;
  const ok = speechSupported && !!voiceFor(lang);
  b.disabled = !ok;
  const v = ok ? voiceFor(lang) : null;
  b.title = ok
    ? "Hear it in " + SPEECH_LANGS[lang].name + " (voice: " + v.name + ")"
    : speechSupported
      ? "No " + SPEECH_LANGS[lang].name + " voice is installed on this device"
      : "This browser can't speak text aloud";
}

// A "Listen" button for one language. It plays a native speaker recording from Wikimedia Commons
// when one exists (looked up as soon as the button is made), and otherwise the device's voice.
// forms = the spellings a recording might be filed under; text = what the device voice reads.
const RECORD_URL = "https://lingualibre.org/wiki/Special:RecordWizard";

function speakButton(text, lang, label, forms) {
  const wrap = document.createElement("span");
  wrap.className = "listen";
  const b = document.createElement("button");
  b.type = "button";
  b.className = "speak";
  b.dataset.lang = lang;
  b.textContent = "▶ " + (label || "Listen");
  b.setAttribute("aria-label", "Listen to the " + SPEECH_LANGS[lang].name + " pronunciation");
  const credit = document.createElement("small");
  credit.className = "credit";
  wrap.appendChild(b);
  wrap.appendChild(credit);

  let recording = null;
  b.addEventListener("click", () => {
    if (recording) {
      playRecording(recording).catch(() => speak(text, lang, b));
    } else {
      speak(text, lang, b);
    }
  });
  updateSpeakButton(b);

  // Look for a native recording
  if (forms && forms.length) {
    credit.textContent = " Checking for a native recording…";
    findRecording(lang, forms).then(rec => {
      credit.textContent = "";
      if (rec) {
        recording = rec;
        b.disabled = false;
        b.textContent = "▶ " + (label || "Listen") + " (native speaker)";
        b.title = "Recording by " + rec.speaker + " on " + rec.source;
        credit.appendChild(document.createTextNode(" Recorded by " + rec.speaker + " · " + rec.license + " · "));
        credit.appendChild(makeAnchor(rec.page, rec.source));
      } else {
        credit.appendChild(document.createTextNode(" No native recording yet. "));
        credit.appendChild(makeAnchor(RECORD_URL, "Record it on Lingua Libre"));
      }
    }).catch(() => { credit.textContent = ""; });
  }
  return wrap;
}

function makeAnchor(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}
