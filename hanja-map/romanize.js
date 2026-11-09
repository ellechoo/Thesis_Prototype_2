// Romanization helpers, so readers who don't know Hangul or kana can read and search words.

// ---------- Korean: Revised Romanization ----------
// A simplified version of South Korea's official system. It romanizes letter by letter and
// moves a final consonant onto a following silent ㅇ (국어 → gugeo), but it doesn't apply
// every sound-change rule (for example 신라 is romanized "sinra", not "silla").
const KO_INITIAL = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const KO_VOWEL = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
// Each final consonant: [romanized at the end of a syllable, romanized when it moves to a following ㅇ]
const KO_FINAL = [
  ["", ""], ["k", "g"], ["k", "kk"], ["k", "ks"], ["n", "n"], ["n", "nj"], ["n", "nh"], ["t", "d"],
  ["l", "r"], ["k", "lg"], ["m", "lm"], ["l", "lb"], ["l", "ls"], ["l", "lt"], ["p", "lp"], ["l", "lh"],
  ["m", "m"], ["p", "b"], ["p", "bs"], ["t", "s"], ["t", "ss"], ["ng", "ng"], ["t", "j"], ["t", "ch"],
  ["k", "k"], ["t", "t"], ["p", "p"], ["t", "h"]
];

function romanizeKorean(text) {
  const syllables = Array.from(text).map(ch => {
    const code = ch.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return null;
    return { i: Math.floor(code / 588), v: Math.floor((code % 588) / 28), f: code % 28 };
  });
  let out = "";
  Array.from(text).forEach((ch, n) => {
    const s = syllables[n];
    if (!s) { out += ch; return; }
    const prev = syllables[n - 1];
    const next = syllables[n + 1];
    // The initial is silent if the previous final consonant moved onto it
    let initial = KO_INITIAL[s.i];
    if (s.i === 11 && prev && prev.f && prev.f !== 21) initial = "";
    else if (s.i === 5 && prev && prev.f === 8) initial = "l";   // ㄹ + ㄹ → ll
    let final = "";
    if (s.f) {
      if (next && next.i === 11 && s.f !== 21) final = KO_FINAL[s.f][1];
      else final = KO_FINAL[s.f][0];
    }
    out += initial + KO_VOWEL[s.v] + final;
  });
  return out;
}

// ---------- Japanese: Hepburn romanization ----------
const KANA = {
  "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
  "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko", "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
  "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so", "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
  "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to", "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
  "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
  "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho", "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
  "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
  "ま": "ma", "み": "mi", "む": "mu", "め": "me", "も": "mo",
  "や": "ya", "ゆ": "yu", "よ": "yo",
  "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
  "わ": "wa", "ゐ": "i", "ゑ": "e", "を": "o", "ん": "n", "ゔ": "vu",
  "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o"
};
const SMALL_Y = { "ゃ": "a", "ゅ": "u", "ょ": "o" };

// Katakana → hiragana, so both can be handled the same way
function toHiragana(s) {
  return s.replace(/[\u30A1-\u30F6]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function kanaToRomaji(text) {
  const s = Array.from(toHiragana(text));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], next = s[i + 1];
    if (ch === "っ") {                       // doubles the next consonant
      const r = kanaToRomaji(s.slice(i + 1).join("")).charAt(0);
      out += r === "c" ? "t" : r;
      continue;
    }
    if (ch === "ー") { out += out.slice(-1); continue; }   // long vowel mark
    let r = KANA[ch];
    if (r === undefined) { out += ch; continue; }
    if (next && SMALL_Y[next] && r.endsWith("i") && r.length > 1) {
      const base = r.slice(0, -1);
      r = (base === "sh" || base === "ch" || base === "j" ? base : base + "y") + SMALL_Y[next];
      i++;
    }
    if (ch === "ん" && next && /^[aiueoy]/.test(KANA[next] || "")) r = "n'";
    out += r;
  }
  return out;
}

// ---------- Matching helpers ----------

// Loose form for comparing romanized spellings: lowercase, letters only,
// and long vowels collapsed so "gakkou", "gakkō" and "gakko" all match
function looseRoman(s) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/ou/g, "o").replace(/uu/g, "u").replace(/oo/g, "o").replace(/aa/g, "a").replace(/ii/g, "i").replace(/ee/g, "e");
}

// Pinyin without tones or spaces: "xue2 xiao4" → "xuexiao"
function plainPinyin(s) {
  return s.toLowerCase().replace(/u:/g, "u").replace(/ü/g, "u").replace(/[^a-z]/g, "");
}

// Vietnamese without tone marks or spaces: "học hiệu" → "hochieu"
function plainVietnamese(s) {
  return (s || "").toLowerCase().replace(/đ/g, "d")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}
