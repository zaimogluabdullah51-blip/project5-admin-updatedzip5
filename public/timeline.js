(function () {
  const DEFAULT_TRANSITION_YEAR = 2016;
  const FEATURED_TRANSITION_PAGE = 657;

  const PALETTE = {
    cold: {
      dot: "#7a95b0",
      line: "#4e6782",
      chipBg: "rgba(122, 149, 176, 0.16)",
      chipText: "#c8d8e9"
    },
    warm: {
      dot: "#d06a3b",
      line: "#a84a27",
      chipBg: "rgba(208, 106, 59, 0.18)",
      chipText: "#ffd4bf"
    },
    transition: {
      dot: "#f4b266",
      line: "#cd8e3c",
      chipBg: "rgba(244, 178, 102, 0.2)",
      chipText: "#ffe8cc"
    }
  };

  function toIsoDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dmy) {
      const day = dmy[1].padStart(2, "0");
      const month = dmy[2].padStart(2, "0");
      return `${dmy[3]}-${month}-${day}`;
    }

    const ym = raw.match(/^(\d{4})[./-](\d{1,2})$/);
    if (ym) {
      return `${ym[1]}-${ym[2].padStart(2, "0")}-01`;
    }

    const yearOnly = raw.match(/^\d{4}$/);
    if (yearOnly) return `${yearOnly[0]}-01-01`;

    return "";
  }

  function formatDate(iso) {
    const value = toIsoDate(iso);
    if (!value) return "";
    const parts = value.split("-");
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }

  function getYear(iso) {
    const value = toIsoDate(iso);
    if (!value) return null;
    const y = parseInt(value.slice(0, 4), 10);
    return Number.isFinite(y) ? y : null;
  }

  function normalizeType(rawType) {
    const t = String(rawType || "").trim().toLowerCase();
    if (!t) return "delil";
    if (t.includes("zaman")) return "zamanaşımı";
    if (t.includes("geç") || t.includes("kırılma") || t.includes("transition")) return "geçiş";
    if (t.includes("delil")) return "delil";
    return t;
  }

  function parseTimelineText(text) {
    const lines = String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const events = [];
    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim());
      const date = toIsoDate(parts[0]);
      if (!date) continue;
      const type = normalizeType(parts[1] || "delil");
      const title = parts[2] || parts[1] || "Kayıt";
      const note = parts[3] || "";
      const page = Number(parts[4]);
      events.push({
        date,
        type,
        title,
        note,
        page: Number.isFinite(page) ? page : null
      });
    }

    return events.sort((a, b) => a.date.localeCompare(b.date));
  }

  function formatTimelineText(events) {
    const list = Array.isArray(events) ? events : [];
    return list
      .slice()
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
      .map((e) => {
        const date = toIsoDate(e.date);
        if (!date) return "";
        return [
          date,
          normalizeType(e.type),
          String(e.title || "").trim(),
          String(e.note || "").trim(),
          e.page ? String(e.page) : ""
        ].join(" | ");
      })
      .filter(Boolean)
      .join("\n");
  }

  function coerceTimelineConfig(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const transitionYear = parseInt(source.transitionYear, 10);
    const safeTransition = Number.isFinite(transitionYear)
      ? transitionYear
      : DEFAULT_TRANSITION_YEAR;

    const events = Array.isArray(source.events)
      ? source.events
          .map((e) => {
            const date = toIsoDate(e.date);
            if (!date) return null;
            const page = Number(e.page);
            return {
              date,
              type: normalizeType(e.type),
              title: String(e.title || "").trim() || "Kayıt",
              note: String(e.note || "").trim(),
              page: Number.isFinite(page) ? page : null
            };
          })
          .filter(Boolean)
          .sort((a, b) => a.date.localeCompare(b.date))
      : [];

    return {
      enabled: !!source.enabled,
      transitionYear: safeTransition,
      events
    };
  }

  function toneForEvent(event, transitionYear) {
    const type = normalizeType(event.type);
    if (type === "geçiş") return "transition";
    const year = getYear(event.date);
    if (year === null) return "cold";
    return year <= transitionYear ? "cold" : "warm";
  }

  function isFeaturedTransitionEvent(event) {
    if (!event) return false;
    if (Number(event.page) === FEATURED_TRANSITION_PAGE) return true;
    return normalizeType(event.type) === "geçiş";
  }

  window.TimelineUtils = {
    DEFAULT_TRANSITION_YEAR,
    FEATURED_TRANSITION_PAGE,
    PALETTE,
    toIsoDate,
    formatDate,
    parseTimelineText,
    formatTimelineText,
    coerceTimelineConfig,
    toneForEvent,
    isFeaturedTransitionEvent
  };
})();
