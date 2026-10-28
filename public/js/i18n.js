// Any language (0.6): the language picker list, the student's choice (on this device only) and the translated UI strings.
// Pure module (no DOM at import time) so it is unit-tested. Same codes as worker/src/lang.ts (a test keeps them in sync).
// Explanations come back from Muse Spark in the chosen language; maths, formulas and code stay as written.

export const LANG_KEY = "lens-lang";

/** All 22 scheduled languages of India, then major world languages. */
export const LANGS = [
  {"code": "as", "name": "Assamese", "native": "অসমীয়া", "indian": true},
  {"code": "bn", "name": "Bengali", "native": "বাংলা", "indian": true},
  {"code": "brx", "name": "Bodo", "native": "बड़ो", "indian": true},
  {"code": "doi", "name": "Dogri", "native": "डोगरी", "indian": true},
  {"code": "gu", "name": "Gujarati", "native": "ગુજરાતી", "indian": true},
  {"code": "hi", "name": "Hindi", "native": "हिन्दी", "indian": true},
  {"code": "kn", "name": "Kannada", "native": "ಕನ್ನಡ", "indian": true},
  {"code": "ks", "name": "Kashmiri", "native": "کٲشُر", "rtl": true, "indian": true},
  {"code": "kok", "name": "Konkani", "native": "कोंकणी", "indian": true},
  {"code": "mai", "name": "Maithili", "native": "मैथिली", "indian": true},
  {"code": "ml", "name": "Malayalam", "native": "മലയാളം", "indian": true},
  {"code": "mni", "name": "Manipuri (Meitei)", "native": "ꯃꯤꯇꯩꯂꯣꯟ", "indian": true},
  {"code": "mr", "name": "Marathi", "native": "मराठी", "indian": true},
  {"code": "ne", "name": "Nepali", "native": "नेपाली", "indian": true},
  {"code": "or", "name": "Odia", "native": "ଓଡ଼ିଆ", "indian": true},
  {"code": "pa", "name": "Punjabi", "native": "ਪੰਜਾਬੀ", "indian": true},
  {"code": "sa", "name": "Sanskrit", "native": "संस्कृतम्", "indian": true},
  {"code": "sat", "name": "Santali", "native": "ᱥᱟᱱᱛᱟᱲᱤ", "indian": true},
  {"code": "sd", "name": "Sindhi", "native": "سنڌي", "rtl": true, "indian": true},
  {"code": "ta", "name": "Tamil", "native": "தமிழ்", "indian": true},
  {"code": "te", "name": "Telugu", "native": "తెలుగు", "indian": true},
  {"code": "ur", "name": "Urdu", "native": "اردو", "rtl": true, "indian": true},
  {"code": "en", "name": "English", "native": "English"},
  {"code": "zh", "name": "Chinese (Simplified)", "native": "简体中文"},
  {"code": "zh-Hant", "name": "Chinese (Traditional)", "native": "繁體中文"},
  {"code": "es", "name": "Spanish", "native": "Español"},
  {"code": "ar", "name": "Arabic", "native": "العربية", "rtl": true},
  {"code": "fr", "name": "French", "native": "Français"},
  {"code": "pt", "name": "Portuguese", "native": "Português"},
  {"code": "ru", "name": "Russian", "native": "Русский"},
  {"code": "ja", "name": "Japanese", "native": "日本語"},
  {"code": "de", "name": "German", "native": "Deutsch"},
  {"code": "sw", "name": "Swahili", "native": "Kiswahili"},
  {"code": "id", "name": "Indonesian", "native": "Bahasa Indonesia"},
  {"code": "ko", "name": "Korean", "native": "한국어"},
  {"code": "it", "name": "Italian", "native": "Italiano"},
  {"code": "tr", "name": "Turkish", "native": "Türkçe"},
  {"code": "vi", "name": "Vietnamese", "native": "Tiếng Việt"},
  {"code": "th", "name": "Thai", "native": "ไทย"},
  {"code": "fa", "name": "Persian", "native": "فارسی", "rtl": true},
  {"code": "he", "name": "Hebrew", "native": "עברית", "rtl": true},
  {"code": "pl", "name": "Polish", "native": "Polski"},
  {"code": "uk", "name": "Ukrainian", "native": "Українська"},
  {"code": "nl", "name": "Dutch", "native": "Nederlands"},
  {"code": "ms", "name": "Malay", "native": "Bahasa Melayu"},
  {"code": "fil", "name": "Filipino", "native": "Filipino"},
  {"code": "ha", "name": "Hausa", "native": "Hausa"},
  {"code": "yo", "name": "Yoruba", "native": "Yorùbá"},
  {"code": "ig", "name": "Igbo", "native": "Igbo"},
  {"code": "am", "name": "Amharic", "native": "አማርኛ"},
  {"code": "zu", "name": "Zulu", "native": "isiZulu"},
  {"code": "af", "name": "Afrikaans", "native": "Afrikaans"},
  {"code": "so", "name": "Somali", "native": "Soomaali"},
  {"code": "el", "name": "Greek", "native": "Ελληνικά"},
  {"code": "ro", "name": "Romanian", "native": "Română"},
  {"code": "cs", "name": "Czech", "native": "Čeština"},
  {"code": "hu", "name": "Hungarian", "native": "Magyar"},
  {"code": "sv", "name": "Swedish", "native": "Svenska"},
  {"code": "my", "name": "Burmese", "native": "မြန်မာ"},
  {"code": "km", "name": "Khmer", "native": "ខ្មែរ"},
  {"code": "si", "name": "Sinhala", "native": "සිංහල"},
  {"code": "ps", "name": "Pashto", "native": "پښتو", "rtl": true},
  {"code": "uz", "name": "Uzbek", "native": "Oʻzbek"},
  {"code": "kk", "name": "Kazakh", "native": "Қазақ"},
  {"code": "az", "name": "Azerbaijani", "native": "Azərbaycan"}
];

const BY = new Map(LANGS.map((l) => [l.code.toLowerCase(), l]));

/** Known language for a BCP-47 tag ("hi-IN" -> Hindi, "zh-TW" -> Traditional Chinese), else null. */
export function findLang(tag) {
  if (typeof tag !== "string") return null;
  const low = tag.trim().toLowerCase();
  if (!low || low.length > 24 || !/^[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$/.test(low)) return null;
  if (BY.has(low)) return BY.get(low);
  if (low.startsWith("zh-")) return BY.get(/hant|tw|hk|mo/.test(low) ? "zh-hant" : "zh");
  if (low === "tl" || low.startsWith("tl-")) return BY.get("fil");
  if (low === "gom" || low.startsWith("gom-")) return BY.get("kok");
  return BY.get(low.split("-")[0]) || null;
}

export const isRtl = (code) => Boolean(findLang(code || "")?.rtl);

/** Filter the picker list by English name, native name or code. Auto stays first when it matches. */
export function searchLangs(q, list = LANGS) {
  const s = String(q || "").trim().toLowerCase();
  if (!s) return list;
  const words = s.split(/\s+/);
  return list.filter((l) => {
    const hay = `${l.name} ${l.native} ${l.code}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The saved choice: "auto" or a code. */
export function getPref(storage = globalThis.localStorage) {
  try { const v = storage.getItem(LANG_KEY); return v && (v === "auto" || findLang(v)) ? v : "auto"; } catch { return "auto"; }
}
export function setPref(v, storage = globalThis.localStorage) {
  const val = v === "auto" || findLang(v) ? (v === "auto" ? "auto" : findLang(v).code) : "auto";
  try { storage.setItem(LANG_KEY, val); } catch {}
  return val;
}

/** The fields every billed request carries: the choice plus the browser language (auto falls back to it). */
export function langFields(pref, navLang) {
  return { lang: pref || "auto", ui_lang: String(navLang || "en").slice(0, 24) };
}

/** UI language: the chosen language when the UI is translated into it, else (auto) the browser language, else English. */
export function uiLangFor(pref, navLang) {
  const pick = (c) => { const l = findLang(c || ""); return l && STRINGS[l.code] ? l.code : null; };
  if (pref && pref !== "auto") return pick(pref) || "en";
  return pick(navLang) || "en";
}

/** Translate a key into the UI language with {n}-style params; falls back to English, then the key. */
export function t(key, params = {}, lang = "en") {
  const s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ""));
}

/** Key UI strings. English, Hindi, Odia, Bengali, Tamil, Spanish, Arabic (RTL) and Chinese. */
export const STRINGS = {
  en: {
    speak: "Speak", listening: "Listening… tap to stop", transcribing: "Muse Voice is writing it down…", mic_denied: "Lens needs the microphone to hear your doubt. You can type it instead.", voice_hint: "Spoken in your language, written down by Muse Voice. Check it, then tap Ask Lens.",
    nav_ask: "Ask Lens", nav_how: "How it works", nav_report: "Knot Report", nav_bench: "Benchmark",
    lang_label: "Language", lang_auto: "Auto · match my writing", lang_search: "Search 65 languages", lang_indian: "Indian languages (22)", lang_world: "World languages", lang_none: "No language matches",
    scan_title: "What's tangled?",
    tab_doubt: "Ask a doubt", tab_doubt_sub: "Type it or snap the question", tab_check: "Check my working", tab_check_sub: "Lens finds the exact knot",
    ask_label: "Your question or doubt, in any subject and any language", ask_go: "Ask Lens", snap_q: "Snap question", add_photo: "Add a photo", sample_answer: "See a sample answer",
    drop_touch: "Snap one piece of working", drop_desk: "Drop a photo of your working here", open_camera: "Open camera", choose_photo: "Choose a photo", try_sample: "Try a sample", find_knot: "Find the knot",
    knotted_at: "Knotted at step {n}", spot_it: "Something goes wrong in step {n}. Can you spot it?", spot_sub: "Try to find it yourself first. Hints come one at a time, then the fix.",
    hint_btn: "Give me a hint", next_hint: "Next hint", hint_n: "Hint {n} of 3", show_fix: "Show the fix", show_fix_now: "Just show the fix",
    the_fix: "The fix", why: "Why it happens", check_yourself: "Check yourself", every_step: "Every step", tap_reveal: "Tap to reveal",
    rescan: "I fixed it · rescan to verify", rescanning: "Rescan to verify: checking the step you fixed",
    untied: "Knot untied!", untied_sub: "The step you fixed now holds, and every other step checks out.", next_knot: "That knot is untied. Next knot: step {n}.", still_there: "Not yet: the same knot is still in step {n}.", not_visible: "Lens couldn't see the step you fixed in this photo. Snap the whole working.",
    all_untied: "All untied", no_knot: "No knot found. Every step holds.", go_deeper: "Go deeper", scan_another: "Scan another", ask_another: "Ask another",
    answer: "Answer", step_by_step: "Step by step", key_idea: "Key idea.", watch_out: "Watch out", confidence: "Confidence", answered_in: "Answered in {lang}",
    weak_title: "Your weak spots", practice: "Practice my weak spots", practice_busy: "Writing problems, then double-checking every answer…", clear_all: "Clear all", remove: "Remove",
    profile_privacy: "Your Knot profile is stored only on this device. Nothing about you is sent to a server.",
    practice_title: "Practice set", verified: "Double-checked by a second Muse Spark pass", show_answer: "Show answer", hint: "Hint", fixed: "untied",
    ask_help: "Type a question, photograph a question or a textbook passage, or both. Lens works out the subject and your level, from Class 1 to PhD.", ask_empty: "Type a question first, or add a photo of it.", drop_hint: "Any subject that has steps: sums, equations, proofs, journal entries, code traces, grammar transformations. Lens shrinks the photo to 1600 px and strips location data first.", priv_doubt_b: "Keep names and personal info out of questions and photos.", priv_doubt: "Lens answers and does not store them.", priv_check_b: "Keep names and personal info out of the photo.", priv_check: "Photos are analysed and not stored. Your Knot Report stays on this device.", leg_ok: "Untied", leg_knot: "Knotted", leg_carry: "Carried error",
  },
  hi: {
    speak: "बोलें", listening: "सुन रहा है… रोकने के लिए टैप करें", transcribing: "Muse Voice लिख रहा है…", mic_denied: "आपका डाउट सुनने के लिए Lens को माइक्रोफ़ोन चाहिए। आप टाइप भी कर सकते हैं।", voice_hint: "अपनी भाषा में बोलें, Muse Voice लिख देगा। जाँचें, फिर Lens से पूछें दबाएँ।",
    nav_ask: "Lens से पूछें", nav_how: "यह कैसे काम करता है", nav_report: "गाँठ रिपोर्ट", nav_bench: "बेंचमार्क",
    lang_label: "भाषा", lang_auto: "ऑटो · मेरी लिखावट जैसी", lang_search: "65 भाषाओं में खोजें", lang_indian: "भारतीय भाषाएँ (22)", lang_world: "विश्व की भाषाएँ", lang_none: "कोई भाषा नहीं मिली",
    scan_title: "कहाँ उलझन है?",
    tab_doubt: "डाउट पूछें", tab_doubt_sub: "टाइप करें या प्रश्न की फ़ोटो लें", tab_check: "मेरा हल जाँचें", tab_check_sub: "Lens सही गाँठ ढूँढता है",
    ask_label: "आपका प्रश्न या डाउट, किसी भी विषय और किसी भी भाषा में", ask_go: "Lens से पूछें", snap_q: "प्रश्न की फ़ोटो", add_photo: "फ़ोटो जोड़ें", sample_answer: "नमूना उत्तर देखें",
    drop_touch: "अपने हल की फ़ोटो लें", drop_desk: "अपने हल की फ़ोटो यहाँ डालें", open_camera: "कैमरा खोलें", choose_photo: "फ़ोटो चुनें", try_sample: "नमूना आज़माएँ", find_knot: "गाँठ ढूँढें",
    knotted_at: "स्टेप {n} में गाँठ", spot_it: "स्टेप {n} में कुछ गलत है। क्या आप पहचान सकते हैं?", spot_sub: "पहले खुद ढूँढने की कोशिश करें। संकेत एक-एक करके मिलेंगे, फिर सुधार।",
    hint_btn: "मुझे संकेत दें", next_hint: "अगला संकेत", hint_n: "संकेत {n} / 3", show_fix: "सुधार दिखाएँ", show_fix_now: "सीधे सुधार दिखाएँ",
    the_fix: "सुधार", why: "ऐसा क्यों होता है", check_yourself: "खुद को जाँचें", every_step: "हर स्टेप", tap_reveal: "देखने के लिए टैप करें",
    rescan: "मैंने ठीक कर लिया · दोबारा स्कैन करें", rescanning: "दोबारा जाँच: आपका सुधारा हुआ स्टेप देखा जा रहा है",
    untied: "गाँठ खुल गई!", untied_sub: "आपका सुधारा हुआ स्टेप अब सही है, और बाकी सब स्टेप भी सही हैं।", next_knot: "वह गाँठ खुल गई। अगली गाँठ: स्टेप {n}।", still_there: "अभी नहीं: वही गाँठ स्टेप {n} में अब भी है।", not_visible: "इस फ़ोटो में सुधारा हुआ स्टेप नहीं दिखा। पूरे हल की फ़ोटो लें।",
    all_untied: "सब सही", no_knot: "कोई गाँठ नहीं मिली। हर स्टेप सही है।", go_deeper: "और गहराई से", scan_another: "दूसरा स्कैन करें", ask_another: "दूसरा प्रश्न पूछें",
    answer: "उत्तर", step_by_step: "स्टेप दर स्टेप", key_idea: "मुख्य बात।", watch_out: "ध्यान दें", confidence: "भरोसा", answered_in: "{lang} में उत्तर",
    weak_title: "आपके कमज़ोर विषय", practice: "कमज़ोर विषयों का अभ्यास करें", practice_busy: "प्रश्न बन रहे हैं, फिर हर उत्तर दोबारा जाँचा जा रहा है…", clear_all: "सब हटाएँ", remove: "हटाएँ",
    profile_privacy: "आपकी गाँठ प्रोफ़ाइल सिर्फ़ इसी डिवाइस पर रहती है। आपके बारे में कुछ भी सर्वर पर नहीं भेजा जाता।",
    practice_title: "अभ्यास सेट", verified: "दूसरी Muse Spark जाँच से पक्का किया गया", show_answer: "उत्तर देखें", hint: "संकेत", fixed: "सुलझा",
    ask_help: "प्रश्न टाइप करें, प्रश्न या किताब के हिस्से की फ़ोटो लें, या दोनों। Lens विषय और आपका स्तर खुद पहचानता है, कक्षा 1 से PhD तक।", ask_empty: "पहले प्रश्न टाइप करें, या उसकी फ़ोटो जोड़ें।", drop_hint: "कोई भी विषय जिसमें स्टेप हों: सवाल, समीकरण, प्रमाण, जर्नल एंट्री, कोड ट्रेस, व्याकरण परिवर्तन। Lens पहले फ़ोटो को 1600 px तक छोटा करता है और लोकेशन डेटा हटा देता है।", priv_doubt_b: "प्रश्नों और फ़ोटो में नाम और निजी जानकारी न डालें।", priv_doubt: "Lens उत्तर देता है और उन्हें सेव नहीं करता।", priv_check_b: "फ़ोटो में नाम और निजी जानकारी न रखें।", priv_check: "फ़ोटो जाँची जाती हैं और सेव नहीं होतीं। आपकी गाँठ रिपोर्ट इसी डिवाइस पर रहती है।", leg_ok: "सही", leg_knot: "गाँठ", leg_carry: "आगे बढ़ी गलती",
  },
  or: {
    speak: "କୁହନ୍ତୁ", listening: "ଶୁଣୁଛି… ବନ୍ଦ କରିବାକୁ ଟ୍ୟାପ୍ କରନ୍ତୁ", transcribing: "Muse Voice ଲେଖୁଛି…", mic_denied: "ଆପଣଙ୍କ ସନ୍ଦେହ ଶୁଣିବା ପାଇଁ Lens କୁ ମାଇକ୍ରୋଫୋନ୍ ଦରକାର। ଆପଣ ଟାଇପ୍ ମଧ୍ୟ କରିପାରିବେ।", voice_hint: "ନିଜ ଭାଷାରେ କୁହନ୍ତୁ, Muse Voice ଲେଖିଦେବ। ଯାଞ୍ଚ କରି Lens କୁ ପଚାରନ୍ତୁ।",
    nav_ask: "Lens କୁ ପଚାରନ୍ତୁ", nav_how: "ଏହା କିପରି କାମ କରେ", nav_report: "ଗଣ୍ଠି ରିପୋର୍ଟ", nav_bench: "ବେଞ୍ଚମାର୍କ",
    lang_label: "ଭାଷା", lang_auto: "ସ୍ୱୟଂଚାଳିତ · ମୋ ଲେଖା ଅନୁସାରେ", lang_search: "65ଟି ଭାଷାରେ ଖୋଜନ୍ତୁ", lang_indian: "ଭାରତୀୟ ଭାଷା (22)", lang_world: "ବିଶ୍ୱ ଭାଷା", lang_none: "କୌଣସି ଭାଷା ମିଳିଲା ନାହିଁ",
    scan_title: "କେଉଁଠି ଜଟିଳ ଲାଗୁଛି?",
    tab_doubt: "ସନ୍ଦେହ ପଚାରନ୍ତୁ", tab_doubt_sub: "ଟାଇପ୍ କରନ୍ତୁ ବା ପ୍ରଶ୍ନର ଫଟୋ ନିଅନ୍ତୁ", tab_check: "ମୋ ସମାଧାନ ଯାଞ୍ଚ କରନ୍ତୁ", tab_check_sub: "Lens ଠିକ୍ ଗଣ୍ଠିଟି ଖୋଜେ",
    ask_label: "ଆପଣଙ୍କ ପ୍ରଶ୍ନ ବା ସନ୍ଦେହ, ଯେକୌଣସି ବିଷୟ ଓ ଯେକୌଣସି ଭାଷାରେ", ask_go: "Lens କୁ ପଚାରନ୍ତୁ", snap_q: "ପ୍ରଶ୍ନର ଫଟୋ", add_photo: "ଫଟୋ ଯୋଡ଼ନ୍ତୁ", sample_answer: "ନମୁନା ଉତ୍ତର ଦେଖନ୍ତୁ",
    drop_touch: "ଆପଣଙ୍କ ସମାଧାନର ଫଟୋ ନିଅନ୍ତୁ", drop_desk: "ଆପଣଙ୍କ ସମାଧାନର ଫଟୋ ଏଠାରେ ଦିଅନ୍ତୁ", open_camera: "କ୍ୟାମେରା ଖୋଲନ୍ତୁ", choose_photo: "ଫଟୋ ବାଛନ୍ତୁ", try_sample: "ନମୁନା ଚେଷ୍ଟା କରନ୍ତୁ", find_knot: "ଗଣ୍ଠି ଖୋଜନ୍ତୁ",
    knotted_at: "ପଦକ୍ଷେପ {n}ରେ ଗଣ୍ଠି", spot_it: "ପଦକ୍ଷେପ {n}ରେ କିଛି ଭୁଲ୍ ଅଛି। ଆପଣ ଚିହ୍ନିପାରିବେ କି?", spot_sub: "ପ୍ରଥମେ ନିଜେ ଖୋଜିବାକୁ ଚେଷ୍ଟା କରନ୍ତୁ। ସୂଚନା ଗୋଟିଏ ଗୋଟିଏ କରି ଆସିବ, ତା'ପରେ ସଂଶୋଧନ।",
    hint_btn: "ମୋତେ ସୂଚନା ଦିଅନ୍ତୁ", next_hint: "ପରବର୍ତ୍ତୀ ସୂଚନା", hint_n: "ସୂଚନା {n} / 3", show_fix: "ସଂଶୋଧନ ଦେଖାନ୍ତୁ", show_fix_now: "ସିଧା ସଂଶୋଧନ ଦେଖାନ୍ତୁ",
    the_fix: "ସଂଶୋଧନ", why: "ଏହା କାହିଁକି ହୁଏ", check_yourself: "ନିଜକୁ ଯାଞ୍ଚ କରନ୍ତୁ", every_step: "ପ୍ରତ୍ୟେକ ପଦକ୍ଷେପ", tap_reveal: "ଦେଖିବାକୁ ଟ୍ୟାପ୍ କରନ୍ତୁ",
    rescan: "ମୁଁ ଠିକ୍ କରିଦେଲି · ପୁଣି ସ୍କାନ୍ କରନ୍ତୁ", rescanning: "ପୁଣି ଯାଞ୍ଚ: ଆପଣ ସଂଶୋଧନ କରିଥିବା ପଦକ୍ଷେପ ଦେଖାଯାଉଛି",
    untied: "ଗଣ୍ଠି ଖୋଲିଗଲା!", untied_sub: "ଆପଣ ସଂଶୋଧନ କରିଥିବା ପଦକ୍ଷେପ ଏବେ ଠିକ୍, ଏବଂ ଅନ୍ୟ ସବୁ ପଦକ୍ଷେପ ମଧ୍ୟ ଠିକ୍।", next_knot: "ସେହି ଗଣ୍ଠି ଖୋଲିଗଲା। ପରବର୍ତ୍ତୀ ଗଣ୍ଠି: ପଦକ୍ଷେପ {n}।", still_there: "ଏବେ ନୁହେଁ: ସେହି ଗଣ୍ଠି ପଦକ୍ଷେପ {n}ରେ ଏବେ ବି ଅଛି।", not_visible: "ଏହି ଫଟୋରେ ସଂଶୋଧିତ ପଦକ୍ଷେପ ଦେଖାଗଲା ନାହିଁ। ପୂରା ସମାଧାନର ଫଟୋ ନିଅନ୍ତୁ।",
    all_untied: "ସବୁ ଠିକ୍", no_knot: "କୌଣସି ଗଣ୍ଠି ମିଳିଲା ନାହିଁ। ପ୍ରତ୍ୟେକ ପଦକ୍ଷେପ ଠିକ୍।", go_deeper: "ଆହୁରି ଗଭୀରକୁ", scan_another: "ଆଉ ଗୋଟିଏ ସ୍କାନ୍", ask_another: "ଆଉ ଗୋଟିଏ ପ୍ରଶ୍ନ",
    answer: "ଉତ୍ତର", step_by_step: "ପଦକ୍ଷେପ ଅନୁସାରେ", key_idea: "ମୁଖ୍ୟ କଥା।", watch_out: "ସାବଧାନ", confidence: "ନିଶ୍ଚିତତା", answered_in: "{lang}ରେ ଉତ୍ତର",
    weak_title: "ଆପଣଙ୍କ ଦୁର୍ବଳ ବିଷୟ", practice: "ଦୁର୍ବଳ ବିଷୟର ଅଭ୍ୟାସ କରନ୍ତୁ", practice_busy: "ପ୍ରଶ୍ନ ତିଆରି ହେଉଛି, ତା'ପରେ ପ୍ରତ୍ୟେକ ଉତ୍ତର ପୁଣି ଯାଞ୍ଚ ହେଉଛି…", clear_all: "ସବୁ ହଟାନ୍ତୁ", remove: "ହଟାନ୍ତୁ",
    profile_privacy: "ଆପଣଙ୍କ ଗଣ୍ଠି ପ୍ରୋଫାଇଲ୍ କେବଳ ଏହି ଡିଭାଇସରେ ରହେ। ଆପଣଙ୍କ ବିଷୟରେ କିଛି ସର୍ଭରକୁ ପଠାଯାଏ ନାହିଁ।",
    practice_title: "ଅଭ୍ୟାସ ସେଟ୍", verified: "ଦ୍ୱିତୀୟ Muse Spark ଯାଞ୍ଚରେ ନିଶ୍ଚିତ", show_answer: "ଉତ୍ତର ଦେଖନ୍ତୁ", hint: "ସୂଚନା", fixed: "ସମାଧାନ ହେଲା",
    ask_help: "ପ୍ରଶ୍ନ ଟାଇପ୍ କରନ୍ତୁ, ପ୍ରଶ୍ନ ବା ପାଠ୍ୟପୁସ୍ତକର ଅଂଶର ଫଟୋ ନିଅନ୍ତୁ, କିମ୍ବା ଦୁଇଟି ଯାକ। Lens ବିଷୟ ଓ ଆପଣଙ୍କ ସ୍ତର ନିଜେ ଚିହ୍ନଟ କରେ, ଶ୍ରେଣୀ 1 ରୁ PhD ପର୍ଯ୍ୟନ୍ତ।", ask_empty: "ପ୍ରଥମେ ପ୍ରଶ୍ନ ଟାଇପ୍ କରନ୍ତୁ, କିମ୍ବା ତାହାର ଫଟୋ ଯୋଡନ୍ତୁ।", drop_hint: "ଷ୍ଟେପ୍ ଥିବା ଯେକୌଣସି ବିଷୟ: ଅଙ୍କ, ସମୀକରଣ, ପ୍ରମାଣ, ଜର୍ଣ୍ଣାଲ ଏଣ୍ଟ୍ରି, କୋଡ୍ ଟ୍ରେସ୍, ବ୍ୟାକରଣ ପରିବର୍ତ୍ତନ। Lens ପ୍ରଥମେ ଫଟୋକୁ 1600 px କୁ ଛୋଟ କରେ ଓ ଲୋକେସନ୍ ତଥ୍ୟ ହଟାଇଦିଏ।", priv_doubt_b: "ପ୍ରଶ୍ନ ଓ ଫଟୋରେ ନାମ ଓ ବ୍ୟକ୍ତିଗତ ତଥ୍ୟ ଦିଅନ୍ତୁ ନାହିଁ।", priv_doubt: "Lens ଉତ୍ତର ଦିଏ ଓ ସେଗୁଡ଼ିକୁ ସଞ୍ଚୟ କରେ ନାହିଁ।", priv_check_b: "ଫଟୋରେ ନାମ ଓ ବ୍ୟକ୍ତିଗତ ତଥ୍ୟ ରଖନ୍ତୁ ନାହିଁ।", priv_check: "ଫଟୋ ଯାଞ୍ଚ ହୁଏ ଓ ସଞ୍ଚୟ ହୁଏ ନାହିଁ। ଆପଣଙ୍କ ଗଣ୍ଠି ରିପୋର୍ଟ ଏହି ଡିଭାଇସରେ ହିଁ ରହେ।", leg_ok: "ଠିକ୍", leg_knot: "ଗଣ୍ଠି", leg_carry: "ଆଗକୁ ବହିଥିବା ଭୁଲ",
  },
  bn: {
    speak: "বলুন", listening: "শুনছি… থামাতে ট্যাপ করুন", transcribing: "Muse Voice লিখছে…", mic_denied: "আপনার প্রশ্ন শুনতে Lens-এর মাইক্রোফোন দরকার। আপনি টাইপও করতে পারেন।", voice_hint: "নিজের ভাষায় বলুন, Muse Voice লিখে দেবে। দেখে নিয়ে Lens-কে জিজ্ঞাসা করুন।",
    nav_ask: "Lens-কে জিজ্ঞাসা করুন", nav_how: "এটি কীভাবে কাজ করে", nav_report: "গিঁট রিপোর্ট", nav_bench: "বেঞ্চমার্ক",
    lang_label: "ভাষা", lang_auto: "স্বয়ংক্রিয় · আমার লেখার মতো", lang_search: "৬৫টি ভাষায় খুঁজুন", lang_indian: "ভারতীয় ভাষা (22)", lang_world: "বিশ্বের ভাষা", lang_none: "কোনো ভাষা মেলেনি",
    scan_title: "কোথায় জট?",
    tab_doubt: "প্রশ্ন জিজ্ঞাসা করুন", tab_doubt_sub: "টাইপ করুন বা প্রশ্নের ছবি তুলুন", tab_check: "আমার সমাধান যাচাই করুন", tab_check_sub: "Lens ঠিক গিঁটটি খুঁজে দেয়",
    ask_label: "আপনার প্রশ্ন বা সন্দেহ, যেকোনো বিষয়ে ও যেকোনো ভাষায়", ask_go: "Lens-কে জিজ্ঞাসা করুন", snap_q: "প্রশ্নের ছবি", add_photo: "ছবি যোগ করুন", sample_answer: "নমুনা উত্তর দেখুন",
    drop_touch: "আপনার সমাধানের ছবি তুলুন", drop_desk: "আপনার সমাধানের ছবি এখানে দিন", open_camera: "ক্যামেরা খুলুন", choose_photo: "ছবি বেছে নিন", try_sample: "নমুনা দেখুন", find_knot: "গিঁট খুঁজুন",
    knotted_at: "ধাপ {n}-এ গিঁট", spot_it: "ধাপ {n}-এ কিছু ভুল আছে। আপনি কি খুঁজে পাবেন?", spot_sub: "আগে নিজে খোঁজার চেষ্টা করুন। ইঙ্গিত একটা একটা করে আসবে, তারপর সমাধান।",
    hint_btn: "একটা ইঙ্গিত দিন", next_hint: "পরের ইঙ্গিত", hint_n: "ইঙ্গিত {n} / 3", show_fix: "সংশোধন দেখান", show_fix_now: "সরাসরি সংশোধন দেখান",
    the_fix: "সংশোধন", why: "কেন এমন হয়", check_yourself: "নিজেকে যাচাই করুন", every_step: "প্রতিটি ধাপ", tap_reveal: "দেখতে ট্যাপ করুন",
    rescan: "আমি ঠিক করেছি · আবার স্ক্যান করুন", rescanning: "আবার যাচাই: আপনার ঠিক করা ধাপ দেখা হচ্ছে",
    untied: "গিঁট খুলে গেছে!", untied_sub: "আপনার ঠিক করা ধাপ এখন সঠিক, আর বাকি সব ধাপও ঠিক আছে।", next_knot: "সেই গিঁট খুলে গেছে। পরের গিঁট: ধাপ {n}।", still_there: "এখনও নয়: একই গিঁট ধাপ {n}-এ রয়ে গেছে।", not_visible: "এই ছবিতে ঠিক করা ধাপটি দেখা যায়নি। পুরো সমাধানের ছবি তুলুন।",
    all_untied: "সব ঠিক", no_knot: "কোনো গিঁট নেই। প্রতিটি ধাপ ঠিক।", go_deeper: "আরও গভীরে", scan_another: "আরেকটি স্ক্যান", ask_another: "আরেকটি প্রশ্ন",
    answer: "উত্তর", step_by_step: "ধাপে ধাপে", key_idea: "মূল কথা।", watch_out: "সাবধান", confidence: "আস্থা", answered_in: "{lang}-এ উত্তর",
    weak_title: "আপনার দুর্বল জায়গা", practice: "দুর্বল জায়গা অনুশীলন করুন", practice_busy: "প্রশ্ন তৈরি হচ্ছে, তারপর প্রতিটি উত্তর আবার যাচাই হচ্ছে…", clear_all: "সব মুছুন", remove: "মুছুন",
    profile_privacy: "আপনার গিঁট প্রোফাইল শুধু এই ডিভাইসে থাকে। আপনার সম্পর্কে কিছুই সার্ভারে পাঠানো হয় না।",
    practice_title: "অনুশীলন সেট", verified: "দ্বিতীয় Muse Spark যাচাইয়ে নিশ্চিত", show_answer: "উত্তর দেখুন", hint: "ইঙ্গিত", fixed: "খোলা হয়েছে",
    ask_help: "প্রশ্ন টাইপ করুন, প্রশ্ন বা বইয়ের অংশের ছবি তুলুন, অথবা দুটোই। Lens বিষয় আর আপনার স্তর নিজেই বুঝে নেয়, ক্লাস 1 থেকে PhD পর্যন্ত।", ask_empty: "আগে প্রশ্ন টাইপ করুন, অথবা তার ছবি যোগ করুন।", drop_hint: "যে কোনো বিষয় যাতে ধাপ আছে: অঙ্ক, সমীকরণ, প্রমাণ, জার্নাল এন্ট্রি, কোড ট্রেস, ব্যাকরণ রূপান্তর। Lens আগে ছবিটি 1600 px-এ ছোট করে এবং লোকেশন ডেটা মুছে দেয়।", priv_doubt_b: "প্রশ্ন ও ছবিতে নাম আর ব্যক্তিগত তথ্য দেবেন না।", priv_doubt: "Lens উত্তর দেয় এবং সেগুলো সংরক্ষণ করে না।", priv_check_b: "ছবিতে নাম আর ব্যক্তিগত তথ্য রাখবেন না।", priv_check: "ছবি বিশ্লেষণ করা হয়, সংরক্ষণ করা হয় না। আপনার গিঁট রিপোর্ট এই ডিভাইসেই থাকে।", leg_ok: "ঠিক", leg_knot: "গিঁট", leg_carry: "বয়ে চলা ভুল",
  },
  ta: {
    speak: "பேசுங்கள்", listening: "கேட்கிறது… நிறுத்த தட்டவும்", transcribing: "Muse Voice எழுதுகிறது…", mic_denied: "உங்கள் சந்தேகத்தைக் கேட்க Lens-க்கு மைக்ரோஃபோன் தேவை. தட்டச்சும் செய்யலாம்.", voice_hint: "உங்கள் மொழியில் பேசுங்கள், Muse Voice எழுதும். சரிபார்த்து Lens-இடம் கேளுங்கள்.",
    nav_ask: "Lens-இடம் கேளுங்கள்", nav_how: "இது எப்படி வேலை செய்கிறது", nav_report: "முடிச்சு அறிக்கை", nav_bench: "தரமதிப்பீடு",
    lang_label: "மொழி", lang_auto: "தானியங்கி · என் எழுத்தைப் போல", lang_search: "65 மொழிகளில் தேடுங்கள்", lang_indian: "இந்திய மொழிகள் (22)", lang_world: "உலக மொழிகள்", lang_none: "எந்த மொழியும் பொருந்தவில்லை",
    scan_title: "எங்கே சிக்கல்?",
    tab_doubt: "சந்தேகம் கேளுங்கள்", tab_doubt_sub: "தட்டச்சு செய்யுங்கள் அல்லது கேள்வியைப் படம் எடுங்கள்", tab_check: "என் தீர்வைச் சரிபார்", tab_check_sub: "Lens சரியான முடிச்சைக் கண்டறியும்",
    ask_label: "உங்கள் கேள்வி அல்லது சந்தேகம், எந்தப் பாடத்திலும் எந்த மொழியிலும்", ask_go: "Lens-இடம் கேளுங்கள்", snap_q: "கேள்வியைப் படம் எடு", add_photo: "படம் சேர்", sample_answer: "மாதிரி பதிலைப் பாருங்கள்",
    drop_touch: "உங்கள் தீர்வைப் படம் எடுங்கள்", drop_desk: "உங்கள் தீர்வின் படத்தை இங்கே விடுங்கள்", open_camera: "கேமராவைத் திற", choose_photo: "படத்தைத் தேர்ந்தெடு", try_sample: "மாதிரியை முயற்சி செய்", find_knot: "முடிச்சைக் கண்டுபிடி",
    knotted_at: "படி {n}-இல் முடிச்சு", spot_it: "படி {n}-இல் ஏதோ தவறு உள்ளது. கண்டுபிடிக்க முடியுமா?", spot_sub: "முதலில் நீங்களே கண்டுபிடிக்க முயலுங்கள். குறிப்புகள் ஒவ்வொன்றாக வரும், பிறகு திருத்தம்.",
    hint_btn: "ஒரு குறிப்பு கொடு", next_hint: "அடுத்த குறிப்பு", hint_n: "குறிப்பு {n} / 3", show_fix: "திருத்தத்தைக் காட்டு", show_fix_now: "நேரடியாகத் திருத்தத்தைக் காட்டு",
    the_fix: "திருத்தம்", why: "இது ஏன் நடக்கிறது", check_yourself: "உங்களைச் சோதியுங்கள்", every_step: "ஒவ்வொரு படியும்", tap_reveal: "பார்க்கத் தட்டவும்",
    rescan: "சரி செய்தேன் · மீண்டும் ஸ்கேன் செய்", rescanning: "மீண்டும் சரிபார்ப்பு: நீங்கள் திருத்திய படி பார்க்கப்படுகிறது",
    untied: "முடிச்சு அவிழ்ந்தது!", untied_sub: "நீங்கள் திருத்திய படி இப்போது சரி, மற்ற எல்லாப் படிகளும் சரி.", next_knot: "அந்த முடிச்சு அவிழ்ந்தது. அடுத்த முடிச்சு: படி {n}.", still_there: "இன்னும் இல்லை: அதே முடிச்சு படி {n}-இல் இன்னும் உள்ளது.", not_visible: "இந்தப் படத்தில் நீங்கள் திருத்திய படி தெரியவில்லை. முழுத் தீர்வையும் படம் எடுங்கள்.",
    all_untied: "எல்லாம் சரி", no_knot: "முடிச்சு எதுவும் இல்லை. ஒவ்வொரு படியும் சரி.", go_deeper: "இன்னும் ஆழமாக", scan_another: "மற்றொன்றை ஸ்கேன் செய்", ask_another: "மற்றொரு கேள்வி",
    answer: "பதில்", step_by_step: "படிப்படியாக", key_idea: "முக்கியக் கருத்து.", watch_out: "கவனம்", confidence: "நம்பகத்தன்மை", answered_in: "{lang}-இல் பதில்",
    weak_title: "உங்கள் பலவீனமான பகுதிகள்", practice: "பலவீனமான பகுதிகளைப் பயிற்சி செய்", practice_busy: "கேள்விகள் உருவாகின்றன, பிறகு ஒவ்வொரு பதிலும் மீண்டும் சரிபார்க்கப்படுகிறது…", clear_all: "அனைத்தையும் அழி", remove: "நீக்கு",
    profile_privacy: "உங்கள் முடிச்சு சுயவிவரம் இந்தச் சாதனத்தில் மட்டுமே சேமிக்கப்படுகிறது. உங்களைப் பற்றி எதுவும் சர்வருக்கு அனுப்பப்படாது.",
    practice_title: "பயிற்சித் தொகுப்பு", verified: "இரண்டாவது Muse Spark சரிபார்ப்பால் உறுதி செய்யப்பட்டது", show_answer: "பதிலைக் காட்டு", hint: "குறிப்பு", fixed: "அவிழ்ந்தது",
    ask_help: "கேள்வியை தட்டச்சு செய்யுங்கள், கேள்வி அல்லது பாடப்புத்தகப் பகுதியைப் படம் எடுங்கள், அல்லது இரண்டும். Lens பாடத்தையும் உங்கள் நிலையையும் தானே கண்டறியும், வகுப்பு 1 முதல் PhD வரை.", ask_empty: "முதலில் கேள்வியை தட்டச்சு செய்யுங்கள், அல்லது அதன் படத்தைச் சேர்க்கவும்.", drop_hint: "படிகள் உள்ள எந்தப் பாடமும்: கணக்குகள், சமன்பாடுகள், நிரூபணங்கள், கணக்குப் பதிவுகள், குறியீடு தடங்கள், இலக்கண மாற்றங்கள். Lens முதலில் படத்தை 1600 px ஆகக் குறைத்து இருப்பிடத் தரவை நீக்கும்.", priv_doubt_b: "கேள்விகளிலும் படங்களிலும் பெயர்கள், தனிப்பட்ட விவரங்களைத் தவிர்க்கவும்.", priv_doubt: "Lens பதில் தரும், அவற்றைச் சேமிக்காது.", priv_check_b: "படத்தில் பெயர்கள், தனிப்பட்ட விவரங்களைத் தவிர்க்கவும்.", priv_check: "படங்கள் பகுப்பாய்வு செய்யப்படும், சேமிக்கப்படாது. உங்கள் முடிச்சு அறிக்கை இந்தச் சாதனத்திலேயே இருக்கும்.", leg_ok: "சரி", leg_knot: "முடிச்சு", leg_carry: "தொடர்ந்த பிழை",
  },
  es: {
    speak: "Hablar", listening: "Escuchando… toca para parar", transcribing: "Muse Voice lo está escribiendo…", mic_denied: "Lens necesita el micrófono para oír tu duda. También puedes escribirla.", voice_hint: "Habla en tu idioma y Muse Voice lo escribe. Revísalo y toca Preguntar.",
    nav_ask: "Pregunta a Lens", nav_how: "Cómo funciona", nav_report: "Informe de nudos", nav_bench: "Benchmark",
    lang_label: "Idioma", lang_auto: "Automático · como mi escritura", lang_search: "Busca entre 65 idiomas", lang_indian: "Idiomas de la India (22)", lang_world: "Idiomas del mundo", lang_none: "Ningún idioma coincide",
    scan_title: "¿Qué está enredado?",
    tab_doubt: "Haz una pregunta", tab_doubt_sub: "Escríbela o fotografía el enunciado", tab_check: "Revisa mi trabajo", tab_check_sub: "Lens encuentra el nudo exacto",
    ask_label: "Tu pregunta o duda, de cualquier materia y en cualquier idioma", ask_go: "Preguntar a Lens", snap_q: "Foto del enunciado", add_photo: "Añadir foto", sample_answer: "Ver una respuesta de ejemplo",
    drop_touch: "Fotografía tu desarrollo", drop_desk: "Suelta aquí una foto de tu desarrollo", open_camera: "Abrir cámara", choose_photo: "Elegir foto", try_sample: "Probar un ejemplo", find_knot: "Encontrar el nudo",
    knotted_at: "Nudo en el paso {n}", spot_it: "Algo falla en el paso {n}. ¿Lo encuentras?", spot_sub: "Intenta encontrarlo tú primero. Las pistas llegan de una en una y luego la corrección.",
    hint_btn: "Dame una pista", next_hint: "Siguiente pista", hint_n: "Pista {n} de 3", show_fix: "Mostrar la corrección", show_fix_now: "Mostrar la corrección ya",
    the_fix: "La corrección", why: "Por qué pasa", check_yourself: "Ponte a prueba", every_step: "Todos los pasos", tap_reveal: "Toca para ver",
    rescan: "Ya lo corregí · volver a escanear", rescanning: "Verificando: revisando el paso que corregiste",
    untied: "¡Nudo desatado!", untied_sub: "El paso que corregiste ya está bien y todos los demás también.", next_knot: "Ese nudo está desatado. Siguiente nudo: paso {n}.", still_there: "Todavía no: el mismo nudo sigue en el paso {n}.", not_visible: "Lens no vio en esta foto el paso que corregiste. Fotografía todo el desarrollo.",
    all_untied: "Todo correcto", no_knot: "No hay nudos. Cada paso es correcto.", go_deeper: "Profundiza", scan_another: "Escanear otro", ask_another: "Otra pregunta",
    answer: "Respuesta", step_by_step: "Paso a paso", key_idea: "Idea clave.", watch_out: "Cuidado", confidence: "Confianza", answered_in: "Respondido en {lang}",
    weak_title: "Tus puntos débiles", practice: "Practicar mis puntos débiles", practice_busy: "Escribiendo problemas y comprobando cada respuesta dos veces…", clear_all: "Borrar todo", remove: "Quitar",
    profile_privacy: "Tu perfil de nudos se guarda solo en este dispositivo. No se envía nada sobre ti a ningún servidor.",
    practice_title: "Práctica", verified: "Comprobado por una segunda pasada de Muse Spark", show_answer: "Ver respuesta", hint: "Pista", fixed: "desatado",
    ask_help: "Escribe una pregunta, fotografía una pregunta o un fragmento del libro, o ambas cosas. Lens detecta la materia y tu nivel, de primaria a doctorado.", ask_empty: "Escribe primero una pregunta o añade una foto.", drop_hint: "Cualquier materia con pasos: cuentas, ecuaciones, demostraciones, asientos contables, trazas de código, transformaciones gramaticales. Lens reduce la foto a 1600 px y borra los datos de ubicación antes de enviarla.", priv_doubt_b: "No pongas nombres ni datos personales en preguntas y fotos.", priv_doubt: "Lens responde y no las guarda.", priv_check_b: "No pongas nombres ni datos personales en la foto.", priv_check: "Las fotos se analizan y no se guardan. Tu Informe de nudos se queda en este dispositivo.", leg_ok: "Correcto", leg_knot: "Nudo", leg_carry: "Error arrastrado",
  },
  ar: {
    speak: "تحدّث", listening: "أستمع… اضغط للإيقاف", transcribing: "Muse Voice يكتب ما قلته…", mic_denied: "يحتاج Lens إلى الميكروفون لسماع سؤالك. يمكنك كتابته بدلاً من ذلك.", voice_hint: "تحدّث بلغتك وسيكتبه Muse Voice. راجعه ثم اضغط اسأل.",
    nav_ask: "اسأل Lens", nav_how: "كيف يعمل", nav_report: "تقرير العُقد", nav_bench: "المقياس المعياري",
    lang_label: "اللغة", lang_auto: "تلقائي · مثل كتابتي", lang_search: "ابحث في 65 لغة", lang_indian: "اللغات الهندية (22)", lang_world: "لغات العالم", lang_none: "لا توجد لغة مطابقة",
    scan_title: "ما الذي يربكك؟",
    tab_doubt: "اطرح سؤالًا", tab_doubt_sub: "اكتبه أو صوّر السؤال", tab_check: "راجع حلّي", tab_check_sub: "يجد Lens العقدة بالضبط",
    ask_label: "سؤالك أو استفسارك، في أي مادة وبأي لغة", ask_go: "اسأل Lens", snap_q: "صوّر السؤال", add_photo: "أضف صورة", sample_answer: "شاهد إجابة نموذجية",
    drop_touch: "صوّر خطوات حلّك", drop_desk: "أفلت صورة حلّك هنا", open_camera: "افتح الكاميرا", choose_photo: "اختر صورة", try_sample: "جرّب مثالًا", find_knot: "اعثر على العقدة",
    knotted_at: "عقدة في الخطوة {n}", spot_it: "هناك خطأ في الخطوة {n}. هل يمكنك اكتشافه؟", spot_sub: "حاول أن تجده بنفسك أولًا. تأتي التلميحات واحدًا تلو الآخر، ثم التصحيح.",
    hint_btn: "أعطني تلميحًا", next_hint: "التلميح التالي", hint_n: "تلميح {n} من 3", show_fix: "أظهر التصحيح", show_fix_now: "أظهر التصحيح مباشرة",
    the_fix: "التصحيح", why: "لماذا يحدث هذا", check_yourself: "اختبر نفسك", every_step: "كل الخطوات", tap_reveal: "اضغط للإظهار",
    rescan: "صحّحتُها · أعد المسح للتحقق", rescanning: "إعادة التحقق: فحص الخطوة التي صحّحتها",
    untied: "انحلّت العقدة!", untied_sub: "الخطوة التي صحّحتها صحيحة الآن، وكل الخطوات الأخرى سليمة.", next_knot: "انحلّت تلك العقدة. العقدة التالية: الخطوة {n}.", still_there: "ليس بعد: العقدة نفسها ما زالت في الخطوة {n}.", not_visible: "لم يرَ Lens الخطوة التي صحّحتها في هذه الصورة. صوّر الحل كاملًا.",
    all_untied: "كل شيء صحيح", no_knot: "لا توجد عقدة. كل خطوة صحيحة.", go_deeper: "تعمّق أكثر", scan_another: "امسح حلًا آخر", ask_another: "سؤال آخر",
    answer: "الإجابة", step_by_step: "خطوة بخطوة", key_idea: "الفكرة الأساسية.", watch_out: "انتبه", confidence: "الثقة", answered_in: "الإجابة بـ{lang}",
    weak_title: "نقاط ضعفك", practice: "تدرّب على نقاط ضعفي", practice_busy: "نكتب المسائل ثم نتحقق من كل إجابة مرتين…", clear_all: "امسح الكل", remove: "إزالة",
    profile_privacy: "ملف العُقد محفوظ على هذا الجهاز فقط. لا يُرسل أي شيء عنك إلى أي خادم.",
    practice_title: "مجموعة تدريب", verified: "تحقّق منها تمرير ثانٍ من Muse Spark", show_answer: "أظهر الإجابة", hint: "تلميح", fixed: "محلولة",
    ask_help: "اكتب سؤالًا، أو صوّر سؤالًا أو مقطعًا من الكتاب، أو الاثنين معًا. يحدد Lens المادة ومستواك، من الصف الأول حتى الدكتوراه.", ask_empty: "اكتب سؤالًا أولًا، أو أضف صورة له.", drop_hint: "أي مادة فيها خطوات: حسابات، معادلات، براهين، قيود محاسبية، تتبّع شيفرة، تحويلات نحوية. يصغّر Lens الصورة إلى 1600 بكسل ويحذف بيانات الموقع أولًا.", priv_doubt_b: "لا تضع الأسماء أو المعلومات الشخصية في الأسئلة والصور.", priv_doubt: "يجيب Lens ولا يحفظها.", priv_check_b: "لا تضع الأسماء أو المعلومات الشخصية في الصورة.", priv_check: "تُحلَّل الصور ولا تُحفظ. يبقى تقرير العُقد على هذا الجهاز.", leg_ok: "صحيح", leg_knot: "عُقدة", leg_carry: "خطأ منقول",
  },
  zh: {
    speak: "说话", listening: "正在听… 点按停止", transcribing: "Muse Voice 正在转写…", mic_denied: "Lens 需要麦克风才能听到你的问题。你也可以直接输入。", voice_hint: "用你的语言说出来，Muse Voice 会写下来。检查后点按提问。",
    nav_ask: "问 Lens", nav_how: "工作原理", nav_report: "症结报告", nav_bench: "基准测试",
    lang_label: "语言", lang_auto: "自动 · 跟随我的书写", lang_search: "搜索 65 种语言", lang_indian: "印度语言（22）", lang_world: "世界语言", lang_none: "没有匹配的语言",
    scan_title: "哪里卡住了？",
    tab_doubt: "提问", tab_doubt_sub: "输入问题或拍下题目", tab_check: "检查我的解题", tab_check_sub: "Lens 找出确切的症结",
    ask_label: "你的问题或疑惑，任何学科、任何语言", ask_go: "问 Lens", snap_q: "拍题目", add_photo: "添加照片", sample_answer: "查看示例答案",
    drop_touch: "拍下你的解题过程", drop_desk: "把解题照片拖到这里", open_camera: "打开相机", choose_photo: "选择照片", try_sample: "试试示例", find_knot: "找出症结",
    knotted_at: "第 {n} 步有症结", spot_it: "第 {n} 步有错误。你能找出来吗？", spot_sub: "先试着自己找。提示会一条一条给出，最后再给出改正。",
    hint_btn: "给我一个提示", next_hint: "下一个提示", hint_n: "提示 {n}/3", show_fix: "显示改正", show_fix_now: "直接显示改正",
    the_fix: "改正", why: "为什么会这样", check_yourself: "自我检测", every_step: "每一步", tap_reveal: "点击查看",
    rescan: "我改好了 · 重新扫描验证", rescanning: "重新验证：正在检查你改正的步骤",
    untied: "症结解开了！", untied_sub: "你改正的那一步现在是对的，其余每一步也都正确。", next_knot: "这个症结解开了。下一个症结：第 {n} 步。", still_there: "还没有：同样的症结仍在第 {n} 步。", not_visible: "这张照片里看不到你改正的那一步。请拍下完整的解题过程。",
    all_untied: "全部正确", no_knot: "没有发现症结。每一步都成立。", go_deeper: "更进一步", scan_another: "再扫一份", ask_another: "再问一个",
    answer: "答案", step_by_step: "分步讲解", key_idea: "核心要点。", watch_out: "注意", confidence: "置信度", answered_in: "以{lang}回答",
    weak_title: "你的薄弱点", practice: "练习我的薄弱点", practice_busy: "正在出题，并逐题二次核对答案…", clear_all: "全部清除", remove: "移除",
    profile_privacy: "你的症结档案只保存在这台设备上，不会向服务器发送任何关于你的信息。",
    practice_title: "练习题", verified: "已由第二次 Muse Spark 独立核对", show_answer: "显示答案", hint: "提示", fixed: "已解开",
    ask_help: "输入问题，拍下题目或课本段落，或两者都用。Lens 会判断学科和你的水平，从一年级到博士。", ask_empty: "请先输入问题，或添加题目照片。", drop_hint: "任何有步骤的学科：计算、方程、证明、会计分录、代码追踪、语法转换。Lens 会先把照片缩小到 1600 px 并去除位置信息。", priv_doubt_b: "问题和照片里不要写姓名和个人信息。", priv_doubt: "Lens 只作答，不会保存。", priv_check_b: "照片里不要出现姓名和个人信息。", priv_check: "照片仅用于分析，不会保存。你的错题报告只保存在本设备上。", leg_ok: "正确", leg_knot: "错结", leg_carry: "连带错误",
  },
};
