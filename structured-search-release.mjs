// Keyword experiments stay opt-in until full-corpus serving is validated.
export function createSearchReleasePolicy({ keywordEnabled = false } = {}) {
  return {
    guardDeepSearch(req, res, next) {
      if (!keywordEnabled) {
        return res.status(503).json({ code: "DEEP_SEARCH_DISABLED",
          error: "Derin arama yayında değil. Mevzuat aramasını kullanın." });
      }
      next();
    },
    options(options) {
      return {
        ...options,
        text_search_ready: keywordEnabled && options.text_search_ready === true,
        text_search_scope: keywordEnabled ? options.text_search_scope : "unavailable",
      };
    },
    guard(req, res, next) {
      if (!keywordEnabled && [req.query.query, req.query.q].some(value => String(value || "").trim())) {
        return res.status(503).json({
          code: "KEYWORD_SEARCH_DISABLED",
          error: "Kelime araması henüz yayında değil. Mahkeme, tarih veya mevzuat filtresi kullanın.",
        });
      }
      next();
    },
  };
}
