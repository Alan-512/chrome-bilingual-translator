export type PageClassification = {
  site: "reddit" | "github" | "generic";
  surface: "listing" | "detail" | "repo-home" | "repo-subpage" | "generic";
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

  if (/(\.|^)github\.com$/i.test(host)) {
    const pathSegments = pathname.split("/").filter(Boolean);

    if (pathSegments.length === 2) {
      return {
        site: "github",
        surface: "repo-home"
      };
    }

    if (pathSegments.length >= 3) {
      return {
        site: "github",
        surface: "repo-subpage"
      };
    }

    return {
      site: "github",
      surface: "generic"
    };
  }

  return {
    site: "generic",
    surface: "generic"
  };
}
