export type PageClassification = {
  site: "reddit" | "github" | "openrouter" | "producthunt" | "generic";
  surface: "listing" | "detail" | "repo-home" | "repo-subpage" | "product-home" | "generic";
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

  if (/(\.|^)openrouter\.ai$/i.test(host)) {
    return {
      site: "openrouter",
      surface: "listing"
    };
  }

  if (/(\.|^)producthunt\.com$/i.test(host)) {
    if (/^\/products\/[^/]+/.test(pathname) || /^\/posts\/[^/]+/.test(pathname)) {
      return {
        site: "producthunt",
        surface: "detail"
      };
    }

    return {
      site: "producthunt",
      surface: "listing"
    };
  }

  return {
    site: "generic",
    surface: "generic"
  };
}
