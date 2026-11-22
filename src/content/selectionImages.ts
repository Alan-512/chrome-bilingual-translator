import {
  MAX_SELECTION_IMAGE_EDGE,
  SELECTION_IMAGE_QUALITY,
  type ImageCaptureRegion,
  type SelectedImage
} from "../shared/messageTypes";

const MAX_IMAGES = 4;

function isRendered(image: HTMLImageElement): boolean {
  const { width, height } = image.getBoundingClientRect();
  return width > 0 && height > 0 && getComputedStyle(image).visibility === "visible";
}

export function findImagesInRange(range: Range): HTMLImageElement[] {
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, (node) => {
    if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
    return node instanceof HTMLImageElement && isRendered(node)
      ? NodeFilter.FILTER_ACCEPT
      : NodeFilter.FILTER_SKIP;
  });
  const images: HTMLImageElement[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    images.push(node as HTMLImageElement);
  }
  return images;
}

export function findContextImage(imageUrl: string): HTMLImageElement | undefined {
  function matches(image: Element): image is HTMLImageElement {
    return image instanceof HTMLImageElement &&
      (image.currentSrc === imageUrl || image.src === imageUrl) && isRendered(image);
  }

  let hovered = document.querySelector(":hover");
  while (hovered) {
    if (matches(hovered)) return hovered;
    hovered = hovered.shadowRoot?.querySelector(":hover") ??
      hovered.querySelector(":scope > :hover");
  }

  function findIn(root: Document | ShadowRoot): HTMLImageElement | undefined {
    const match = Array.from(root.querySelectorAll("img")).find(matches);
    if (match) return match;
    for (const element of root.querySelectorAll("*")) {
      const nested = element.shadowRoot && findIn(element.shadowRoot);
      if (nested) return nested;
    }
  }

  return findIn(document);
}

function readImagePixels(image: HTMLImageElement): string | null {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) {
    throw new Error("图片尚未加载完成，请加载后重试。");
  }

  const scale = Math.min(1, MAX_SELECTION_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  try {
    return canvas.toDataURL("image/jpeg", SELECTION_IMAGE_QUALITY);
  } catch (error) {
    // Images displayed without CORS may taint the canvas.
    if (error instanceof DOMException && error.name === "SecurityError") return null;
    throw error;
  }
}

function getCaptureRegion(image: HTMLImageElement): ImageCaptureRegion {
  const rect = image.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(document.documentElement.clientWidth, rect.right);
  const bottom = Math.min(document.documentElement.clientHeight, rect.bottom);
  if (window !== window.top || right <= left || bottom <= top) {
    throw new Error("无法读取这张图片，请在主页面中打开图片后重试。");
  }

  const root = image.getRootNode() as Document | ShadowRoot;
  const points = [
    [left + (right - left) / 2, top + (bottom - top) / 2],
    [left, top], [right - 1, top], [left, bottom - 1], [right - 1, bottom - 1]
  ] as const;
  if (points.some(([x, y]) => root.elementFromPoint(x, y) !== image)) {
    throw new Error("图片被页面元素遮挡，请将图片露出后重试。");
  }

  return { x: left, y: top, width: right - left, height: bottom - top, scale: window.devicePixelRatio };
}

export function readSelectedImages(images: HTMLImageElement[]): SelectedImage[] {
  if (images.length > MAX_IMAGES) {
    throw new Error(`一次最多解释 ${MAX_IMAGES} 张图片，请缩小选区后重试。`);
  }

  return images.map((image) => {
    const dataUrl = readImagePixels(image);
    return dataUrl ? { dataUrl } : { capture: getCaptureRegion(image) };
  });
}

export function captureRegionsAreCurrent(images: HTMLImageElement[], selected: SelectedImage[]): boolean {
  try {
    return selected.every((image, index) => {
      if (!("capture" in image)) return true;
      const current = getCaptureRegion(images[index]!);
      const { x, y, width, height, scale } = image.capture;
      return current.x === x && current.y === y && current.width === width &&
        current.height === height && current.scale === scale;
    });
  } catch {
    return false;
  }
}

export function suspendSelectionHighlight(selection: Selection) {
  const range = selection.getRangeAt(0).cloneRange();
  const forward = selection.anchorNode === range.startContainer && selection.anchorOffset === range.startOffset;
  selection.removeAllRanges();

  function restore() {
    clearTimeout(restoreTimer);
    const { startContainer, startOffset, endContainer, endOffset } = range;
    if (selection.rangeCount || range.collapsed || !startContainer.isConnected || !endContainer.isConnected) {
      return;
    }
    if (forward) {
      selection.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset);
    } else {
      selection.setBaseAndExtent(endContainer, endOffset, startContainer, startOffset);
    }
  }
  const restoreTimer = window.setTimeout(restore, 3000);
  const ready = new Promise<void>((resolve) => {
    // Let the compositor repaint before capture. Frames can pause on a hidden tab.
    const paintTimer = window.setTimeout(resolve, 150);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(paintTimer);
      resolve();
    }));
  });
  return { ready, restore };
}
