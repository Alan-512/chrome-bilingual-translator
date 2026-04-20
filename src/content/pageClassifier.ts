export type PageClassification = {
  site: "reddit" | "github" | "openrouter" | "producthunt" | "google-search" | "generic";
  surface: "listing" | "detail" | "repo-home" | "repo-subpage" | "product-home" | "generic";
};

function looksLikeGitHubDocument(doc: Document): boolean {
  if (typeof doc.querySelector !== "function") {
    return false;
  }

  return (
    doc.querySelector("#readme, .markdown-body, [itemprop='about'], [data-testid='repository-about']") !== null
  );
}

function looksLikeOpenRouterDocument(doc: Document): boolean {
  if (typeof doc.querySelector !== "function") {
    return false;
  }

  return doc.querySelector(".model-card, [data-testid='model-card'], [data-testid='model-list-item'], [data-or-route='model-card']") !== null;
}

function looksLikeProductHuntDocument(doc: Document): boolean {
  if (typeof doc.querySelector !== "function") {
    return false;
  }

  return (
    doc.querySelector("[data-producthunt-main], main article, [data-test='product-main'], [data-sentry-component='ProductPage']") !==
    null
  );
}

function looksLikeGoogleSearchDocument(doc: Document): boolean {
  if (typeof doc.querySelector !== "function") {
    return false;
  }

  return (
    doc.querySelector(
      ".MjjYud h3, .VwiC3b, .yXK7lf .MUxGbd, .related-question-pair [role='heading'], .kp-wholepage [data-attrid='title'], .kp-wholepage .kno-rdesc"
    ) !== null
  );
}

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

  if (/(\.|^)github\.com$/i.test(host) || looksLikeGitHubDocument(doc)) {
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
      surface: "repo-home"
    };
  }

  if (/(\.|^)openrouter\.ai$/i.test(host) || looksLikeOpenRouterDocument(doc)) {
    return {
      site: "openrouter",
      surface: "listing"
    };
  }

  if (/(\.|^)producthunt\.com$/i.test(host) || looksLikeProductHuntDocument(doc)) {
    if (/^\/products\/[^/]+/.test(pathname) || /^\/posts\/[^/]+/.test(pathname)) {
      return {
        site: "producthunt",
        surface: "detail"
      };
    }

    return {
      site: "producthunt",
      surface: looksLikeProductHuntDocument(doc) ? "detail" : "listing"
    };
  }

  if ((/(\.|^)google\./i.test(host) && pathname === "/search") || looksLikeGoogleSearchDocument(doc)) {
    return {
      site: "google-search",
      surface: "listing"
    };
  }

  return {
    site: "generic",
    surface: "generic"
  };
}
