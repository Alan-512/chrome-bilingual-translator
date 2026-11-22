import {
  MAX_SELECTION_IMAGE_EDGE,
  SELECTION_IMAGE_QUALITY,
  type ImageCaptureRegion,
  type SelectedImage
} from "../shared/messageTypes";

async function captureTab(tabId: number, windowId: number, pageUrl?: string): Promise<ImageBitmap> {
  let changed = false;
  const onActivated = (info: chrome.tabs.OnActivatedInfo) => {
    if (info.windowId === windowId && info.tabId !== tabId) changed = true;
  };
  const onUpdated = (id: number, info: chrome.tabs.OnUpdatedInfo) => {
    if (id === tabId && (info.status === "loading" || info.url !== undefined)) changed = true;
  };
  const changedError = "页面已切换，请在原页面重新选择图片。";
  chrome.tabs.onActivated.addListener(onActivated);
  chrome.tabs.onUpdated.addListener(onUpdated);
  try {
    const before = await chrome.tabs.get(tabId);
    if (!before.active || before.windowId !== windowId || before.status === "loading" ||
        (pageUrl && before.url !== pageUrl) || changed) {
      throw new Error(changedError);
    }
    const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    const after = await chrome.tabs.get(tabId);
    if (!after.active || after.windowId !== windowId || after.url !== before.url || changed) {
      throw new Error(changedError);
    }
    return await createImageBitmap(await (await fetch(screenshot)).blob());
  } finally {
    chrome.tabs.onActivated.removeListener(onActivated);
    chrome.tabs.onUpdated.removeListener(onUpdated);
  }
}

async function cropImage(bitmap: ImageBitmap, region: ImageCaptureRegion): Promise<string> {
  const left = Math.ceil(region.x * region.scale);
  const top = Math.ceil(region.y * region.scale);
  const width = Math.min(bitmap.width, Math.floor((region.x + region.width) * region.scale)) - left;
  const height = Math.min(bitmap.height, Math.floor((region.y + region.height) * region.scale)) - top;
  if (width <= 0 || height <= 0) throw new Error("图片的可见区域太小，请放大图片后重试。");

  const scale = Math.min(1, MAX_SELECTION_IMAGE_EDGE / Math.max(width, height));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  canvas.getContext("2d")!.drawImage(bitmap, left, top, width, height, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: SELECTION_IMAGE_QUALITY });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function resolveSelectionImages(
  images: SelectedImage[],
  tabId: number,
  windowId: number,
  pageUrl?: string
): Promise<string[]> {
  if (images.every((image) => "dataUrl" in image)) {
    return images.map((image) => image.dataUrl);
  }

  // Capture once and send only cropped image pixels to the model.
  const bitmap = await captureTab(tabId, windowId, pageUrl);
  try {
    return await Promise.all(images.map((image) =>
      "dataUrl" in image ? image.dataUrl : cropImage(bitmap, image.capture)
    ));
  } finally {
    bitmap.close();
  }
}
