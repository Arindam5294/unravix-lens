// Languages Lens can answer in (0.6). The browser picker (public/js/i18n.js) uses the same codes; a test keeps
// the two lists in sync. "auto" = match the language of the question or handwriting, else the browser language.

export interface Lang { code: string; name: string; native: string; rtl?: boolean; indian?: boolean }

/** All 22 scheduled languages of India (Eighth Schedule), then major world languages. */
export const LANGS: Lang[] = [
  // Eighth Schedule of the Constitution of India (22)
  { code: "as", name: "Assamese", native: "অসমীয়া", indian: true },
  { code: "bn", name: "Bengali", native: "বাংলা", indian: true },
  { code: "brx", name: "Bodo", native: "बड़ो", indian: true },
  { code: "doi", name: "Dogri", native: "डोगरी", indian: true },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", indian: true },
  { code: "hi", name: "Hindi", native: "हिन्दी", indian: true },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", indian: true },
  { code: "ks", name: "Kashmiri", native: "کٲشُر", rtl: true, indian: true },
  { code: "kok", name: "Konkani", native: "कोंकणी", indian: true },
  { code: "mai", name: "Maithili", native: "मैथिली", indian: true },
  { code: "ml", name: "Malayalam", native: "മലയാളം", indian: true },
  { code: "mni", name: "Manipuri (Meitei)", native: "ꯃꯤꯇꯩꯂꯣꯟ", indian: true },
  { code: "mr", name: "Marathi", native: "मराठी", indian: true },
  { code: "ne", name: "Nepali", native: "नेपाली", indian: true },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", indian: true },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", indian: true },
  { code: "sa", name: "Sanskrit", native: "संस्कृतम्", indian: true },
  { code: "sat", name: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ", indian: true },
  { code: "sd", name: "Sindhi", native: "سنڌي", rtl: true, indian: true },
  { code: "ta", name: "Tamil", native: "தமிழ்", indian: true },
  { code: "te", name: "Telugu", native: "తెలుగు", indian: true },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true, indian: true },
  // Major world languages
  { code: "en", name: "English", native: "English" },
  { code: "zh", name: "Chinese (Simplified)", native: "简体中文" },
  { code: "zh-Hant", name: "Chinese (Traditional)", native: "繁體中文" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "fr", name: "French", native: "Français" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "fil", name: "Filipino", native: "Filipino" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "ig", name: "Igbo", native: "Igbo" },
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "zu", name: "Zulu", native: "isiZulu" },
  { code: "af", name: "Afrikaans", native: "Afrikaans" },
  { code: "so", name: "Somali", native: "Soomaali" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "my", name: "Burmese", native: "မြန်မာ" },
  { code: "km", name: "Khmer", native: "ខ្មែរ" },
  { code: "si", name: "Sinhala", native: "සිංහල" },
  { code: "ps", name: "Pashto", native: "پښتو", rtl: true },
  { code: "uz", name: "Uzbek", native: "Oʻzbek" },
  { code: "kk", name: "Kazakh", native: "Қазақ" },
  { code: "az", name: "Azerbaijani", native: "Azərbaycan" },
];

const BY_CODE = new Map(LANGS.map((l) => [l.code.toLowerCase(), l]));
const TAG_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;

/** A known language for a BCP-47 tag ("hi-IN" -> Hindi, "zh-TW" -> Traditional Chinese), else null. */
export function findLang(tag: unknown): Lang | null {
  if (typeof tag !== "string") return null;
  const t = tag.trim();
  if (!t || t.length > 24 || !TAG_RE.test(t)) return null;
  const low = t.toLowerCase();
  if (BY_CODE.has(low)) return BY_CODE.get(low)!;
  if (low.startsWith("zh-")) return BY_CODE.get(/hant|tw|hk|mo/.test(low) ? "zh-hant" : "zh")!;
  if (low === "tl" || low.startsWith("tl-")) return BY_CODE.get("fil")!;
  if (low === "gom" || low.startsWith("gom-")) return BY_CODE.get("kok")!;
  return BY_CODE.get(low.split("-")[0]) ?? null;
}

/** What the student asked for: a fixed language, or auto with the browser language as the fallback. */
export interface LangChoice { mode: "fixed" | "auto"; lang: Lang | null; fallback: Lang }

/** Read the request's "lang" ("auto" or a code) and "ui_lang" (navigator.language). Bad values fall back to auto/English. */
export function readLang(lang: unknown, uiLang: unknown): LangChoice {
  const fallback = findLang(uiLang) ?? BY_CODE.get("en")!;
  if (typeof lang === "string" && lang.trim().toLowerCase() !== "auto") {
    const l = findLang(lang);
    if (l) return { mode: "fixed", lang: l, fallback };
  }
  return { mode: "auto", lang: null, fallback };
}

const KEEP = "Keep every formula, equation, number, unit, chemical formula, code and the student's own transcribed lines exactly as written (do not translate or transliterate them); translate only the words around them.";

/** The language rule appended to the system prompt for this request. */
export function languageRule(c: LangChoice, fields: string): string {
  if (c.mode === "fixed" && c.lang) {
    return `Language:\n- Write ${fields} in ${c.lang.name}${c.lang.native !== c.lang.name ? ` (${c.lang.native})` : ""}, in the script native speakers use, at the student's level. ${KEEP}\n- Set language to "${c.lang.code}".`;
  }
  return `Language:\n- Write ${fields} in the language the student used for the words in their question or handwriting (for example Hindi, Odia, Spanish, Arabic). If there are no words in a clear language (only maths or code), use ${c.fallback.name}. ${KEEP}\n- Set language to the BCP-47 code of the language you wrote in (e.g. "en", "hi", "or", "ar").`;
}
