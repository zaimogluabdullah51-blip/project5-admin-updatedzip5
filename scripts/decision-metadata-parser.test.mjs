import test from "node:test";
import assert from "node:assert/strict";
import { parseDecisionMetadata, isoDate } from "./decision-metadata-parser.mjs";

test("recognizes chamber presidents boards only in decision headings", () => {
  assert.equal(parseDecisionMetadata('Hukuk Daireleri Başkanlar Kurulu 2010/1 E., 2010/2 K.\n').court.value, 'hukuk daireleri baskanlar kurulu');
  assert.equal(parseDecisionMetadata('Dosya Hukuk Daireleri Başkanlar Kurulu tarafından incelendi.').court.value, null);
});
test("date suffixes may touch the year without accepting extra digits", () => {
  assert.equal(parseDecisionMetadata('ONANMASINA, 19.02.2007gününde oybirliğiyle karar verildi.').decision_date.value, '2007-02-19');
  assert.equal(parseDecisionMetadata('ONANMASINA, 19.02.20070 gününde oybirliğiyle karar verildi.').decision_date.value, null);
});

test("effective transfer dates and numbered cited rulings are not disposition dates", () => {
  for (const qualifier of ["tarihi itibariyle", "tarihi itibarıyla", "tarihinden itibaren", "tarih ve 245 sayılı"]) {
    const result = parseDecisionMetadata(`01/07/2021 ${qualifier} iş bölümü kararı gereğince dosyanın DEVRİNE karar verildi.`);
    assert.equal(result.decision_date.value, null, qualifier);
  }
  assert.equal(parseDecisionMetadata("01/07/2021 tarihi itibariyle dosyanın DEVRİNE, 25/06/2021 tarihinde karar verildi.").decision_date.value, "2021-06-25");
});

test("selects heading court and final date, not quoted lower court", () => {
  const text = 'Hukuk Genel Kurulu 1997/8-685 E., 1997/900 K.\n"İçtihat Metni"\nAnkara Asliye Hukuk Mahkemesi 11.10.1995 tarihli karar. Yargıtay 8. Hukuk Dairesi 27.6.1996 gün ve 1187 sayılı karar.\nSONUÇ: ONANMASINA, 11.5.1997 gününde oyçokluğu ile karar verildi.';
  const r = parseDecisionMetadata(text);
  assert.equal(r.court.value, "hukuk genel kurulu");
  assert.equal(r.decision_date.value, "1997-05-11");
});
test("does not guess from dates or a court quoted in narrative", () => {
  const r = parseDecisionMetadata("Dava 12.3.2010 tarihinde açıldı. Yargıtay 9. Hukuk Dairesi kararına atıf yapıldı.");
  assert.equal(r.court.value, null);
  assert.equal(r.decision_date.value, null);
});
test("validates dates and leap years", () => {
  assert.equal(isoDate(29, 2, 2000), "2000-02-29");
  assert.equal(isoDate(29, 2, 1900), null);
  assert.equal(isoDate(31, 4, 2020), null);
});
test("conflicting explicit and closing dates require review", () => {
  const r = parseDecisionMetadata('Karar Tarihi: 12.3.2010\n"İçtihat Metni"\nSONUÇ: ONANMASINA, 13.3.2010 tarihinde oybirliğiyle karar verildi.');
  assert.equal(r.decision_date.value, null);
  assert.deepEqual(r.decision_date.flags, ["conflicting_candidates"]);
});
test("handles named months and uppercase Turkish", () => {
  const r = parseDecisionMetadata("9. HUKUK DAİRESİ 2010/1 E.\nSONUÇ: ONANMASINA, 3 Şubat 2010 tarihinde oybirliğiyle karar verildi.");
  assert.equal(r.court.value, "9 hukuk dairesi");
  assert.equal(r.decision_date.value, "2010-02-03");
});
test("recognizes closed chambers and dates after disposition", () => {
  const r = parseDecisionMetadata("(Kapatılan)15. Hukuk Dairesi 2006/1 E.\nSONUÇ: BOZULMASINA oybirliğiyle karar verildi. 22.9.2006");
  assert.equal(r.court.value, "15 hukuk dairesi");
  assert.equal(r.decision_date.value, "2006-09-22");
});
test("topic heading does not compete with issuing court", () => {
  const r = parseDecisionMetadata("Hukuk Genel Kurulu 2001/1 E.\nANAYASA MAHKEMESİ KARARLARI\nİçtihat Metni");
  assert.equal(r.court.value, "hukuk genel kurulu");
});
test("keeps raw date but flags a conflict with the decision year", () => {
  const r = parseDecisionMetadata("Hukuk Genel Kurulu 2005/12-35 E., 2005/13 K.\nSONUÇ: ONANMASINA, 2.2.2000 gününde oybirliği ile karar verildi.");
  assert.equal(r.decision_date.value, "2000-02-02");
  assert.equal(r.decision_date.confidence, "low");
  assert.ok(r.decision_date.flags.includes("decision_year_conflict"));
});
test("retains both dates for separate deliberations", () => {
  const r = parseDecisionMetadata("Ceza Genel Kurulu 2005/47 E., 2005/104 K.\nSONUÇ: İlk müzakerede yasal çoğunluk sağlanamadığından, (1) nolu neden yönünden 19.07.2005 günü yapılan ikinci, (2) nolu neden yönünden ise 20.09.2005 tarihinde yapılan üçüncü müzakerelerde tebliğnamedeki düşünceye kısmen aykırı olarak oyçokluğuyla karar verildi.");
  assert.equal(r.decision_date.value, null);
  assert.ok(r.decision_date.flags.includes("multiple_deliberation_dates"));
  assert.deepEqual(new Set(r.decision_date.candidates.map(c => c.value)), new Set(["2005-07-19", "2005-09-20"]));
});
test("does not promote a cited date next to the disposition", () => {
  const r = parseDecisionMetadata("1. Ceza Dairesi 2005/1 E., 2005/2 K.\nSONUÇ: 17.4.2001 gün ve 3827/4434 sayılı kararın kaldırılarak ONANMASINA, 19.6.2005 günü oybirliği ile karar verildi.");
  assert.equal(r.decision_date.value, "2005-06-19");
  assert.deepEqual(r.decision_date.flags, []);
});
