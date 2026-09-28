import test from "node:test";
import assert from "node:assert/strict";
import { loadLegalParser } from "./load-legal-parser.mjs";
const parser = loadLegalParser();
const refs = text => [...parser.extractLegalReferences(text)]
  .map(r => `${r.law_no}/${r.article}${r.paragraph ? `/${r.paragraph}` : ""}${r.subparagraph ? `${r.paragraph ? "-" : "/"}${r.subparagraph}` : ""}`)
  .sort();

test("multiple laws are retained without cross-law article leakage", () => {
  assert.deepEqual(refs("TCK.nun 59. ve CMUK.nun 321. maddeleri"), ["1412/321", "5237/59"]);
  assert.deepEqual(
    refs("TMK.md.175) Hukuk Usulü Muhakemeleri Kanununun 440-442. maddeleri"),
    ["1086/440", "1086/441", "1086/442", "4721/175"]
  );
});
test("multiple articles within each law remain tagged", () => {
  assert.deepEqual(refs("TCK 86, 87 ve 88. maddeleri ile CMUK 321 ve 322. maddeleri"), ["1412/321", "1412/322", "5237/86", "5237/87", "5237/88"]);
});
test("amendment modifiers preserve the principal law for the whole list", () => {
  assert.deepEqual(refs("5252 sayılı yasanın 5349 sayılı yasa ile değişik 7/1 ve 4. maddeleri"), ["5252/4", "5252/7/1"]);
  assert.deepEqual(refs("6831 sayılı Yasanın 1744 sayılı Yasa ile değişik 8. maddesi"), ["6831/8"]);
});
test("numbered law title supports md abbreviation", () => {
  assert.deepEqual(refs("4722 sayılı Yürürlük Kanunu md. 17"), ["4722/17"]);
});
test("civil context resolves TMK while explicit law numbers take priority", () => {
  assert.ok(refs("TMK. 4 BK. 42,43,44,49 dikkate alınarak").includes("4721/4"));
  assert.deepEqual(refs("3713 sayılı TMK 4. maddesi aile"), ["3713/4"]);
});
test("explicit old TCK binds bare mentions without introducing new-law tags", () => {
  assert.deepEqual(refs("765 sayılı TCK 59. maddesi.\n\nTCK 312/2-son ve 59. maddeleri"), ["765/312/2-SON", "765/59"]);
});

test("bare TCK before the 5237 effective date resolves to the former penal code", () => {
  assert.deepEqual(refs("2. Ceza Dairesi 2001/28728 E., 2003/7857 K.\nTCK.nun 201.maddesi"), ["765/201"]);
  assert.deepEqual(refs("TCK.nun 201.maddesi"), ["5237/201"]);
  assert.deepEqual(refs("5237 sayılı TCK 86. maddesi"), ["5237/86"]);
  const audit = parser.buildAuditedLegalReferencesForRow({
    text: "2. Ceza Dairesi 2001/28728 E., 2003/7857 K.\nTCK.nun 201.maddesi",
    mevzuat_atif: ["5237/201"]
  });
  assert.ok(audit.citations.some(c => c.canonical === "5237:TCK:201" && c.conflict_flags.includes("possible_modern_tck_for_pre_2005_decision")));
});
test("evidence positions survive whitespace and canonical merging", () => {
  const text = "Başlık\n\n\n\n   TCK 86. maddesi\n\nTCK 86. maddesi";
  const result = parser.mergeLegalReferenceCandidates(parser.extractLegalReferences(text));
  assert.equal(result.length, 1);
  assert.ok(result[0].evidence.length >= 2);
  for (const e of result[0].evidence) assert.equal(text.slice(e.start, e.end), e.raw);
});
test("parent-child comparison is compatible detail, not a different law", () => {
  const r = parser.buildAuditedLegalReferencesForRow({ text: "3402 sayılı Kanunun 12/3. maddesi", mevzuat_atif: ["3402/12"] });
  assert.equal(r.citations[0].comparison_relation, "compatible_detail");
});
test("dotted abbreviations retain separate law bindings", () => {
  assert.deepEqual(refs("H.U.M.K.nun 429. maddesi ve İ.İ.K.'nun 68/1 maddesi"), ["1086/429", "2004/68/1"]);
  assert.deepEqual(refs("İİK 169/a ve 269/a maddeleri"), ["2004/169/A", "2004/269/A"]);
});
test("parenthesized law-number headings support historical and unknown registry laws", () => {
  assert.deepEqual(refs("BORÇLAR KANUNU (818) Madde 53"), ["818/53"]);
  assert.deepEqual(refs("İŞ KANUNU ( 14. maddesi yürürlükte ) (1475) Madde 13"), ["1475/13"]);
});
test("inflected article word does not match material damages", () => {
  assert.deepEqual(refs("2942 Sayılı Yasanın 16. maddeye göre tescil"), ["2942/16"]);
  assert.deepEqual(refs("466 sayılı Kanun gereğince 50.000 maddi tazminat"), []);
  for (const suffix of ["maddesinde", "maddesinin", "maddesinden", "maddelerinin", "maddeye"]) {
    assert.deepEqual(refs(`3402 sayılı Kanunun 12/3. ${suffix} düzenlenen`), ["3402/12/3"]);
  }
});
test("named law amendments do not inherit regulation articles", () => {
  assert.deepEqual(refs("Tebligat Yasasının 4829 sayılı yasa ile değişik 28.maddesi"), ["7201/28"]);
  assert.deepEqual(refs("Tebligat Kanununun 21. maddesi ve Tüzüğün 28. maddesi"), ["7201/21"]);
});
test("case-number year does not become enforcement law", () => {
  assert.deepEqual(refs("12. Hukuk Dairesi 2004/68 E., 2005/12 K."), []);
});

test("summary headings support high article numbers and OCR law numbers", () => {
  assert.deepEqual(refs("6762 S. TÜRK TİCARET KANUNU [ Madde 1269 ]"), ["6762/1269"]);
  assert.deepEqual(refs("4721 S. TÜRK MEDENİ KANUNU [ Madde 1027 ]"), ["4721/1027"]);
  assert.deepEqual(refs("l744 Sayılı Yasa ile değişik 683l Sayılı Yasanın 2.madde uygulaması"), ["6831/2"]);
});

test("later amendment references do not hide a principal law article", () => {
  assert.deepEqual(
    refs("4077 sayılı Tüketicinin Korunması hakkındaki kanunun 3. maddesinde 14.3.2003 tarihinde yürürlüğe giren 4822 sayılı kanunla değişiklik yapılmış"),
    ["4077/3"]
  );
  assert.deepEqual(
    refs("1086 sayılı Kanunun 5236 sayılı Kanunla yapılan değişiklikten önceki 427 ila 454. madde hükümleri"),
    ["1086/427", "1086/454"]
  );
  assert.deepEqual(
    refs("mülga 1086 sayılı Kanun 26.09.2004 tarih ve 5236 sayılı Kanunla yapılan değişiklikten önceki 433. madde hükmü"),
    ["1086/433"]
  );
});

test("code-first amendment modifiers bind the changed article, not the modifier law number", () => {
  assert.deepEqual(refs("H.U.M.K.nun 2494 sayılı Yasa ile değişik 438/II.fıkrası hükmü"), ["1086/438/2"]);
  assert.deepEqual(refs("HUMK.nun 2494 sayılı Yasa ile değişik 438/II. Fıkrası"), ["1086/438/2"]);
  assert.deepEqual(
    [...parser.extractLegalReferences("H.U.M.K.nun 2494 sayılı Yasa ile değişik 438/II.fıkrası hükmü").map(r => r.canonical)],
    ["1086:HUMK:438:2"]
  );
});

test("legacy civil abbreviations and OCR article digits are parsed conservatively", () => {
  assert.deepEqual(refs("BK.nun 66. maddesi hükmü olmayıp, BK.nun 125. maddesi hükmüdür"), ["818/125", "818/66"]);
  assert.deepEqual(refs("M.K.nun 634, B.K.nun 213 maddeleri"), ["743/634", "818/213"]);
  assert.deepEqual(refs("TCK.nun 5l.maddesi ve TCK.nun l9l/l.maddesi"), ["5237/191/1", "5237/51"]);
  assert.deepEqual(refs("TCK'nun 87/4.2.cümlesi uyarınca, aynı kanunun 6l.maddesine göre"), ["5237/61", "5237/87/4-2"]);
  assert.deepEqual(refs("HMK 353/1-b.2 maddesi uyarınca"), ["6100/353/1-B-2"]);
  assert.deepEqual(refs("765 sayılı TCK’nın 491/ilk.maddesi"), ["765/491/1"]);
  assert.deepEqual(refs("HUMK 195. maddesi. 1-Dava trafik kazasından doğmuştur"), ["1086/195"]);
  assert.deepEqual(refs("Ayrıntı için bkz. kaynaklar"), []);
});

test("compact paragraph and subparagraph chains retain their legal structure", () => {
  assert.deepEqual(refs("HMK'nın 353/b-1 maddesi"), ["6100/353/B-1"]);
  assert.deepEqual(
    refs("CMK'nın 2/j-1, CMK'nın 2/j-2 ve CMK'nın 2/j-3 maddeleri"),
    ["5271/2/J-1", "5271/2/J-2", "5271/2/J-3"]
  );
  assert.deepEqual(
    refs("5237 sayılı TCY'nın 53/1-a-b-c-d-e maddesi"),
    ["5237/53/1-A-B-C-D-E"]
  );
  assert.deepEqual(
    refs("TCK'nın 109/2-3-a-e maddesi"),
    ["5237/109/2", "5237/109/3-A-E"]
  );
  assert.deepEqual(
    refs("5237 sayılı TCK'nın 86/1-3-e, 87/1-a-son maddeleri"),
    ["5237/86/1", "5237/86/3-E", "5237/87/1-A"]
  );
  assert.deepEqual(refs("HUMK'nun m. 427/VI-VIII"), ["1086/427"]);
});

test("non-statute article notation stays outside the statute index", () => {
  assert.deepEqual(refs("224 sayılı hisse senetleri piyasası genelgesinin 2.3. maddesi"), []);
  assert.deepEqual(refs("Avrupa İnsan Hakları Sözleşmesi’nin 6/3-c maddesi"), []);
  assert.deepEqual(
    refs("6136 sayılı Kanuna muhalefet suçundan 5271 sayılı CMK'nın 5728 sayılı Kanun ile değişik 231/5. maddesi"),
    ["5271/231/5"]
  );
});

test("long ordinal article lists stay bound to their explicit law", () => {
  assert.deepEqual(
    refs("5271 sayılı Kanunu’nun 286 ncı maddesi, 260 ıncı maddesi, 291 ... maddesi, 294 üncü maddesi, 298 ... maddesi ve 307 nci maddesi"),
    ["5271/260", "5271/286", "5271/291", "5271/294", "5271/298", "5271/307"]
  );
  assert.deepEqual(
    refs("5271 sayılı CYY’nın Kararların açıklanması ve tebliği başlıklı 35. maddesinin 2. fıkrasında"),
    ["5271/35"]
  );
  assert.deepEqual(
    refs("2709 sayılı ... Cumhuriyeti Anayasası’nın (Anayasa) Toplu ... sözleşmesi hakkı başlıklı 53 üncü maddesi"),
    ["2709/53"]
  );
});

test("full law aliases allow Turkish buffer suffixes", () => {
  assert.deepEqual(refs("Hukuk Usulü Muhakemeleri Kanunun 48/2. maddesi uyarınca"), ["1086/48/2"]);
});

test("same-law anaphora uses the nearest numbered law conservatively", () => {
  assert.deepEqual(
    refs("4722 Sayılı Türk Medeni Kanununun Yürürlüğü ve Uygulama Şekli Hakkında Kanunun 2. maddesi. Aynı kanunun 9. maddesinde düzenlenmiştir."),
    ["4722/2", "4722/9"]
  );
  assert.deepEqual(
    refs("2886 sayılı Devlet İhale Kanununun 1. maddesi uyarınca ihale yapıldı. Borçlar Kanununun 225 m/2. fıkrası uyarınca satım kurulur ve mülkiyet aynı Kanunun 231. maddesi gereğince geçer."),
    ["2886/1", "818/225/2", "818/231"]
  );
});

test("shared article wording binds the ordinal before a secondary legal source", () => {
  assert.deepEqual(
    refs("2797 sayılı Yargıtay Kanunu’nun 40 ıncı ve Yargıtay İç Yönetmeliği’nin 18 inci maddeleri uyarınca"),
    ["2797/40"]
  );
});

test("standard statute abbreviations and named statutes resolve without ad hoc decision rules", () => {
  assert.deepEqual(refs("2918 sayılı KTK.'nun 109. maddesine göre"), ["2918/109"]);
  assert.deepEqual(refs("Sigortacılık Kanunu 30/17 maddesi uyarınca"), ["5684/30/17"]);
  assert.deepEqual(refs("Çocuk Koruma Kanunu'nun 23/1. maddesi uyarınca"), ["5395/23/1"]);
  assert.deepEqual(
    refs("3402 Sayılı Yasanın 22/1. maddeleri gereğince ikinci kadastro yolsuz (T.M.Y.nın 1025. md.)"),
    ["3402/22/1", "4721/1025"]
  );
  assert.deepEqual(refs("Sigortacılıkta Tahkime İlişkin Yönetmelik'in 16/13 maddesi"), []);
});

test("parenthetical former-law equivalents retain both statutes", () => {
  assert.deepEqual(
    refs("Türk Borçlar Kanunu’nun 61. (Borçlar Kanunu’nun 50. md.) maddesinde düzenlenmiştir"),
    ["6098/61", "818/50"]
  );
});

test("masked law qualifiers and ordinal paragraphs are parsed structurally", () => {
  assert.deepEqual(
    refs("5320 ... Ceza Muhakemesi Kanununun Yürürlük ve Uygulama Şekli Hakkında Kanun’un 8 inci maddesinin 1 inci fıkrasına 5560 ... Kanun'un 29 uncu maddesi ile eklenmiştir"),
    ["5320/8", "5320/8/1", "5560/29"]
  );
  assert.deepEqual(
    refs("6098 sayılı Türk Borçlar Kanunu'nun 30 ila 37 nci maddeleri"),
    ["6098/30", "6098/31", "6098/32", "6098/33", "6098/34", "6098/35", "6098/36", "6098/37"]
  );
  assert.deepEqual(
    refs("CMUK'nın 322. maddesi uygulanır. (Ek cümle: 1/7/2016-6723/33 md.)"),
    ["1412/322"]
  );
});

test("amended ordinary and temporary articles remain legally distinct", () => {
  assert.deepEqual(
    refs("6136 sayılı Yasaya aykırılık suçundan sonra 2797 sayılı Yargıtay Kanunu'nun 6545 sayılı Kanun'la değişik 14. ve eklenen geçici 13. maddeleri uyarınca"),
    ["2797/14", "2797/GEÇİCİ-13"]
  );
  assert.equal(
    parser.canonicalLegalRef(parser.normalizeLegalRef({ law_no: "2797", article: "geçici madde 13" })),
    "2797:2797:GEÇİCİ-13"
  );
  assert.deepEqual(refs("6352 sayılı Kanunun geçici 2/2 maddesi uyarınca"), ["6352/GEÇİCİ-2/2"]);
  assert.deepEqual(refs("5271 sayılı Kanunun geçici 5/d maddesi uyarınca"), ["5271/GEÇİCİ-5/D"]);
  assert.deepEqual(refs("7188 sayılı Kanunun geçici 5/1-d maddesi uyarınca"), ["7188/GEÇİCİ-5/1-D"]);
  assert.deepEqual(
    refs("696 sayılı Kanun Hükmünde Kararname ile 375 sayılı Kanun Hükmünde Kararname'ye eklenen geçici 23 ve 24. maddeleri"),
    ["375/GEÇİCİ-23", "375/GEÇİCİ-24"]
  );
  assert.deepEqual(
    refs("4857 sayılı Kanunun 22 ve 32 nci maddeleri, 696 sayılı KHK ile 375 sayılı KHK'ya eklenen geçici 23 ve 24 üncü maddeler"),
    ["375/GEÇİCİ-23", "375/GEÇİCİ-24", "4857/22", "4857/32"]
  );
  assert.deepEqual(
    refs("2797 sayılı Yargıtay Kanunu'na 6752 sayılı Kanun'un 27. maddesi ile eklenen geçici 14. madde"),
    ["2797/GEÇİCİ-14", "6752/27"]
  );
  assert.deepEqual(
    refs("5311 sayılı Kanun ile İcra İflas Kanunu'na eklenen geçici 7.madde"),
    ["2004/GEÇİCİ-7"]
  );
  assert.deepEqual(
    refs("6352 sayılı “Yargı Hizmetlerinin Etkinleştirilmesi Amacıyla Bazı Kanunlarda Değişiklik Yapılması ve Basın Yoluyla İşlenen Suçlara İlişkin Dava ve Cezaların Ertelenmesi Hakkındaki” Kanun'un geçici 2. maddesinin 1. ve 2. fıkrası"),
    ["6352/GEÇİCİ-2"]
  );
  assert.deepEqual(
    refs("Davanın yasal dayanağı 506 sayılı Yasanın 3395 sayılı Yasa ile değişik Ek.5.maddesinin III.bendidir."),
    ["506/EK-5/3"]
  );
  assert.equal(
    parser.canonicalLegalRef(parser.normalizeLegalRef({ law_no: "506", article: "EK-5", paragraph: "III" })),
    "506:506:EK-5:3"
  );
});

test("common unnumbered law names in zero-citation rows are resolved", () => {
  assert.deepEqual(refs("Vakıflar Kanununun 8.maddesi anlamında değildir"), ["2762/8"]);
  assert.deepEqual(refs("Kamulaştırma Kanununun 15.maddesinin 12.bendinde düzenlenmiştir"), ["2942/15"]);
  assert.deepEqual(refs("TTK.nun 25.maddesinde ve aynı yasanın 20/3.maddesinde belirtilmiştir"), ["6762/20/3", "6762/25"]);
  assert.deepEqual(refs("Sosyal Sigortalar Kanunu'nun 4. maddesi ve kanunun 87. maddesi"), ["506/4", "506/87"]);
  assert.deepEqual(refs("2797 sayılı Yargıtay K.nun 14.maddesi gereğince"), ["2797/14"]);
  assert.deepEqual(refs("H.Y.U.Y.'nın 433/3. maddesi ve H.Y.U.Y.nın 438/7. maddesi"), ["1086/433/3", "1086/438/7"]);
  assert.deepEqual(refs("H.Y.U.Y.’nın da 433/3. maddesi"), ["1086/433/3"]);
  assert.deepEqual(refs("Harçlar Kanunun 13/J maddesi gereğince harç alınmamasına"), ["492/13/J"]);
  assert.deepEqual(refs("Avukatlık Yasasının değişik (164/son) maddesi hükmü"), ["1136/164/SON"]);
  assert.deepEqual(refs("İmar Yasasının 18. maddesi uyarınca"), ["3194/18"]);
  assert.deepEqual(refs("3194 sayılı İmar Kanununun 18/son ve Yönetmeliğin 14. maddeleri"), ["3194/18/SON"]);
  assert.deepEqual(refs("3402 sayılı Kadastro Yasasının 25 ve takip eden maddeleri"), ["3402/25"]);
  assert.deepEqual(refs("Kat Mülkiyeti Yasasının 33.maddesi gereğince"), ["634/33"]);
  assert.deepEqual(refs("Hukuk Genel Kurulu 2001/7-1665 E., 2001/1701 K. Dava açıldığı tarihte yürürlükte olan Medeni Kanunun 668. maddesi uyarınca"), ["743/668"]);
  assert.deepEqual(refs("Türk Medeni Kanunun 747.maddesine göre açılmıştır. 01.02.2006 gününde karar verildi."), ["4721/747"]);
  assert.deepEqual(refs("Tebligat Yasasının 43. ve Yönetmeliğin 65. maddesinde"), ["7201/43"]);
  assert.deepEqual(refs("Karayolları Trafik Kanununun 98/1 nci maddesinde"), ["2918/98/1"]);
  assert.deepEqual(refs("Mera Kanunu m.3-4"), ["4342/3", "4342/4"]);
  assert.deepEqual(refs("Borçlar Kanununun 213, Türk Medeni Kanununun 706 ve Noterlik Kanununun 89.maddeleri"), ["1512/89", "4721/706", "818/213"]);
  assert.deepEqual(refs("Hukuk Usulü Muhakemeleri Yasasının 38l/2 maddesi"), ["1086/381/2"]);
  assert.deepEqual(refs("1086 sayılı Hukuk Usulü Muhakemeleri Kanununun 440./I maddesinde"), ["1086/440/1"]);
  assert.deepEqual(refs("Türk Medeni Kanununun 166/ son madde koşulları"), ["4721/166/SON"]);
  assert.deepEqual(refs("Dava Türk Medeni Kanunun 747ye dayanarak açılmıştır"), ["4721/747"]);
  assert.deepEqual(refs("Dava Medeni Kanunun 1027. maddesi gereğince tapuda isim düzeltilmesi"), ["4721/1027"]);
  assert.deepEqual(refs("Temyiz ilamında belirtilen gerektirici nedenler karşısında usulün 440. Maddesinde sayılan nedenlerden hiçbirisine uygun olmayan karar düzeltme isteğinin REDDİNE ve aynı kanunun 442 maddesi hükmünce para cezası"), ["1086/440", "1086/442"]);
  assert.deepEqual(refs("H.U.M.K.2494 sayılı Yasa ile değişik 438/II.fıkrası hükmü"), ["1086/438/2"]);
  assert.deepEqual(refs("Tüketicinin Korunması Hakkındaki Kanunda 4822 sayılı Kanun ile değişiklik yapılmış ve taşınmaz mallara ilişkin uyuşmazlıklarda Yasanın 23. madde kapsamına alınmış ise de"), ["4077/23"]);
  assert.deepEqual(refs("4077 Sayılı Tüketicinin Korunması Hakkındaki Kanunun uygulama için taraflardan birisinin tüketici olması gerekir"), []);
  assert.deepEqual(refs("HMUK.nun 409/5. maddesi ve HUMUK.nun 429.maddesi"), ["1086/409/5", "1086/429"]);
  assert.deepEqual(refs("HMUK.569/2. maddesi gereğince"), ["1086/569/2"]);
  assert.deepEqual(refs("2675 sayılı MÖHUK m.37 ve MÖHUK.m.38"), ["2675/37", "2675/38"]);
  assert.deepEqual(refs("Anayasanın 129/5.maddesi gereğince"), ["2709/129/5"]);
  assert.deepEqual(refs("Anayasa’nın 4709 Sayılı Yasa ile değişik 46.maddesinin son fıkrası"), ["2709/46"]);
  assert.deepEqual(refs("Anayasa Mahkemesinin 20.7.1999 tarih 1999/1 esas, 1999/33 karar sayılı kararı"), []);
  assert.deepEqual(refs("09.04.1990 tarih ve 418 sayılı KHK nin 43 ve 5.7.1991 tarih ve 433 sayılı KHK nin 2. maddesi hükmüne"), ["418/43", "433/2"]);
  assert.deepEqual(refs("Karar düzeltme isteğinin REDDİNE ve aynı kanunun 442 maddesi hükmünce para cezasına"), ["1086/442"]);
  assert.deepEqual(refs("Yörede orman kadastrosu kesinleşmiş olup 1744 Sayılı Yasa ile değişik 2. madde uygulaması yapılmıştır"), ["6831/2"]);
  assert.deepEqual(refs("1744 Sayılı Yasa ile değişik 2. madde uygulaması tartışılmıştır"), []);
  assert.deepEqual(refs("İK.nun 4949 Sayılı Kanunla değiştirilen 363/1.maddesinin son cümlesi"), ["2004/363/1"]);
  assert.deepEqual(refs("İİY'nın 337/1. maddesi uyarınca verilen ceza"), ["2004/337/1"]);
  assert.deepEqual(refs("4077 Sayılı Kanunun değişik 3. maddesinde tüketici tanımlanmıştır"), ["4077/3"]);
  assert.deepEqual(refs("2797 sayılı Yasa'nın değişik 14. Maddesi gereğince görev belirlenmiştir"), ["2797/14"]);
  assert.deepEqual(refs("556 sayılı KHK.'nin, 22.06.2004 tarih ve 5194 sayılı Yasa ile değiştirilen 71. maddesi hükmüne göre"), ["556/71"]);
  assert.deepEqual(refs("İş Kanununun 73.maddesinin açık buyruğudur"), ["1475/73"]);
  assert.deepEqual(refs("İş Kanununun 77.maddesi ve Tüzük hükümleri gözönünde tutularak"), ["4857/77"]);
  assert.deepEqual(refs("İcra İflas Kanununun 194.maddesince sağlanan yetkiye dayanılmıştır"), ["2004/194"]);
  assert.deepEqual(refs("İcra İflas Kanununun 164/I ve 364/III ncü maddelerinde öngörülen süre"), ["2004/164/1", "2004/364/3"]);
  assert.deepEqual(refs("HUMY.'nın 5219 Sayılı Yasa ile değişik 427.maddesinin ikinci fıkrası"), ["1086/427"]);
  assert.deepEqual(refs("HUMY'nun 440. maddesinin kapsamına girmez"), ["1086/440"]);
  assert.deepEqual(refs("2004 sayılı İcra ve İflas Kanunu'nun 30.07.2003 tarihli Resmi Gazete'de yayımlanan 4949 sayılı Yasa ile değişik 303. maddesi"), ["2004/303"]);
  assert.deepEqual(refs("HUMK.m.253-274"), ["1086/253", "1086/274"]);
  assert.deepEqual(refs("HUMK.253-274"), ["1086/253", "1086/274"]);
  assert.deepEqual(refs("Hukuk Usulü Muhakemeleri Kanununun 23.6.1996 gün 4146 sayılı kanun ile değişik 440/III-1 maddesi"), ["1086/440/3-1"]);
  assert.deepEqual(refs("6831 Sayılı Yasının 2. madde uygulaması"), ["6831/2"]);
  assert.deepEqual(refs("4822 sayılı kanun ile değişik 4077 sayılı TKHK'nun 3.maddesinde"), ["4077/3"]);
  assert.deepEqual(refs("2547 Sayılı Yasanın 56/b ve 492 sayılı yasının 13/1 maddesi hükmünce"), ["2547/56/B", "492/13/1"]);
  assert.deepEqual(refs("6183 sayılı Amme Alacaklarının Tahsil Usulü Hakkında Kanun’un 21’nci maddesinin 1’nci fıkrasına göre"), ["6183/21", "6183/21/1"]);
  assert.deepEqual(refs("HUMK.md.433-1 hükmü ve HUMKmd.438/7 gereğince"), ["1086/433/1", "1086/438/7"]);
  assert.deepEqual(refs("Hazine ihbar üzerine (TMKmd.301) müdahale isteğinde bulunmuştur"), ["4721/301"]);
  assert.deepEqual(refs("boşanmaya (TMKmd.166/1) karar verilecek yerde"), ["4721/166/1"]);
  assert.deepEqual(refs("temyiz inceleme görevi Yargıtay Yasası’nın 14. maddesi uyarınca 5. Hukuk Dairesine aittir"), ["2797/14"]);
  assert.deepEqual(refs("Hukuk Usulü Muhakemeleri Kanununun 23.6.1996 tarihinde yürürlüğe giren 4146 sayılı yasa ile değişik 440/III maddesi"), ["1086/440/3"]);
  assert.deepEqual(refs("5271 sayılı CYY.nın 231. maddesi ve 1412 sayılı CYUY.nın 317. maddesi uyarınca"), ["1412/317", "5271/231"]);
  assert.deepEqual(refs("İş Mahkemeleri Kanununun 8.maddesi gereğince görev belirlenir"), ["5521/8"]);
  assert.deepEqual(refs("Borçlar Yasasının 101. ve izleyen maddeleri uyarınca faiz istenebilir"), ["818/101"]);
  assert.deepEqual(refs("5133 S.K.md.2-3 hükümleri"), ["5133/2", "5133/3"]);
  assert.deepEqual(refs("20.7.2004 gün ve 5219 sayılı Yasa ile HUMK.da yapılan değişiklik sonucu anılan Yasanın 427 nci maddesinde öngörülen kesinlik sınırı"), ["1086/427"]);
  assert.deepEqual(refs("HUMK. mad.74 uyarınca talep aşılamaz. HUMK. mad.438/7 gereğince düzeltilerek onanır."), ["1086/438/7", "1086/74"]);
  assert.deepEqual(refs("temyiz süresi geçirilmişse usulün 2494 sayılı yasa ile değişik 432. maddesinin 4 ve 5.bendi gereğince işlem yapılması"), ["1086/432"]);
  assert.deepEqual(refs("Hukuk Usulü Muhakemelerin Kanunu'nun değişik 432. maddesi uyarınca dosyanın iadesine"), ["1086/432"]);
  assert.deepEqual(refs("2797 sayılı Yargıtay Kananu'nun 14.maddesi uyarınca görev belirlenir"), ["2797/14"]);
  assert.deepEqual(refs("4721 sayılı Türk Medenî Kanunu m. 291 hükmüne göre soybağının reddi davası açılabilir"), ["4721/291"]);
  assert.deepEqual(refs("Türk Medenî Kanununun 291. maddesi uyarınca"), ["4721/291"]);
  assert.deepEqual(refs("2859 sayılı Kadastro ve Tapulama Paftalarının Yenilenmesi Hakkındaki Kanun’un uygulanmasından doğmaktadır. Anılan Kanun’un 4. maddesinin 2. bendinde düzenlenmiştir."), ["2859/4"]);
  assert.deepEqual(refs("6183 sayılı Amme Alacaklarının Tahsili Usulü Hakkında Kanunun 21/II hükmü uyarınca rehinli alacakların hakları mahfuzdur"), ["6183/21/2"]);
  assert.deepEqual(refs("5464 Sayılı Kanunun 24/5 hükmü uyarınca kredi borcu adi kefalet hükmündedir"), ["5464/24/5"]);
  assert.deepEqual(refs("Davacı 5458 sayılı Kanunun 1/a uyarınca hesaplama yapılmasını istemiştir"), ["5458/1/A"]);
  assert.deepEqual(refs("Sözleşmenin 24/5 hükmü uyarınca işlem yapılmıştır"), []);
  assert.deepEqual(refs("4722 s.Yürürlük K.m.10/4 gereğince mal rejimi dönüşmüştür"), ["4722/10/4"]);
  assert.deepEqual(refs("Medeni Kanunun 2. kitabı"), []);
  assert.deepEqual(refs("Medenî Kanunun 2. kitabı"), []);
  assert.deepEqual(refs("SSK sigortasına bağlı olarak çalıştığını"), []);
});
