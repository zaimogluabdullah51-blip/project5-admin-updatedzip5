import test from "node:test";
import assert from "node:assert/strict";
import { loadLegalParser } from "./load-legal-parser.mjs";
const parser = loadLegalParser();
const refs = text => [...parser.extractLegalReferences(text)]
  .map(r => `${r.law_no}/${r.article}${r.paragraph ? `/${r.paragraph}` : ""}${r.subparagraph ? `${r.paragraph ? "-" : "/"}${r.subparagraph}` : ""}`)
  .sort();

test("multiple laws are retained without cross-law article leakage", () => {
  assert.deepEqual(refs("TCK.nun 59. ve CMUK.nun 321. maddeleri"), ["1412/321", "5237/59"]);
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
  assert.deepEqual(refs("Ayrıntı için bkz. kaynaklar"), []);
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
  assert.deepEqual(refs("Medeni Kanunun 2. kitabı"), []);
  assert.deepEqual(refs("SSK sigortasına bağlı olarak çalıştığını"), []);
});
