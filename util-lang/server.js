const express = require('express');
const cors = require('cors')
const fetch = require('node-fetch')
const cld = require('cld')
const korean  = require('./lib/js/korean')
const heb = require("hebrew-transliteration");
const hebTransliterate = heb.transliterate;
const child = require("child_process")






const langs = [{"alpha_2": "aa", "alpha_3": "aar", "name": "Afar"}, {"alpha_2": "ab", "alpha_3": "abk", "name": "Abkhazian"}, {"alpha_3": "ace", "name": "Achinese", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "ach", "name": "Acoli", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "ada", "name": "Adangme", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "ady", "name": "Adyghe; Adygei", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "afa", "name": "Afro-Asiatic languages"}, {"alpha_3": "afh", "name": "Afrihili"}, {"alpha_2": "af", "alpha_3": "afr", "name": "Afrikaans"}, {"alpha_3": "ain", "name": "Ainu", "scripts": ["Kana"], "scriptsSecondary": ["Latn"]}, {"alpha_2": "ak", "alpha_3": "aka", "name": "Akan"}, {"alpha_3": "akk", "name": "Akkadian", "scripts": ["Xsux"], "scriptsSecondary": []}, {"alpha_3": "ale", "name": "Aleut", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "alg", "name": "Algonquian languages"}, {"alpha_3": "alt", "name": "Southern Altai", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_2": "am", "alpha_3": "amh", "name": "Amharic"}, {"alpha_3": "ang", "name": "English, Old (ca. 450-1100)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "anp", "name": "Angika", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_3": "apa", "name": "Apache languages"}, {"alpha_2": "ar", "alpha_3": "ara", "name": "Arabic"}, {"alpha_3": "arc", "name": "Official Aramaic (700-300 BCE); Imperial Aramaic (700-300 BCE)", "scripts": ["Armi"], "scriptsSecondary": ["Nbat", "Palm"]}, {"alpha_2": "an", "alpha_3": "arg", "name": "Aragonese"}, {"alpha_3": "arn", "name": "Mapudungun; Mapuche", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "arp", "name": "Arapaho", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "art", "name": "Artificial languages"}, {"alpha_3": "arw", "name": "Arawak", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "as", "alpha_3": "asm", "name": "Assamese"}, {"alpha_3": "ast", "name": "Asturian; Bable; Leonese; Asturleonese", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "ath", "name": "Athapascan languages"}, {"alpha_3": "aus", "name": "Australian languages"}, {"alpha_2": "av", "alpha_3": "ava", "name": "Avaric"}, {"alpha_2": "ae", "alpha_3": "ave", "name": "Avestan"}, {"alpha_3": "awa", "name": "Awadhi", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_2": "ay", "alpha_3": "aym", "name": "Aymara"}, {"alpha_2": "az", "alpha_3": "aze", "name": "Azerbaijani"}, {"alpha_3": "bad", "name": "Banda languages"}, {"alpha_3": "bai", "name": "Bamileke languages"}, {"alpha_2": "ba", "alpha_3": "bak", "name": "Bashkir"}, {"alpha_3": "bal", "name": "Baluchi", "scripts": ["Arab"], "scriptsSecondary": ["Latn"]}, {"alpha_2": "bm", "alpha_3": "bam", "name": "Bambara"}, {"alpha_3": "ban", "name": "Balinese", "scripts": ["Latn"], "scriptsSecondary": ["Bali"]}, {"alpha_3": "bas", "name": "Basa", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "bat", "name": "Baltic languages"}, {"alpha_3": "bej", "name": "Beja; Bedawiyet", "scripts": ["Arab"], "scriptsSecondary": []}, {"alpha_2": "be", "alpha_3": "bel", "name": "Belarusian"}, {"alpha_3": "bem", "name": "Bemba", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "bn", "alpha_3": "ben", "common_name": "Bangla", "name": "Bengali"}, {"alpha_3": "ber", "name": "Berber languages"}, {"alpha_3": "bho", "name": "Bhojpuri", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_2": "bh", "alpha_3": "bih", "name": "Bihari languages"}, {"alpha_3": "bik", "name": "Bikol", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "bin", "name": "Bini; Edo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "bi", "alpha_3": "bis", "name": "Bislama"}, {"alpha_3": "bla", "name": "Siksika", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "bnt", "name": "Bantu (Other)"}, {"alpha_2": "bo", "alpha_3": "bod", "bibliographic": "tib", "name": "Tibetan"}, {"alpha_2": "bs", "alpha_3": "bos", "name": "Bosnian"}, {"alpha_3": "bra", "name": "Braj", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_2": "br", "alpha_3": "bre", "name": "Breton"}, {"alpha_3": "btk", "name": "Batak languages"}, {"alpha_3": "bua", "name": "Buriat", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "bug", "name": "Buginese", "scripts": ["Latn"], "scriptsSecondary": ["Bugi"]}, {"alpha_2": "bg", "alpha_3": "bul", "name": "Bulgarian"}, {"alpha_3": "byn", "name": "Blin; Bilin", "scripts": ["Ethi"], "scriptsSecondary": []}, {"alpha_3": "cad", "name": "Caddo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "cai", "name": "Central American Indian languages"}, {"alpha_3": "car", "name": "Galibi Carib", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "ca", "alpha_3": "cat", "name": "Catalan; Valencian"}, {"alpha_3": "cau", "name": "Caucasian languages"}, {"alpha_3": "ceb", "name": "Cebuano", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "cel", "name": "Celtic languages"}, {"alpha_2": "cs", "alpha_3": "ces", "bibliographic": "cze", "name": "Czech"}, {"alpha_2": "ch", "alpha_3": "cha", "name": "Chamorro"}, {"alpha_3": "chb", "name": "Chibcha"}, {"alpha_2": "ce", "alpha_3": "che", "name": "Chechen"}, {"alpha_3": "chg", "name": "Chagatai"}, {"alpha_3": "chk", "name": "Chuukese", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "chm", "name": "Mari", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "chn", "name": "Chinook jargon", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "cho", "name": "Choctaw", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "chp", "name": "Chipewyan; Dene Suline", "scripts": ["Latn"], "scriptsSecondary": ["Cans"]}, {"alpha_3": "chr", "name": "Cherokee", "scripts": ["Cher"], "scriptsSecondary": []}, {"alpha_2": "cu", "alpha_3": "chu", "name": "Church Slavic; Old Slavonic; Church Slavonic; Old Bulgarian; Old Church Slavonic"}, {"alpha_2": "cv", "alpha_3": "chv", "name": "Chuvash"}, {"alpha_3": "chy", "name": "Cheyenne", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "cmc", "name": "Chamic languages"}, {"alpha_3": "cop", "name": "Coptic", "scripts": ["Arab"], "scriptsSecondary": ["Copt", "Grek"]}, {"alpha_2": "kw", "alpha_3": "cor", "name": "Cornish"}, {"alpha_2": "co", "alpha_3": "cos", "name": "Corsican"}, {"alpha_3": "cpe", "name": "Creoles and pidgins, English based"}, {"alpha_3": "cpf", "name": "Creoles and pidgins, French-based"}, {"alpha_3": "cpp", "name": "Creoles and pidgins, Portuguese-based"}, {"alpha_2": "cr", "alpha_3": "cre", "name": "Cree"}, {"alpha_3": "crh", "name": "Crimean Tatar; Crimean Turkish", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "crp", "name": "Creoles and pidgins"}, {"alpha_3": "csb", "name": "Kashubian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "cus", "name": "Cushitic languages"}, {"alpha_2": "cy", "alpha_3": "cym", "bibliographic": "wel", "name": "Welsh"}, {"alpha_3": "dak", "name": "Dakota", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "da", "alpha_3": "dan", "name": "Danish"}, {"alpha_3": "dar", "name": "Dargwa", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "day", "name": "Land Dayak languages"}, {"alpha_3": "del", "name": "Delaware", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "den", "name": "Slave (Athapascan)", "scripts": ["Latn"], "scriptsSecondary": ["Cans"]}, {"alpha_2": "de", "alpha_3": "deu", "bibliographic": "ger", "name": "German"}, {"alpha_3": "dgr", "name": "Dogrib", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "din", "name": "Dinka", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "dv", "alpha_3": "div", "name": "Divehi; Dhivehi; Maldivian"}, {"alpha_3": "doi", "name": "Dogri", "scripts": ["Deva"], "scriptsSecondary": ["Arab", "Takr"]}, {"alpha_3": "dra", "name": "Dravidian languages"}, {"alpha_3": "dsb", "name": "Lower Sorbian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "dua", "name": "Duala", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "dum", "name": "Dutch, Middle (ca. 1050-1350)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "dyu", "name": "Dyula", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "dz", "alpha_3": "dzo", "name": "Dzongkha"}, {"alpha_3": "efi", "name": "Efik", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "egy", "name": "Egyptian (Ancient)", "scripts": ["Egyp"], "scriptsSecondary": []}, {"alpha_3": "eka", "name": "Ekajuk", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "el", "alpha_3": "ell", "bibliographic": "gre", "name": "Greek, Modern (1453-)"}, {"alpha_3": "elx", "name": "Elamite"}, {"alpha_2": "en", "alpha_3": "eng", "name": "English"}, {"alpha_3": "enm", "name": "English, Middle (1100-1500)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "eo", "alpha_3": "epo", "name": "Esperanto"}, {"alpha_2": "et", "alpha_3": "est", "name": "Estonian"}, {"alpha_2": "eu", "alpha_3": "eus", "bibliographic": "baq", "name": "Basque"}, {"alpha_2": "ee", "alpha_3": "ewe", "name": "Ewe"}, {"alpha_3": "ewo", "name": "Ewondo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "fan", "name": "Fang", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "fo", "alpha_3": "fao", "name": "Faroese"}, {"alpha_2": "fa", "alpha_3": "fas", "bibliographic": "per", "name": "Persian"}, {"alpha_3": "fat", "name": "Fanti"}, {"alpha_2": "fj", "alpha_3": "fij", "name": "Fijian"}, {"alpha_3": "fil", "name": "Filipino; Pilipino", "scripts": ["Latn"], "scriptsSecondary": ["Tglg"]}, {"alpha_2": "fi", "alpha_3": "fin", "name": "Finnish"}, {"alpha_3": "fiu", "name": "Finno-Ugrian languages"}, {"alpha_3": "fon", "name": "Fon", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "fr", "alpha_3": "fra", "bibliographic": "fre", "name": "French"}, {"alpha_3": "frm", "name": "French, Middle (ca. 1400-1600)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "fro", "name": "French, Old (842-ca. 1400)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "frr", "name": "Northern Frisian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "frs", "name": "Eastern Frisian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "fy", "alpha_3": "fry", "name": "Western Frisian"}, {"alpha_2": "ff", "alpha_3": "ful", "name": "Fulah"}, {"alpha_3": "fur", "name": "Friulian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "gaa", "name": "Ga", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "gay", "name": "Gayo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "gba", "name": "Gbaya", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "gem", "name": "Germanic languages"}, {"alpha_3": "gez", "name": "Geez", "scripts": ["Ethi"], "scriptsSecondary": []}, {"alpha_3": "gil", "name": "Gilbertese", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "gd", "alpha_3": "gla", "name": "Gaelic; Scottish Gaelic"}, {"alpha_2": "ga", "alpha_3": "gle", "name": "Irish"}, {"alpha_2": "gl", "alpha_3": "glg", "name": "Galician"}, {"alpha_2": "gv", "alpha_3": "glv", "name": "Manx"}, {"alpha_3": "gmh", "name": "German, Middle High (ca. 1050-1500)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "goh", "name": "German, Old High (ca. 750-1050)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "gon", "name": "Gondi", "scripts": ["Deva", "Telu"], "scriptsSecondary": []}, {"alpha_3": "gor", "name": "Gorontalo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "got", "name": "Gothic", "scripts": ["Goth"], "scriptsSecondary": []}, {"alpha_3": "grb", "name": "Grebo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "grc", "name": "Greek, Ancient (to 1453)", "scripts": ["Cprt"], "scriptsSecondary": ["Grek", "Linb"]}, {"alpha_2": "gn", "alpha_3": "grn", "name": "Guarani"}, {"alpha_3": "gsw", "name": "Swiss German; Alemannic; Alsatian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "gu", "alpha_3": "guj", "name": "Gujarati"}, {"alpha_3": "gwi", "name": "Gwich'in", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "hai", "name": "Haida", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "ht", "alpha_3": "hat", "name": "Haitian; Haitian Creole"}, {"alpha_2": "ha", "alpha_3": "hau", "name": "Hausa"}, {"alpha_3": "haw", "name": "Hawaiian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "he", "alpha_3": "heb", "name": "Hebrew"}, {"alpha_2": "hz", "alpha_3": "her", "name": "Herero"}, {"alpha_3": "hil", "name": "Hiligaynon", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "him", "name": "Himachali languages; Western Pahari languages"}, {"alpha_2": "hi", "alpha_3": "hin", "name": "Hindi"}, {"alpha_3": "hit", "name": "Hittite", "scripts": ["Xsux"], "scriptsSecondary": []}, {"alpha_3": "hmn", "name": "Hmong; Mong", "scripts": ["Latn"], "scriptsSecondary": ["Hmng"]}, {"alpha_2": "ho", "alpha_3": "hmo", "name": "Hiri Motu"}, {"alpha_2": "hr", "alpha_3": "hrv", "name": "Croatian"}, {"alpha_3": "hsb", "name": "Upper Sorbian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "hu", "alpha_3": "hun", "name": "Hungarian"}, {"alpha_3": "hup", "name": "Hupa", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "hy", "alpha_3": "hye", "bibliographic": "arm", "name": "Armenian"}, {"alpha_3": "iba", "name": "Iban", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "ig", "alpha_3": "ibo", "name": "Igbo"}, {"alpha_2": "io", "alpha_3": "ido", "name": "Ido"}, {"alpha_2": "ii", "alpha_3": "iii", "name": "Sichuan Yi; Nuosu"}, {"alpha_3": "ijo", "name": "Ijo languages"}, {"alpha_2": "iu", "alpha_3": "iku", "name": "Inuktitut"}, {"alpha_2": "ie", "alpha_3": "ile", "name": "Interlingue; Occidental"}, {"alpha_3": "ilo", "name": "Iloko", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "ia", "alpha_3": "ina", "name": "Interlingua (International Auxiliary Language Association)"}, {"alpha_3": "inc", "name": "Indic languages"}, {"alpha_2": "id", "alpha_3": "ind", "name": "Indonesian"}, {"alpha_3": "ine", "name": "Indo-European languages"}, {"alpha_3": "inh", "name": "Ingush", "scripts": ["Cyrl"], "scriptsSecondary": ["Arab", "Latn"]}, {"alpha_2": "ik", "alpha_3": "ipk", "name": "Inupiaq"}, {"alpha_3": "ira", "name": "Iranian languages"}, {"alpha_3": "iro", "name": "Iroquoian languages"}, {"alpha_2": "is", "alpha_3": "isl", "bibliographic": "ice", "name": "Icelandic"}, {"alpha_2": "it", "alpha_3": "ita", "name": "Italian"}, {"alpha_2": "jv", "alpha_3": "jav", "name": "Javanese"}, {"alpha_3": "jbo", "name": "Lojban"}, {"alpha_2": "ja", "alpha_3": "jpn", "name": "Japanese"}, {"alpha_3": "jpr", "name": "Judeo-Persian", "scripts": ["Hebr"], "scriptsSecondary": []}, {"alpha_3": "jrb", "name": "Judeo-Arabic", "scripts": ["Hebr"], "scriptsSecondary": []}, {"alpha_3": "kaa", "name": "Kara-Kalpak", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "kab", "name": "Kabyle", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "kac", "name": "Kachin; Jingpho", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "kl", "alpha_3": "kal", "name": "Kalaallisut; Greenlandic"}, {"alpha_3": "kam", "name": "Kamba", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "kn", "alpha_3": "kan", "name": "Kannada"}, {"alpha_3": "kar", "name": "Karen languages"}, {"alpha_2": "ks", "alpha_3": "kas", "name": "Kashmiri"}, {"alpha_2": "ka", "alpha_3": "kat", "bibliographic": "geo", "name": "Georgian"}, {"alpha_2": "kr", "alpha_3": "kau", "name": "Kanuri"}, {"alpha_3": "kaw", "name": "Kawi"}, {"alpha_2": "kk", "alpha_3": "kaz", "name": "Kazakh"}, {"alpha_3": "kbd", "name": "Kabardian", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "kha", "name": "Khasi", "scripts": ["Latn"], "scriptsSecondary": ["Beng"]}, {"alpha_3": "khi", "name": "Khoisan languages"}, {"alpha_2": "km", "alpha_3": "khm", "name": "Central Khmer"}, {"alpha_3": "kho", "name": "Khotanese; Sakan"}, {"alpha_2": "ki", "alpha_3": "kik", "name": "Kikuyu; Gikuyu"}, {"alpha_2": "rw", "alpha_3": "kin", "name": "Kinyarwanda"}, {"alpha_2": "ky", "alpha_3": "kir", "name": "Kirghiz; Kyrgyz"}, {"alpha_3": "kmb", "name": "Kimbundu", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "kok", "name": "Konkani", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_2": "kv", "alpha_3": "kom", "name": "Komi"}, {"alpha_2": "kg", "alpha_3": "kon", "name": "Kongo"}, {"alpha_2": "ko", "alpha_3": "kor", "name": "Korean"}, {"alpha_3": "kos", "name": "Kosraean", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "kpe", "name": "Kpelle", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "krc", "name": "Karachay-Balkar", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "krl", "name": "Karelian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "kro", "name": "Kru languages"}, {"alpha_3": "kru", "name": "Kurukh", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_2": "kj", "alpha_3": "kua", "name": "Kuanyama; Kwanyama"}, {"alpha_3": "kum", "name": "Kumyk", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_2": "ku", "alpha_3": "kur", "name": "Kurdish"}, {"alpha_3": "kut", "name": "Kutenai", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "lad", "name": "Ladino", "scripts": ["Hebr"], "scriptsSecondary": []}, {"alpha_3": "lah", "name": "Lahnda", "scripts": ["Arab"], "scriptsSecondary": []}, {"alpha_3": "lam", "name": "Lamba", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "lo", "alpha_3": "lao", "name": "Lao"}, {"alpha_2": "la", "alpha_3": "lat", "name": "Latin"}, {"alpha_2": "lv", "alpha_3": "lav", "name": "Latvian"}, {"alpha_3": "lez", "name": "Lezghian", "scripts": ["Cyrl"], "scriptsSecondary": ["Aghb"]}, {"alpha_2": "li", "alpha_3": "lim", "name": "Limburgan; Limburger; Limburgish"}, {"alpha_2": "ln", "alpha_3": "lin", "name": "Lingala"}, {"alpha_2": "lt", "alpha_3": "lit", "name": "Lithuanian"}, {"alpha_3": "lol", "name": "Mongo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "loz", "name": "Lozi", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "lb", "alpha_3": "ltz", "name": "Luxembourgish; Letzeburgesch"}, {"alpha_3": "lua", "name": "Luba-Lulua", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "lu", "alpha_3": "lub", "name": "Luba-Katanga"}, {"alpha_2": "lg", "alpha_3": "lug", "name": "Ganda"}, {"alpha_3": "lui", "name": "Luiseno", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "lun", "name": "Lunda", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "luo", "name": "Luo (Kenya and Tanzania)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "lus", "name": "Lushai", "scripts": ["Beng"], "scriptsSecondary": []}, {"alpha_3": "mad", "name": "Madurese", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "mag", "name": "Magahi", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_2": "mh", "alpha_3": "mah", "name": "Marshallese"}, {"alpha_3": "mai", "name": "Maithili", "scripts": ["Deva"], "scriptsSecondary": ["Tirh"]}, {"alpha_3": "mak", "name": "Makasar", "scripts": ["Latn"], "scriptsSecondary": ["Bugi"]}, {"alpha_2": "ml", "alpha_3": "mal", "name": "Malayalam"}, {"alpha_3": "man", "name": "Mandingo", "scripts": ["Latn", "Nkoo"], "scriptsSecondary": []}, {"alpha_3": "map", "name": "Austronesian languages"}, {"alpha_2": "mr", "alpha_3": "mar", "name": "Marathi"}, {"alpha_3": "mas", "name": "Masai", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "mdf", "name": "Moksha", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "mdr", "name": "Mandar", "scripts": ["Latn"], "scriptsSecondary": ["Bugi"]}, {"alpha_3": "men", "name": "Mende", "scripts": ["Latn"], "scriptsSecondary": ["Mend"]}, {"alpha_3": "mga", "name": "Irish, Middle (900-1200)"}, {"alpha_3": "mic", "name": "Mi'kmaq; Micmac", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "min", "name": "Minangkabau", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "mis", "name": "Uncoded languages"}, {"alpha_2": "mk", "alpha_3": "mkd", "bibliographic": "mac", "name": "Macedonian"}, {"alpha_3": "mkh", "name": "Mon-Khmer languages"}, {"alpha_2": "mg", "alpha_3": "mlg", "name": "Malagasy"}, {"alpha_2": "mt", "alpha_3": "mlt", "name": "Maltese"}, {"alpha_3": "mnc", "name": "Manchu", "scripts": ["Mong"], "scriptsSecondary": []}, {"alpha_3": "mni", "name": "Manipuri", "scripts": ["Beng"], "scriptsSecondary": ["Mtei"]}, {"alpha_3": "mno", "name": "Manobo languages"}, {"alpha_3": "moh", "name": "Mohawk", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "mn", "alpha_3": "mon", "name": "Mongolian"}, {"alpha_3": "mos", "name": "Mossi", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "mi", "alpha_3": "mri", "bibliographic": "mao", "name": "Maori"}, {"alpha_2": "ms", "alpha_3": "msa", "bibliographic": "may", "name": "Malay"}, {"alpha_3": "mul", "name": "Multiple languages"}, {"alpha_3": "mun", "name": "Munda languages"}, {"alpha_3": "mus", "name": "Creek", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "mwl", "name": "Mirandese", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "mwr", "name": "Marwari", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_2": "my", "alpha_3": "mya", "bibliographic": "bur", "name": "Burmese"}, {"alpha_3": "myn", "name": "Mayan languages"}, {"alpha_3": "myv", "name": "Erzya", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "nah", "name": "Nahuatl languages"}, {"alpha_3": "nai", "name": "North American Indian languages"}, {"alpha_3": "nap", "name": "Neapolitan", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "na", "alpha_3": "nau", "name": "Nauru"}, {"alpha_2": "nv", "alpha_3": "nav", "name": "Navajo; Navaho"}, {"alpha_2": "nr", "alpha_3": "nbl", "name": "Ndebele, South; South Ndebele"}, {"alpha_2": "nd", "alpha_3": "nde", "name": "Ndebele, North; North Ndebele"}, {"alpha_2": "ng", "alpha_3": "ndo", "name": "Ndonga"}, {"alpha_3": "nds", "name": "Low German; Low Saxon; German, Low; Saxon, Low", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "ne", "alpha_3": "nep", "name": "Nepali"}, {"alpha_3": "new", "name": "Nepal Bhasa; Newari", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_3": "nia", "name": "Nias", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "nic", "name": "Niger-Kordofanian languages"}, {"alpha_3": "niu", "name": "Niuean", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "nl", "alpha_3": "nld", "bibliographic": "dut", "name": "Dutch; Flemish"}, {"alpha_2": "nn", "alpha_3": "nno", "name": "Norwegian Nynorsk; Nynorsk, Norwegian"}, {"alpha_2": "nb", "alpha_3": "nob", "name": "Bokm\u00e5l, Norwegian; Norwegian Bokm\u00e5l"}, {"alpha_3": "nog", "name": "Nogai", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "non", "name": "Norse, Old", "scripts": ["Runr"], "scriptsSecondary": []}, {"alpha_2": "no", "alpha_3": "nor", "name": "Norwegian"}, {"alpha_3": "nqo", "name": "N'Ko", "scripts": ["Nkoo"], "scriptsSecondary": []}, {"alpha_3": "nso", "name": "Pedi; Sepedi; Northern Sotho", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "nub", "name": "Nubian languages"}, {"alpha_3": "nwc", "name": "Classical Newari; Old Newari; Classical Nepal Bhasa"}, {"alpha_2": "ny", "alpha_3": "nya", "name": "Chichewa; Chewa; Nyanja"}, {"alpha_3": "nym", "name": "Nyamwezi", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "nyn", "name": "Nyankole", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "nyo", "name": "Nyoro", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "nzi", "name": "Nzima", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "oc", "alpha_3": "oci", "name": "Occitan (post 1500); Proven\u00e7al"}, {"alpha_2": "oj", "alpha_3": "oji", "name": "Ojibwa"}, {"alpha_2": "or", "alpha_3": "ori", "name": "Oriya"}, {"alpha_2": "om", "alpha_3": "orm", "name": "Oromo"}, {"alpha_3": "osa", "name": "Osage", "scripts": ["Osge"], "scriptsSecondary": ["Latn"]}, {"alpha_2": "os", "alpha_3": "oss", "name": "Ossetian; Ossetic"}, {"alpha_3": "ota", "name": "Turkish, Ottoman (1500-1928)"}, {"alpha_3": "oto", "name": "Otomian languages"}, {"alpha_3": "paa", "name": "Papuan languages"}, {"alpha_3": "pag", "name": "Pangasinan", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "pal", "name": "Pahlavi", "scripts": ["Phli"], "scriptsSecondary": ["Phlp"]}, {"alpha_3": "pam", "name": "Pampanga; Kapampangan", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "pa", "alpha_3": "pan", "name": "Panjabi; Punjabi"}, {"alpha_3": "pap", "name": "Papiamento", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "pau", "name": "Palauan", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "peo", "name": "Persian, Old (ca. 600-400 B.C.)", "scripts": ["Xpeo"], "scriptsSecondary": []}, {"alpha_3": "phi", "name": "Philippine languages"}, {"alpha_3": "phn", "name": "Phoenician", "scripts": ["Phnx"], "scriptsSecondary": []}, {"alpha_2": "pi", "alpha_3": "pli", "name": "Pali"}, {"alpha_2": "pl", "alpha_3": "pol", "name": "Polish"}, {"alpha_3": "pon", "name": "Pohnpeian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "pt", "alpha_3": "por", "name": "Portuguese"}, {"alpha_3": "pra", "name": "Prakrit languages"}, {"alpha_3": "pro", "name": "Proven\u00e7al, Old (to 1500)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "ps", "alpha_3": "pus", "name": "Pushto; Pashto"}, {"alpha_3": "qaa-qtz", "name": "Reserved for local use"}, {"alpha_2": "qu", "alpha_3": "que", "name": "Quechua"}, {"alpha_3": "raj", "name": "Rajasthani", "scripts": ["Deva"], "scriptsSecondary": []}, {"alpha_3": "rap", "name": "Rapanui", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "rar", "name": "Rarotongan; Cook Islands Maori", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "roa", "name": "Romance languages"}, {"alpha_2": "rm", "alpha_3": "roh", "name": "Romansh"}, {"alpha_3": "rom", "name": "Romany", "scripts": ["Latn"], "scriptsSecondary": ["Cyrl"]}, {"alpha_2": "ro", "alpha_3": "ron", "bibliographic": "rum", "name": "Romanian; Moldavian; Moldovan"}, {"alpha_2": "rn", "alpha_3": "run", "name": "Rundi"}, {"alpha_3": "rup", "name": "Aromanian; Arumanian; Macedo-Romanian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "ru", "alpha_3": "rus", "name": "Russian"}, {"alpha_3": "sad", "name": "Sandawe", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "sg", "alpha_3": "sag", "name": "Sango"}, {"alpha_3": "sah", "name": "Yakut", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "sai", "name": "South American Indian (Other)"}, {"alpha_3": "sal", "name": "Salishan languages"}, {"alpha_3": "sam", "name": "Samaritan Aramaic", "scripts": ["Hebr"], "scriptsSecondary": ["Samr"]}, {"alpha_2": "sa", "alpha_3": "san", "name": "Sanskrit"}, {"alpha_3": "sas", "name": "Sasak", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "sat", "name": "Santali", "scripts": ["Olck"], "scriptsSecondary": ["Beng", "Deva", "Latn", "Orya"]}, {"alpha_3": "scn", "name": "Sicilian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "sco", "name": "Scots", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "sel", "name": "Selkup", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "sem", "name": "Semitic languages"}, {"alpha_3": "sga", "name": "Irish, Old (to 900)", "scripts": ["Latn"], "scriptsSecondary": ["Ogam"]}, {"alpha_3": "sgn", "name": "Sign Languages"}, {"alpha_3": "shn", "name": "Shan", "scripts": ["Mymr"], "scriptsSecondary": []}, {"alpha_3": "sid", "name": "Sidamo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "si", "alpha_3": "sin", "name": "Sinhala; Sinhalese"}, {"alpha_3": "sio", "name": "Siouan languages"}, {"alpha_3": "sit", "name": "Sino-Tibetan languages"}, {"alpha_3": "sla", "name": "Slavic languages"}, {"alpha_2": "sk", "alpha_3": "slk", "bibliographic": "slo", "name": "Slovak"}, {"alpha_2": "sl", "alpha_3": "slv", "name": "Slovenian"}, {"alpha_3": "sma", "name": "Southern Sami", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "se", "alpha_3": "sme", "name": "Northern Sami"}, {"alpha_3": "smi", "name": "Sami languages"}, {"alpha_3": "smj", "name": "Lule Sami", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "smn", "name": "Inari Sami", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "sm", "alpha_3": "smo", "name": "Samoan"}, {"alpha_3": "sms", "name": "Skolt Sami", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "sn", "alpha_3": "sna", "name": "Shona"}, {"alpha_2": "sd", "alpha_3": "snd", "name": "Sindhi"}, {"alpha_3": "snk", "name": "Soninke", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "sog", "name": "Sogdian"}, {"alpha_2": "so", "alpha_3": "som", "name": "Somali"}, {"alpha_3": "son", "name": "Songhai languages"}, {"alpha_2": "st", "alpha_3": "sot", "name": "Sotho, Southern"}, {"alpha_2": "es", "alpha_3": "spa", "name": "Spanish; Castilian"}, {"alpha_2": "sq", "alpha_3": "sqi", "bibliographic": "alb", "name": "Albanian"}, {"alpha_2": "sc", "alpha_3": "srd", "name": "Sardinian"}, {"alpha_3": "srn", "name": "Sranan Tongo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "sr", "alpha_3": "srp", "name": "Serbian"}, {"alpha_3": "srr", "name": "Serer", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "ssa", "name": "Nilo-Saharan languages"}, {"alpha_2": "ss", "alpha_3": "ssw", "name": "Swati"}, {"alpha_3": "suk", "name": "Sukuma", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "su", "alpha_3": "sun", "name": "Sundanese"}, {"alpha_3": "sus", "name": "Susu", "scripts": ["Latn"], "scriptsSecondary": ["Arab"]}, {"alpha_3": "sux", "name": "Sumerian"}, {"alpha_2": "sw", "alpha_3": "swa", "name": "Swahili"}, {"alpha_2": "sv", "alpha_3": "swe", "name": "Swedish"}, {"alpha_3": "syc", "name": "Classical Syriac"}, {"alpha_3": "syr", "name": "Syriac", "scripts": ["Syrc"], "scriptsSecondary": []}, {"alpha_2": "ty", "alpha_3": "tah", "name": "Tahitian"}, {"alpha_3": "tai", "name": "Tai languages"}, {"alpha_2": "ta", "alpha_3": "tam", "name": "Tamil"}, {"alpha_2": "tt", "alpha_3": "tat", "name": "Tatar"}, {"alpha_2": "te", "alpha_3": "tel", "name": "Telugu"}, {"alpha_3": "tem", "name": "Timne", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "ter", "name": "Tereno", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "tet", "name": "Tetum", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "tg", "alpha_3": "tgk", "name": "Tajik"}, {"alpha_2": "tl", "alpha_3": "tgl", "name": "Tagalog"}, {"alpha_2": "th", "alpha_3": "tha", "name": "Thai"}, {"alpha_3": "tig", "name": "Tigre", "scripts": ["Ethi"], "scriptsSecondary": []}, {"alpha_2": "ti", "alpha_3": "tir", "name": "Tigrinya"}, {"alpha_3": "tiv", "name": "Tiv", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "tkl", "name": "Tokelau", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "tlh", "name": "Klingon; tlhIngan-Hol"}, {"alpha_3": "tli", "name": "Tlingit", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "tmh", "name": "Tamashek", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "tog", "name": "Tonga (Nyasa)", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "to", "alpha_3": "ton", "name": "Tonga (Tonga Islands)"}, {"alpha_3": "tpi", "name": "Tok Pisin", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "tsi", "name": "Tsimshian", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "tn", "alpha_3": "tsn", "name": "Tswana"}, {"alpha_2": "ts", "alpha_3": "tso", "name": "Tsonga"}, {"alpha_2": "tk", "alpha_3": "tuk", "name": "Turkmen"}, {"alpha_3": "tum", "name": "Tumbuka", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "tup", "name": "Tupi languages"}, {"alpha_2": "tr", "alpha_3": "tur", "name": "Turkish"}, {"alpha_3": "tut", "name": "Altaic languages"}, {"alpha_3": "tvl", "name": "Tuvalu", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "tw", "alpha_3": "twi", "name": "Twi"}, {"alpha_3": "tyv", "name": "Tuvinian", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_3": "udm", "name": "Udmurt", "scripts": ["Cyrl"], "scriptsSecondary": ["Latn"]}, {"alpha_3": "uga", "name": "Ugaritic", "scripts": ["Ugar"], "scriptsSecondary": []}, {"alpha_2": "ug", "alpha_3": "uig", "name": "Uighur; Uyghur"}, {"alpha_2": "uk", "alpha_3": "ukr", "name": "Ukrainian"}, {"alpha_3": "umb", "name": "Umbundu", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "und", "name": "Undetermined"}, {"alpha_2": "ur", "alpha_3": "urd", "name": "Urdu"}, {"alpha_2": "uz", "alpha_3": "uzb", "name": "Uzbek"}, {"alpha_3": "vai", "name": "Vai", "scripts": ["Latn", "Vaii"], "scriptsSecondary": []}, {"alpha_2": "ve", "alpha_3": "ven", "name": "Venda"}, {"alpha_2": "vi", "alpha_3": "vie", "name": "Vietnamese"}, {"alpha_2": "vo", "alpha_3": "vol", "name": "Volap\u00fck"}, {"alpha_3": "vot", "name": "Votic", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "wak", "name": "Wakashan languages"}, {"alpha_3": "wal", "name": "Walamo", "scripts": ["Ethi"], "scriptsSecondary": []}, {"alpha_3": "war", "name": "Waray", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "was", "name": "Washo", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "wen", "name": "Sorbian languages"}, {"alpha_2": "wa", "alpha_3": "wln", "name": "Walloon"}, {"alpha_2": "wo", "alpha_3": "wol", "name": "Wolof"}, {"alpha_3": "xal", "name": "Kalmyk; Oirat", "scripts": ["Cyrl"], "scriptsSecondary": []}, {"alpha_2": "xh", "alpha_3": "xho", "name": "Xhosa"}, {"alpha_3": "yao", "name": "Yao", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "yap", "name": "Yapese", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_2": "yi", "alpha_3": "yid", "name": "Yiddish"}, {"alpha_2": "yo", "alpha_3": "yor", "name": "Yoruba"}, {"alpha_3": "ypk", "name": "Yupik languages"}, {"alpha_3": "zap", "name": "Zapotec", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "zbl", "name": "Blissymbols; Blissymbolics; Bliss"}, {"alpha_3": "zen", "name": "Zenaga", "scripts": ["Tfng"], "scriptsSecondary": []}, {"alpha_3": "zgh", "name": "Standard Moroccan Tamazight", "scripts": ["Tfng"], "scriptsSecondary": []}, {"alpha_2": "za", "alpha_3": "zha", "name": "Zhuang; Chuang"}, {"alpha_2": "zh", "alpha_3": "zho", "bibliographic": "chi", "name": "Chinese"}, {"alpha_3": "znd", "name": "Zande languages"}, {"alpha_2": "zu", "alpha_3": "zul", "name": "Zulu"}, {"alpha_3": "zun", "name": "Zuni", "scripts": ["Latn"], "scriptsSecondary": []}, {"alpha_3": "zxx", "name": "No linguistic content; Not applicable"}, {"alpha_3": "zza", "name": "Zaza; Dimili; Dimli; Kirdki; Kirmanjki; Zazaki", "scripts": ["Latn"], "scriptsSecondary": []}]

const supported_romanizations = {


	ARABIC: async function(value){

		let x = await fetch('http://localhost:7777/arabic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value})
		}).then(response => response.json() )

		return x


	},



	Korean: function(value){
		return {value:korean.romanize(value)}
	},

	HEBREW: function(value){
		return {value:hebTransliterate(value)}
	},

	Chinese: function(value, response){
			

		child.exec(`ch2py ${value}`, (error, stdout, stderr) => {  
		    response.send({value:stdout})
		});

		return false

	},








	RUSSIAN: async function(value){

		let x = await fetch('http://localhost:7777/cyrillic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value, type: 'ru'})
		}).then(response => response.json() )

		return x


	},


	RUSSIAN: async function(value){

		let x = await fetch('http://localhost:7777/cyrillic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value, type: 'ru'})
		}).then(response => response.json() )

		return x


	},
	SERBIAN: async function(value){

		// Сва људска бића рађају се слободна и једнака у достојанству и правима. Она су обдарена разумом и свешћу и треба једни према другима да поступају у духу братства.


		let x = await fetch('http://localhost:7777/cyrillic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value, type: 'sb'})
		}).then(response => response.json() )

		return x


	},

	MACEDONIAN: async function(value){

		// гласовите коалицијата на вмро дпмне како партија со најмно


		let x = await fetch('http://localhost:7777/cyrillic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value, type: 'mk'})
		}).then(response => response.json() )

		return x


	},
	TAJIK: async function(value){

		// Aз вохуриамон шод ҳастам
		

		let x = await fetch('http://localhost:7777/cyrillic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value, type: 'tj'})
		}).then(response => response.json() )

		return x


	},

	UKRAINIAN: async function(value){

		// Кожна людина має право на освіту. Освіта повинна бути безплатною, хоча б початкова і загальна. Початкова освіта повинна бути обов'язковою. Технічна і професійна освіта повинна бути загальнодоступною, а вища освіта повинна бути однаково доступною для всіх на основі здібностей кожного.
		

		let x = await fetch('http://localhost:7777/cyrillic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value, type: 'ua'})
		}).then(response => response.json() )

		return x


	},

	BULGARIAN: async function(value){

		// Всички хора се раждат свободни и равни по достойнство и права. Tе са надарени с разум и съвест и следва да се отнасят помежду си в дух на братство.

		let x = await fetch('http://localhost:7777/cyrillic', {
			method: 'POST',
			headers: {
				'Accept': 'application/json, text/plain, */*',
				'Content-Type': 'application/json'
			},
		body: JSON.stringify({value:value, type: 'bg'})
		}).then(response => response.json() )

		return x


	},



}

var app = express();

app.use(express.json({limit: '15mb'}));

app.use(cors({origin:true}))

app.options('*', cors())


app.get('/', async function(request, response){


  response.send(":)")

});

app.get('/romanize', async function(request, response){
		response.send(Object.keys(supported_romanizations))
});


app.post('/romanize', async function(request, response){

		if (request.body.type){

			if (supported_romanizations[request.body.type]){
				let r = await supported_romanizations[request.body.type](request.body.value,response)
				
				// we may handel sending the response above for the chinese
				if (r!==false){
					response.send(r)	
				}
				
			}else{
				response.send(null)
			}
		}else{
			response.send(null)
		}

		

});



app.post('/lang', async function(request, response){

	
	
	let result
	try{
		result = await cld.detect(request.body.value);
		result = result.languages
	}catch{
		result = []
	}
	
	

	response.send(result)

});





console.log('listending on 7778')
app.listen(7778);