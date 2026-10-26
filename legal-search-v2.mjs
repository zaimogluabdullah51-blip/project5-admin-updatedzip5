// Server-side adapter. Never expose the service-role credential to the browser.
export function createLegalSearchV2({ url, key, parseReference, canonicalReference, fetchImpl = fetch }) {
  async function rpc(name, params, signal) {
    if (!url || !key) throw Object.assign(new Error("Arama bağlantısı yapılandırılmamış."), { status: 503 });
    let response;
    try {
      response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      if (error.name === "TimeoutError") {
        throw Object.assign(new Error("Arama süre sınırına ulaştı. Yeniden deneyin."), { status: 504 });
      }
      throw Object.assign(new Error("Arama hizmetine bağlantı kurulamadı."), { status: 503 });
    }
    if (!response.ok) {
      if (response.status === 504 || response.status === 408) {
        throw Object.assign(new Error("Arama süre sınırına ulaştı. Yeniden deneyin."), { status: 504 });
      }
      const body = await response.json().catch(() => ({}));
      const status = body.code === "22023" || body.code === "22007" || body.code === "22008" ? 400 : 503;
      const pending = body.message === "Full-corpus keyword index is incomplete"
        ? "Tüm veri setinin kelime indeksi henüz tamamlanmadı."
        : body.message === "Full-corpus citation index is incomplete"
          ? "Tüm veri setinin mevzuat etiketleri henüz tamamlanmadı."
          : "Yeni arama indeksi henüz hazır değil.";
      throw Object.assign(new Error(status === 400 ? "Arama filtreleri geçersiz." : pending), { status });
    }
    return response.json();
  }
  function date(value) {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
        || new Date(value).toISOString().slice(0, 10) !== value) {
      throw Object.assign(new Error("Geçerli bir tarih girin."), { status: 400 });
    }
    return value;
  }
  return {
    options: () => rpc("search_decisions_v2_options", {}),
    async search(input, signal) {
      const legalRef = String(input.legalRef || "").trim();
      const parsed = legalRef ? parseReference(legalRef, { defaultLawCode: "TCK" }) : null;
      if (legalRef && !parsed) throw Object.assign(new Error("Mevzuat maddesi tanınmadı."), { status: 400 });
      if (input.citationState && !["zero","tagged"].includes(input.citationState)) {
        throw Object.assign(new Error("Atıf durumu geçersiz."), { status: 400 });
      }
      const limit = Number(input.limit ?? 20), offset = Number(input.offset ?? 0);
      const query = String(input.query || "").trim();
      const caseNo = String(input.caseNo || "").trim();
      const decisionNo = String(input.decisionNo || "").trim();
      const tagId = input.tagId ? Number(input.tagId) : null;
      const from = date(input.dateFrom), to = date(input.dateTo);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset)
          || offset < 0 || offset > 1000 || query.length > 300 || caseNo.length > 100 || decisionNo.length > 100 || (from && to && from > to)
          || (tagId !== null && (!Number.isSafeInteger(tagId) || tagId <= 0))) {
        throw Object.assign(new Error("Arama sınırları geçersiz; filtreleri daraltın."), { status: 400 });
      }
      return rpc("search_decisions_v2", {
        p_query: query, p_court: input.court || null,
        p_date_from: from, p_date_to: to, p_reference: parsed ? canonicalReference(parsed) : null,
        p_case_no: caseNo || null, p_decision_no: decisionNo || null,
        p_tag_id: tagId,
        p_citation_state: input.citationState || null,
        p_limit: limit, p_offset: offset,
      }, signal);
    },
  };
}
