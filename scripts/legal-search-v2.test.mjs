import test from "node:test";
import assert from "node:assert/strict";
import { createLegalSearchV2 } from "../legal-search-v2.mjs";

function client(fetchImpl) {
  return createLegalSearchV2({
    url: "https://example.invalid", key: "test-only",
    parseReference: (ref) => ref === "TCK 86" ? { article: "86" } : null,
    canonicalReference: () => "5237:TCK:86", fetchImpl,
  });
}
test("all filters are passed to one RPC, not merged from inconsistent sources", async () => {
  let called = false;
  const api = client(async (url, options) => {
    called = true;
    assert.equal(url, "https://example.invalid/rest/v1/rpc/search_decisions_v2");
    assert.deepEqual(JSON.parse(options.body), {
      p_query: "işçi", p_court: "Mahkeme", p_date_from: "2026-01-01", p_date_to: "2026-10-20",
      p_reference: "5237:TCK:86", p_case_no: "2026/1", p_decision_no: null, p_tag_id: null, p_citation_state: null, p_limit: 10, p_offset: 0,
    });
    return { ok: true, json: async () => ({ results: [], has_more: false }) };
  });
  await api.search({ query: "işçi",court: "Mahkeme",dateFrom: "2026-01-01",
    dateTo: "2026-10-20",legalRef: "TCK 86",caseNo: "2026/1",limit: 10 });
  assert.ok(called);
});
test("invalid filters fail before network access", async () => {
  const api = client(() => { throw new Error("unexpected request"); });
  for (const input of [
    { dateFrom: "2026-02-30" }, { dateFrom: "2026-12-01", dateTo: "2026-01-01" },
    { offset: -1 }, { offset: 1001 }, { limit: "bad" }, { legalRef: "unknown" },
    { query: "a".repeat(301) },
    { caseNo: "a".repeat(101) }, { decisionNo: "a".repeat(101) },
  ]) await assert.rejects(api.search(input), (error) => error.status === 400);
});
test("incomplete corpus returns unavailable instead of silent local fallback", async () => {
  const api = client(async () => ({ ok: false,json: async () => ({ code: "55000",message: "internal" }) }));
  await assert.rejects(api.search({ query: "test" }), (error) => error.status === 503 && !error.message.includes("internal"));
});
test("database validation errors map to user input errors", async () => {
  const api = client(async () => ({ ok: false,json: async () => ({ code: "22023" }) }));
  await assert.rejects(api.search({ query: "test" }), (error) => error.status === 400);
});

test("transport and gateway timeouts are explicit, not incomplete-index errors", async () => {
  for (const fetchImpl of [
    async () => { throw new DOMException("timeout", "TimeoutError"); },
    async () => ({ ok: false, status: 504 }),
  ]) {
    await assert.rejects(client(fetchImpl).search({ court: "Mahkeme" }), error => error.status === 504);
  }
});

test("caller cancellation preserves its error", async () => {
  const controller = new AbortController();
  controller.abort();
  const error = new DOMException("cancelled", "AbortError");
  await assert.rejects(client(async () => { throw error; }).search({}, controller.signal), caught => caught === error);
});
