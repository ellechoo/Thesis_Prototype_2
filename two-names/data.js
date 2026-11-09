// Seed data for the Two Names prototype.
// These are FICTIONAL sample entries. Replace them with your interview data.
//
// birthYear is the earliest year one of the names was given; the timeline starts there.
//
// meaningSource can be:
//   "family"    = the person knew it (told by family, or knew themselves)
//   "suggested" = picked or kept from the site's suggestions
//   "unknown"   = not known yet

const SEED_ENTRIES = [
  {
    id: "s1",
    sample: true,
    familyId: "f1",
    generation: "immigrant",
    birthYear: 1968,
    privacy: "first",
    korean: {
      given: ["미", "영"],
      hanja: ["美", "英"],
      meaning: "beautiful, outstanding",
      meaningSource: "family",
      givenBy: "grandparents",
      when: "birth",
      year: 1968,
      status: "middle",
      use: 2
    },
    english: {
      first: "Grace",
      meaning: "From the English word grace, from Latin gratia",
      meaningSource: "family",
      reason: "I picked Grace from a hymn we sang the week I started my first job here.",
      givenBy: "self",
      when: "later",
      year: 1994,
      status: "legal",
      use: 5
    },
    country: "South Korea",
    movedYear: 1992,
    usedBy: { korean: "Family, church friends", english: "Work, neighbors" },
    onId: "english",
    feelsLike: "depends",
    story: "At home I'm still Mi-young. Grace is who I became at work."
  },
  {
    id: "s2",
    sample: true,
    familyId: "f1",
    generation: "usborn",
    birthYear: 1999,
    privacy: "first",
    korean: {
      given: ["서", "연"],
      hanja: ["瑞", "妍"],
      meaning: "felicitous omen / beautiful, handsome",
      meaningSource: "suggested",
      sources: ["745E", "598D"],
      givenBy: "grandparents",
      when: "birth",
      year: 1999,
      status: "middle",
      use: 2
    },
    english: {
      first: "Sarah",
      meaning: "Lady, princess, noblewoman, from Hebrew",
      meaningSource: "suggested",
      sourceUrl: "https://www.behindthename.com/name/sarah",
      reason: "My mom wanted a Bible name that was easy to say in Korean too.",
      givenBy: "parents",
      when: "birth",
      year: 1999,
      status: "legal",
      use: 5
    },
    country: "United States",
    movedYear: null,
    usedBy: { korean: "Mom, grandparents", english: "Everyone else" },
    onId: "english",
    feelsLike: "english",
    story: "My grandma chose my Korean name. I wasn't sure of the characters, so I picked the ones that felt right."
  },
  {
    id: "s3",
    sample: true,
    familyId: "f2",
    generation: "immigrant",
    birthYear: 1965,
    privacy: "first",
    korean: {
      given: ["준", "호"],
      hanja: ["俊", "浩"],
      meaning: "talented, vast",
      meaningSource: "family",
      givenBy: "parents",
      when: "birth",
      year: 1965,
      status: "unofficial",
      use: 3
    },
    english: {
      first: "James",
      meaning: "",
      meaningSource: "unknown",
      reason: "My ESL teacher couldn't say Jun-ho, so she wrote James on my worksheet and it stuck.",
      givenBy: "teacher",
      when: "later",
      year: 1983,
      status: "legal",
      use: 4
    },
    country: "South Korea",
    movedYear: 1983,
    usedBy: { korean: "Wife, old friends", english: "Work, kids' friends" },
    onId: "english",
    feelsLike: "korean",
    story: ""
  },
  {
    id: "s4",
    sample: true,
    familyId: "f2",
    generation: "usborn",
    birthYear: 1996,
    privacy: "first",
    korean: {
      given: ["민", "수"],
      hanja: ["", ""],
      meaning: "",
      meaningSource: "unknown",
      givenBy: "parents",
      when: "birth",
      year: 1996,
      status: "middle",
      use: 1
    },
    english: {
      first: "Daniel",
      meaning: "God is my judge, from Hebrew",
      meaningSource: "family",
      reason: "",
      givenBy: "parents",
      when: "birth",
      year: 1996,
      status: "legal",
      use: 5
    },
    country: "United States",
    movedYear: null,
    usedBy: { korean: "Grandparents only", english: "Everyone" },
    onId: "english",
    feelsLike: "english",
    story: "My Korean name is my middle name. I've never asked what it means."
  },
  {
    id: "s5",
    sample: true,
    familyId: "f3",
    generation: "usborn",
    birthYear: 2001,
    privacy: "first",
    korean: {
      given: ["현", "우"],
      hanja: ["賢", "宇"],
      meaning: "wise, universe",
      meaningSource: "family",
      givenBy: "parents",
      when: "birth",
      year: 2001,
      status: "middle",
      use: 5
    },
    english: {
      first: "Kevin",
      meaning: "",
      meaningSource: "unknown",
      reason: "My parents liked how it sounded.",
      givenBy: "parents",
      when: "birth",
      year: 2001,
      status: "legal",
      use: 1
    },
    country: "United States",
    movedYear: null,
    usedBy: { korean: "Friends, family", english: "Paperwork, old teachers" },
    onId: "english",
    feelsLike: "korean",
    story: "In college I started introducing myself as Hyun. Kevin still lives on my diploma."
  }
];

// Offline backup for 20 common English names, used only when the live Wiktionary/Wikipedia
// lookup (lookup.js) can't connect. Each meaning "m" is summarized from the name's
// "Meaning & History" entry on Behind the Name (behindthename.com), linked in "url".
const ENGLISH_NAMES = {
  "christine": { m: "French form of Christina", url: "https://www.behindthename.com/name/christine" },
  "daniel": { m: "God is my judge, from Hebrew", url: "https://www.behindthename.com/name/daniel" },
  "david": { m: "Beloved or uncle, from Hebrew", url: "https://www.behindthename.com/name/david" },
  "elizabeth": { m: "My God is an oath, from Hebrew", url: "https://www.behindthename.com/name/elizabeth" },
  "esther": { m: "Possibly star, in Persian", url: "https://www.behindthename.com/name/esther" },
  "eunice": { m: "Good victory, from Greek", url: "https://www.behindthename.com/name/eunice" },
  "grace": { m: "From the English word grace, from Latin gratia", url: "https://www.behindthename.com/name/grace" },
  "hannah": { m: "Favour, grace, from Hebrew", url: "https://www.behindthename.com/name/hannah" },
  "james": { m: "English form of Iacomus, from the Hebrew name Yaʿaqov (Jacob)", url: "https://www.behindthename.com/name/james" },
  "jennifer": { m: "A Cornish form of the Welsh name Gwenhwyfar (Guinevere)", url: "https://www.behindthename.com/name/jennifer" },
  "john": { m: "Yahweh is gracious, from the Hebrew name Yoḥanan", url: "https://www.behindthename.com/name/john" },
  "joseph": { m: "He will add, from Hebrew", url: "https://www.behindthename.com/name/joseph" },
  "kevin": { m: "Beloved birth, from the Irish name Caoimhín", url: "https://www.behindthename.com/name/kevin" },
  "michael": { m: "Who is like God?, from Hebrew", url: "https://www.behindthename.com/name/michael" },
  "michelle": { m: "French feminine form of Michel (Michael)", url: "https://www.behindthename.com/name/michelle" },
  "paul": { m: "Small, from the Latin name Paulus", url: "https://www.behindthename.com/name/paul" },
  "peter": { m: "Stone, from Greek", url: "https://www.behindthename.com/name/peter" },
  "rachel": { m: "Ewe, from Hebrew", url: "https://www.behindthename.com/name/rachel" },
  "samuel": { m: "Name of God, from Hebrew", url: "https://www.behindthename.com/name/samuel" },
  "sarah": { m: "Lady, princess, noblewoman, from Hebrew", url: "https://www.behindthename.com/name/sarah" }
};
