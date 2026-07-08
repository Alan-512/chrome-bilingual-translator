const EXTENSION_OWNED_SELECTOR = "[data-bilingual-translator-owned='true']";

export function isExtensionOwned(element: Element): boolean {
  return element.closest(EXTENSION_OWNED_SELECTOR) !== null;
}

export function isInsideShadowRoot(node: Node): boolean {
  return node.nodeType === 11 && "host" in node;
}

export function isElementTrulyHidden(element: HTMLElement): boolean {
  const visited = new Set<Element>();
  let current: Element | null = element;
  while (current) {
    if (visited.has(current)) {
      break;
    }
    visited.add(current);
    if (current.nodeType === 1) {
      const el = current as HTMLElement;
      if (el.hidden || el.getAttribute("aria-hidden") === "true") {
        return true;
      }
      if (el.style.display === "none" || el.style.visibility === "hidden") {
        return true;
      }
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (style && (style.display === "none" || style.visibility === "hidden")) {
        return true;
      }
    }

    const parent = current.parentElement;
    if (parent) {
      current = parent;
    } else {
      const root = current.getRootNode();
      if (isInsideShadowRoot(root)) {
        current = (root as ShadowRoot).host;
      } else {
        break;
      }
    }
  }
  return false;
}

export function isHidden(element: HTMLElement): boolean {
  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return true;
  }

  if (element.style.display === "none" || element.style.visibility === "hidden") {
    return true;
  }

  const isJsdom = element.ownerDocument.defaultView?.navigator.userAgent.includes("jsdom") ?? false;
  const rootNode = element.getRootNode();
  const insideShadow = isInsideShadowRoot(rootNode);

  if (!insideShadow && !isJsdom) {
    if (element.offsetParent === null && element.tagName !== "BODY" && element.tagName !== "HTML") {
      const style = element.ownerDocument.defaultView?.getComputedStyle(element);
      if (style && style.position !== "fixed") {
        return true;
      }
    }

    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style && (style.display === "none" || style.visibility === "hidden")) {
      return true;
    }
  }

  if (isElementTrulyHidden(element)) {
    return true;
  }

  return (
    element.closest<HTMLElement>("[hidden], [aria-hidden='true']") !== null ||
    element.closest<HTMLElement>("[style*='display: none']") !== null
  );
}

