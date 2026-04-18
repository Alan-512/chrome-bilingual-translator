type StatusPillState =
  | {
      state: "idle" | "translating";
      translatedBlockCount: number;
      failedBlockCount?: number;
      errorMessage?: string;
    }
  | {
      state: "translated" | "error";
      translatedBlockCount: number;
      failedBlockCount?: number;
      errorMessage?: string;
    };

const PILL_ATTRIBUTE = "data-bilingual-translator-pill";

export function ensureStatusPill(doc: Document): HTMLElement {
  const existing = doc.querySelector<HTMLElement>(`[${PILL_ATTRIBUTE}='true']`);
  if (existing) {
    return existing;
  }

  const pill = doc.createElement("div");
  pill.setAttribute(PILL_ATTRIBUTE, "true");
  pill.style.position = "fixed";
  pill.style.top = "16px";
  pill.style.right = "16px";
  pill.style.zIndex = "2147483647";
  pill.style.padding = "8px 12px";
  pill.style.borderRadius = "999px";
  pill.style.background = "rgba(28, 32, 41, 0.92)";
  pill.style.color = "#fff";
  pill.style.fontSize = "12px";
  pill.style.fontWeight = "700";
  pill.textContent = "Idle";
  doc.body.appendChild(pill);
  return pill;
}

export function updateStatusPill(pill: HTMLElement, state: StatusPillState): void {
  pill.dataset.state = state.state;

  if (state.state === "error") {
    const message = state.errorMessage ? ` | ${state.errorMessage}` : "";
    pill.textContent = `Errors: ${state.failedBlockCount ?? 0} | Done: ${state.translatedBlockCount}${message}`;
    return;
  }

  if (state.state === "translated") {
    pill.textContent = `Translated ${state.translatedBlockCount} blocks`;
    return;
  }

  if (state.state === "translating") {
    pill.textContent = `Translating ${state.translatedBlockCount} blocks`;
    return;
  }

  pill.textContent = "Idle";
}
