export type PageClassification = {
  site: "reddit" | "generic";
  surface: "listing" | "detail" | "generic";
};

export function classifyPage(doc: Document): PageClassification {
  const host = doc.location?.hostname ?? "";
  const pathname = doc.location?.pathname ?? "";
  const looksLikeRedditHost = /(\.|^)reddit\.com$/i.test(host);
  const looksLikeRedditPath = /^\/r\/[^/]+(?:\/|$)/.test(pathname);

  if (looksLikeRedditHost || looksLikeRedditPath) {
    if (/\/comments\//.test(pathname)) {
      return {
        site: "reddit",
        surface: "detail"
      };
    }

    return {
      site: "reddit",
      surface: "listing"
    };
  }

  return {
    site: "generic",
    surface: "generic"
  };
}
