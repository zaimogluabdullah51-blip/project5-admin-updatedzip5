import fs from "node:fs";
import vm from "node:vm";

export function loadLegalParser() {
  const source = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const start = source.indexOf("const LAW_REGISTRY =");
  const end = source.indexOf("async function getTckTitleForSearch");
  if (start < 0 || end <= start) throw new Error("Legal parser block not found");
  const context = vm.createContext({ console, URL, URLSearchParams });
  vm.runInContext(`${source.slice(start, end)}\nglobalThis.parser = {buildAuditedLegalReferencesForRow, canonicalLegalRef, extractLegalReferencesFromHfTags, extractLegalReferences, mergeLegalReferenceCandidates};`, context);
  return context.parser;
}
