import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export async function checkSearchRelease(base, fetchImpl = fetch) {
  const origin = new URL(base);
  assert.ok(!origin.username && !origin.password, "Use a URL without credentials");
  assert.ok(origin.protocol === "https:" ||
    (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)),
  "Use HTTPS or a local HTTP server");
  async function request(path, params = {}) {
    const url = new URL(path, origin);
    url.search = new URLSearchParams(params).toString();
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(90000) });
    assert.equal(response.status, 200, `${path}: unexpected HTTP status`);
    return response.json();
  }
  const options = await request("/api/legal-index/search-options");
  assert.equal(options.coverage, "catalog_validated", "Old or unvalidated backend");
  assert.equal(options.ready, true);
  assert.equal(options.citation_search_ready, true);
  assert.equal(Number(options.catalog_rows), 11045085);
  const expected = { yargitay: 9820145, danistay: 386608, emsal: 815702, aym_bb: 17067, aym_norm: 5563 };
  for (const [source, count] of Object.entries(expected)) {
    const row = options.sources?.find(row => row.source === source);
    assert.equal(Number(row?.rows), count, `${source}: incomplete catalog`);
    assert.equal(Number(row?.citations_complete), count, `${source}: incomplete citations`);
  }
  const dates = await request("/api/legal-index/search", {
    dateFrom: "2026-01-01", dateTo: "2026-12-31", limit: "5",
  });
  assert.ok(dates.results?.length > 0 && dates.results.length <= 5, "Missing 2026 results");
  for (const row of dates.results) {
    assert.equal(row.indexed_level, "supabase_v2");
    assert.ok(row.karar_tarihi >= "2026-01-01" && row.karar_tarihi <= "2026-12-31");
  }
  const sample = dates.results.find(row => row.court && row.esas_no && row.karar_no);
  assert.ok(sample, "No usable exact-filter sample");
  const exact = await request("/api/legal-index/search", {
    court: sample.court, caseNo: sample.esas_no, decisionNo: sample.karar_no,
    dateFrom: sample.karar_tarihi, dateTo: sample.karar_tarihi, limit: "5",
  });
  assert.ok(exact.results?.length > 0, "Exact filters returned no results");
  for (const row of exact.results) {
    assert.equal(row.court, sample.court);
    assert.equal(row.esas_no, sample.esas_no);
    assert.equal(row.karar_no, sample.karar_no);
    assert.equal(row.karar_tarihi, sample.karar_tarihi);
  }
  const citations = await request("/api/legal-index/search", {
    legalRef: "TCK 86", dateFrom: "2026-01-01", limit: "5",
  });
  assert.ok(citations.results?.length > 0, "No citation results");
  for (const row of citations.results) {
    assert.ok(row.karar_tarihi >= "2026-01-01");
    assert.ok(row.detected_law_refs?.some(ref => ref === "5237:TCK:86" || ref.startsWith("5237:TCK:86:")),
      "Citation filter returned an unrelated decision");
  }
  return { passed: true, catalogRows: Number(options.catalog_rows),
    citationReady: true, keywordReady: options.text_search_ready === true, checks: 4 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.ok(process.argv[2], "Pass the deployed or local application URL");
    console.log(JSON.stringify(await checkSearchRelease(process.argv[2])));
  } catch (error) {
    // Do not print response bodies, headers, URLs with credentials, or decision data.
    console.error(JSON.stringify({ passed: false, error: error.code || error.name }));
    process.exitCode = 1;
  }
}
