/* oneLang — the language list. [code, English name, own name, speech locale, script flags]
   flags: r = written right to left, n = not written in the Latin alphabet (a romanization is offered) */
(() => {
'use strict';
const L = window.LANG = {};
const RAW = [
  ['af','Afrikaans','Afrikaans','af-ZA',''],['sq','Albanian','Shqip','sq-AL',''],['am','Amharic','አማርኛ','am-ET','n'],['ar','Arabic','العربية','ar-SA','rn'],
  ['hy','Armenian','Հայերեն','hy-AM','n'],['as','Assamese','অসমীয়া','as-IN','n'],['ay','Aymara','Aymar aru','es-BO',''],['az','Azerbaijani','Azərbaycan','az-AZ',''],
  ['bm','Bambara','Bamanankan','fr-ML',''],['eu','Basque','Euskara','eu-ES',''],['be','Belarusian','Беларуская','be-BY','n'],['bn','Bengali','বাংলা','bn-BD','n'],
  ['bho','Bhojpuri','भोजपुरी','hi-IN','n'],['bs','Bosnian','Bosanski','bs-BA',''],['bg','Bulgarian','Български','bg-BG','n'],['ca','Catalan','Català','ca-ES',''],
  ['ceb','Cebuano','Cebuano','fil-PH',''],['ny','Chichewa','Chichewa','en-ZA',''],['zh-CN','Chinese (Simplified)','中文（简体）','zh-CN','n'],['zh-TW','Chinese (Traditional)','中文（繁體）','zh-TW','n'],
  ['co','Corsican','Corsu','it-IT',''],['hr','Croatian','Hrvatski','hr-HR',''],['cs','Czech','Čeština','cs-CZ',''],['da','Danish','Dansk','da-DK',''],
  ['dv','Dhivehi','ދިވެހި','en-IN','rn'],['doi','Dogri','डोगरी','hi-IN','n'],['nl','Dutch','Nederlands','nl-NL',''],['en','English','English','en-US',''],
  ['eo','Esperanto','Esperanto','eo',''],['et','Estonian','Eesti','et-EE',''],['ee','Ewe','Eʋegbe','en-GH',''],['fil','Filipino','Filipino','fil-PH',''],
  ['fi','Finnish','Suomi','fi-FI',''],['fr','French','Français','fr-FR',''],['fy','Frisian','Frysk','nl-NL',''],['gl','Galician','Galego','gl-ES',''],
  ['ka','Georgian','ქართული','ka-GE','n'],['de','German','Deutsch','de-DE',''],['el','Greek','Ελληνικά','el-GR','n'],['gn','Guarani','Avañe\'ẽ','es-PY',''],
  ['gu','Gujarati','ગુજરાતી','gu-IN','n'],['ht','Haitian Creole','Kreyòl ayisyen','fr-HT',''],['ha','Hausa','Hausa','ha-NG',''],['haw','Hawaiian','ʻŌlelo Hawaiʻi','haw-US',''],
  ['iw','Hebrew','עברית','he-IL','rn'],['hi','Hindi','हिन्दी','hi-IN','n'],['hmn','Hmong','Hmoob','en-US',''],['hu','Hungarian','Magyar','hu-HU',''],
  ['is','Icelandic','Íslenska','is-IS',''],['ig','Igbo','Igbo','ig-NG',''],['ilo','Ilocano','Ilokano','fil-PH',''],['id','Indonesian','Bahasa Indonesia','id-ID',''],
  ['ga','Irish','Gaeilge','ga-IE',''],['it','Italian','Italiano','it-IT',''],['ja','Japanese','日本語','ja-JP','n'],['jw','Javanese','Basa Jawa','jv-ID',''],
  ['kn','Kannada','ಕನ್ನಡ','kn-IN','n'],['kk','Kazakh','Қазақша','kk-KZ','n'],['km','Khmer','ខ្មែរ','km-KH','n'],['rw','Kinyarwanda','Kinyarwanda','rw-RW',''],
  ['gom','Konkani','कोंकणी','hi-IN','n'],['ko','Korean','한국어','ko-KR','n'],['kri','Krio','Krio','en-SL',''],['ku','Kurdish (Kurmanji)','Kurdî','tr-TR',''],
  ['ckb','Kurdish (Sorani)','کوردی','ckb-IQ','rn'],['ky','Kyrgyz','Кыргызча','ky-KG','n'],['lo','Lao','ລາວ','lo-LA','n'],['la','Latin','Latina','it-IT',''],
  ['lv','Latvian','Latviešu','lv-LV',''],['ln','Lingala','Lingála','fr-CD',''],['lt','Lithuanian','Lietuvių','lt-LT',''],['lg','Luganda','Luganda','en-UG',''],
  ['lb','Luxembourgish','Lëtzebuergesch','de-LU',''],['mk','Macedonian','Македонски','mk-MK','n'],['mai','Maithili','मैथिली','hi-IN','n'],['mg','Malagasy','Malagasy','mg-MG',''],
  ['ms','Malay','Bahasa Melayu','ms-MY',''],['ml','Malayalam','മലയാളം','ml-IN','n'],['mt','Maltese','Malti','mt-MT',''],['mi','Maori','Māori','mi-NZ',''],
  ['mr','Marathi','मराठी','mr-IN','n'],['mni-Mtei','Meiteilon (Manipuri)','ꯃꯤꯇꯩꯂꯣꯟ','bn-IN','n'],['lus','Mizo','Mizo ṭawng','en-IN',''],['mn','Mongolian','Монгол','mn-MN','n'],
  ['my','Myanmar (Burmese)','မြန်မာ','my-MM','n'],['ne','Nepali','नेपाली','ne-NP','n'],['no','Norwegian','Norsk','nb-NO',''],['or','Odia (Oriya)','ଓଡ଼ିଆ','or-IN','n'],
  ['om','Oromo','Afaan Oromoo','om-ET',''],['ps','Pashto','پښتو','ps-AF','rn'],['fa','Persian','فارسی','fa-IR','rn'],['pl','Polish','Polski','pl-PL',''],
  ['pt','Portuguese','Português','pt-PT',''],['pa','Punjabi','ਪੰਜਾਬੀ','pa-IN','n'],['qu','Quechua','Runasimi','es-PE',''],['ro','Romanian','Română','ro-RO',''],
  ['ru','Russian','Русский','ru-RU','n'],['sm','Samoan','Gagana Sāmoa','en-NZ',''],['sa','Sanskrit','संस्कृतम्','hi-IN','n'],['gd','Scots Gaelic','Gàidhlig','gd-GB',''],
  ['nso','Sepedi','Sepedi','en-ZA',''],['sr','Serbian','Српски','sr-RS','n'],['st','Sesotho','Sesotho','st-ZA',''],['sn','Shona','chiShona','en-ZW',''],
  ['sd','Sindhi','سنڌي','sd-PK','rn'],['si','Sinhala','සිංහල','si-LK','n'],['sk','Slovak','Slovenčina','sk-SK',''],['sl','Slovenian','Slovenščina','sl-SI',''],
  ['so','Somali','Soomaali','so-SO',''],['es','Spanish','Español','es-ES',''],['su','Sundanese','Basa Sunda','su-ID',''],['sw','Swahili','Kiswahili','sw-KE',''],
  ['sv','Swedish','Svenska','sv-SE',''],['tg','Tajik','Тоҷикӣ','tg-TJ','n'],['ta','Tamil','தமிழ்','ta-IN','n'],['tt','Tatar','Татар','tt-RU','n'],
  ['te','Telugu','తెలుగు','te-IN','n'],['th','Thai','ไทย','th-TH','n'],['ti','Tigrinya','ትግርኛ','ti-ET','n'],['ts','Tsonga','Xitsonga','en-ZA',''],
  ['tr','Turkish','Türkçe','tr-TR',''],['tk','Turkmen','Türkmen','tk-TM',''],['ak','Twi','Twi','en-GH',''],['uk','Ukrainian','Українська','uk-UA','n'],
  ['ur','Urdu','اردو','ur-PK','rn'],['ug','Uyghur','ئۇيغۇرچە','ug-CN','rn'],['uz','Uzbek','Oʻzbek','uz-UZ',''],['vi','Vietnamese','Tiếng Việt','vi-VN',''],
  ['cy','Welsh','Cymraeg','cy-GB',''],['xh','Xhosa','isiXhosa','xh-ZA',''],['yi','Yiddish','ייִדיש','yi','rn'],['yo','Yoruba','Yorùbá','yo-NG',''],['zu','Zulu','isiZulu','zu-ZA',''],
];
L.list = RAW.map(([code, name, own, speech, f]) => ({ code, name, own, speech, rtl:f.includes('r'), nonLatin:f.includes('n') }));
L.by = Object.fromEntries(L.list.map(l => [l.code, l]));
L.AUTO = 'auto';
L.name = c => c === L.AUTO ? 'Detect language' : (L.by[c] ? L.by[c].name : c);
L.rtl = c => !!(L.by[c] && L.by[c].rtl);
L.nonLatin = c => !!(L.by[c] && L.by[c].nonLatin);
/* the model answers with ISO-ish codes; map the odd ones onto this list */
const ALIAS = { he:'iw', jv:'jw', zh:'zh-CN', 'zh-Hans':'zh-CN', 'zh-Hant':'zh-TW', 'zh-HK':'zh-TW', nb:'no', nn:'no', tl:'fil', mni:'mni-Mtei', 'pt-BR':'pt', 'pt-PT':'pt', 'en-US':'en', 'en-GB':'en', 'es-419':'es', 'es-MX':'es', 'fr-CA':'fr' };
L.norm = raw => {
  const s = String(raw || '').trim().replace(/_/g, '-'); if (!s) return null;
  if (L.by[s]) return s; if (ALIAS[s]) return ALIAS[s];
  const base = s.split('-')[0].toLowerCase(); if (L.by[base]) return base; if (ALIAS[base]) return ALIAS[base];
  const byName = L.list.find(l => l.name.toLowerCase() === s.toLowerCase() || l.name.toLowerCase().startsWith(s.toLowerCase() + ' ('));
  return byName ? byName.code : null;
};
/* cheap guess from the script alone (so the language chip and text direction react before the model answers) */
L.guess = text => {
  const t = String(text || '').slice(0, 400);
  const has = re => (t.match(re) || []).length, n = t.replace(/\s+/g, '').length || 1;
  if (has(/[぀-ヿ]/g) > 0) return 'ja'; if (has(/[가-힯]/g) / n > .3) return 'ko'; if (has(/[一-鿿]/g) / n > .3) return 'zh-CN';
  if (has(/[؀-ۿ]/g) / n > .3) return 'ar'; if (has(/[֐-׿]/g) / n > .3) return 'iw'; if (has(/[Ѐ-ӿ]/g) / n > .3) return 'ru';
  if (has(/[ऀ-ॿ]/g) / n > .3) return 'hi'; if (has(/[฀-๿]/g) / n > .3) return 'th'; if (has(/[Ͱ-Ͽ]/g) / n > .3) return 'el';
  return null;
};
})();
