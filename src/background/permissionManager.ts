export type ApiOriginPermissionRequester = (origin: string) => Promise<boolean>;

export function createChromeApiOriginPermissionRequester(): ApiOriginPermissionRequester {
  return async (origin: string) => {
    if (!chrome.permissions) {
      return true;
    }

    const origins = [`${origin}/*`];
    const granted = await chrome.permissions.contains({ origins });
    if (granted) {
      return true;
    }

    return chrome.permissions.request({ origins });
  };
}
