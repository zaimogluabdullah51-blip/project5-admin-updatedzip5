import test from "node:test";
import assert from "node:assert/strict";
import { checkSearchRelease } from "./check-search-release.mjs";

function fixture(mutate = () => {}) {
  const counts = { yargitay: 9820145, danistay: 386608, emsal: 815702, aym_bb: 17067, aym_norm: 5563 };
  const options = { ready: true, citation_search_ready: true, text_search_ready: false,
    coverage: "catalog_validated", catalog_rows: 11045085,
    sources: Object.entries(counts).map(([source, rows]) => ({ source, rows, citations_complete: rows })) };
  const row = { indexed_level: "supabase_v2", court: "Test court", esas_no: "2026/1",
    karar_no: "2026/2", karar_tarihi: "2026-04-01", detected_law_refs: ["5237:TCK:86:2"] };
  return async url => {
    const body = url.pathname.endsWith("search-options") ? structuredClone(options) : { results: [structuredClone(row)] };
    mutate(body, url);
    return { status: 200, json: async () => body };
  };
}
test("release check permits structured search while keywords remain unavailable", async () => {
  assert.deepEqual(await checkSearchRelease("http://127.0.0.1:3013", fixture()),
    { passed: true, catalogRows: 11045085, citationReady: true, keywordReady: false, checks: 4 });
});
test("old backend and incomplete citation coverage fail closed", async () => {
  for (const mutate of [body => { body.coverage = "old"; }, body => {
    if (body.sources) body.sources[0].citations_complete = 0;
  }]) await assert.rejects(checkSearchRelease("https://example.invalid", fixture(mutate)));
});
test("incorrect exact and citation filter results are rejected", async () => {
  for (const filter of ["caseNo", "legalRef"]) {
    await assert.rejects(checkSearchRelease("https://example.invalid", fixture((body, url) => {
      if (url.searchParams.has(filter)) {
        body.results[0].esas_no = "wrong";
        body.results[0].detected_law_refs = ["5237:TCK:860"];
      }
    })));
  }
});
test("credentials and insecure remote URLs are rejected before requests", async () => {
  for (const url of ["https://user:secret@example.invalid", "http://example.invalid"]) {
    await assert.rejects(checkSearchRelease(url, () => assert.fail("unexpected request")));
  }
});
