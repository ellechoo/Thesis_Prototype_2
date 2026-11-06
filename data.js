// Seed data for the Two Names prototype.
// These are FICTIONAL sample entries. Replace them with your interview data.

const SEED_ENTRIES = [
  {
    id: "s1",
    sample: true,
    familyId: "f1",
    generation: "immigrant",
    birthYear: 1968,
    privacy: "first",
    surname: { ko: "김", en: "Kim", enAlt: "Lee", altNote: "married name", clan: "김해 (Gimhae)" },
    korean: {
      given: ["미", "영"],
      hanja: ["美", "英"],
      meaning: "beautiful, outstanding",
      meaningSource: "family",
      givenBy: "grandparents",
      when: "birth",
      year: null,
      status: "middle",
      use: 2
    },
    english: {
      first: "Grace",
      middle: "",
      givenBy: "self",
      when: "later",
      year: 1994,
      status: "legal",
      use: 5
    },
    places: {
      origin: "Busan, South Korea",
      arrival: { place: "Flushing, NY", year: 1992 },
      now: "Bergen County, NJ"
    },
    usedBy: { korean: "Family, church friends", english: "Work, neighbors" },
    onId: "english",
    feelsLike: "depends",
    story: "I picked Grace from a hymn we sang the week I started my first job here."
  },
  {
    id: "s2",
    sample: true,
    familyId: "f1",
    generation: "usborn",
    birthYear: 1999,
    privacy: "first",
    surname: { ko: "이", en: "Lee", enAlt: "", altNote: "", clan: "" },
    korean: {
      given: ["서", "연"],
      hanja: ["瑞", "妍"],
      meaning: "auspicious, beautiful",
      meaningSource: "suggested",
      givenBy: "grandparents",
      when: "birth",
      year: null,
      status: "middle",
      use: 2
    },
    english: {
      first: "Sarah",
      middle: "",
      givenBy: "parents",
      when: "birth",
      year: null,
      status: "legal",
      use: 5
    },
    places: { origin: "Queens, NY", arrival: null, now: "Brooklyn, NY" },
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
    privacy: "full",
    surname: { ko: "박", en: "Park", enAlt: "", altNote: "", clan: "" },
    korean: {
      given: ["준", "호"],
      hanja: ["俊", "浩"],
      meaning: "talented, vast",
      meaningSource: "family",
      givenBy: "parents",
      when: "birth",
      year: null,
      status: "unofficial",
      use: 3
    },
    english: {
      first: "James",
      middle: "",
      givenBy: "teacher",
      when: "later",
      year: 1983,
      status: "legal",
      use: 4
    },
    places: {
      origin: "Daegu, South Korea",
      arrival: { place: "Los Angeles, CA", year: 1983 },
      now: "Los Angeles, CA"
    },
    usedBy: { korean: "Wife, old friends", english: "Work, kids' friends" },
    onId: "english",
    feelsLike: "korean",
    story: "My ESL teacher couldn't say Jun-ho, so she wrote James on my worksheet and it stuck."
  },
  {
    id: "s4",
    sample: true,
    familyId: "f2",
    generation: "usborn",
    birthYear: 1996,
    privacy: "full",
    surname: { ko: "박", en: "Park", enAlt: "", altNote: "", clan: "" },
    korean: {
      given: ["민", "수"],
      hanja: ["", ""],
      meaning: "",
      meaningSource: "unknown",
      givenBy: "parents",
      when: "birth",
      year: null,
      status: "middle",
      use: 1
    },
    english: {
      first: "Daniel",
      middle: "Minsu",
      givenBy: "parents",
      when: "birth",
      year: null,
      status: "legal",
      use: 5
    },
    places: { origin: "Los Angeles, CA", arrival: null, now: "Chicago, IL" },
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
    surname: { ko: "최", en: "Choi", enAlt: "", altNote: "", clan: "" },
    korean: {
      given: ["현", "우"],
      hanja: ["賢", "宇"],
      meaning: "wise, universe",
      meaningSource: "family",
      givenBy: "parents",
      when: "birth",
      year: null,
      status: "middle",
      use: 5
    },
    english: {
      first: "Kevin",
      middle: "",
      givenBy: "parents",
      when: "birth",
      year: null,
      status: "legal",
      use: 1
    },
    places: { origin: "Atlanta, GA", arrival: null, now: "New York, NY" },
    usedBy: { korean: "Friends, family", english: "Paperwork, old teachers" },
    onId: "english",
    feelsLike: "korean",
    story: "In college I started introducing myself as Hyun. Kevin still lives on my diploma."
  }
];

// Sample Hanja suggestions per syllable (a short, partial list for the prototype).
// A real version would draw on the official list of characters allowed in Korean names.
const HANJA = {
  "지": [{ c: "智", m: "wisdom" }, { c: "志", m: "will, aspiration" }, { c: "知", m: "to know" }, { c: "芝", m: "fragrant herb" }],
  "연": [{ c: "妍", m: "beautiful" }, { c: "蓮", m: "lotus" }, { c: "延", m: "to extend" }],
  "민": [{ c: "敏", m: "quick, clever" }, { c: "民", m: "people" }, { c: "旻", m: "autumn sky" }, { c: "珉", m: "jade-like stone" }],
  "수": [{ c: "秀", m: "excellent" }, { c: "壽", m: "long life" }, { c: "洙", m: "name of a river" }],
  "현": [{ c: "賢", m: "wise, virtuous" }, { c: "炫", m: "bright" }, { c: "玄", m: "profound" }],
  "서": [{ c: "瑞", m: "auspicious" }, { c: "恕", m: "forgiving" }, { c: "曙", m: "dawn" }, { c: "舒", m: "relaxed" }],
  "준": [{ c: "俊", m: "talented" }, { c: "準", m: "standard" }, { c: "峻", m: "high, lofty" }],
  "영": [{ c: "英", m: "outstanding, flower" }, { c: "永", m: "eternal" }, { c: "榮", m: "glory" }, { c: "映", m: "to reflect" }],
  "은": [{ c: "恩", m: "grace, kindness" }, { c: "銀", m: "silver" }],
  "우": [{ c: "宇", m: "universe" }, { c: "祐", m: "blessing" }, { c: "雨", m: "rain" }],
  "하": [{ c: "夏", m: "summer" }, { c: "河", m: "river" }, { c: "賀", m: "to celebrate" }],
  "진": [{ c: "眞", m: "true" }, { c: "珍", m: "precious" }, { c: "鎭", m: "calm, steady" }],
  "호": [{ c: "浩", m: "vast" }, { c: "虎", m: "tiger" }, { c: "好", m: "good" }],
  "미": [{ c: "美", m: "beautiful" }, { c: "薇", m: "rose" }, { c: "微", m: "subtle" }],
  "희": [{ c: "熙", m: "bright" }, { c: "喜", m: "joy" }, { c: "希", m: "hope" }],
  "윤": [{ c: "潤", m: "moist, enriching" }, { c: "允", m: "to allow, sincere" }]
};
