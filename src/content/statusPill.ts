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

  const pill = doc.createElement("span");
  pill.setAttribute(PILL_ATTRIBUTE, "true");
  pill.hidden = true;
  pill.setAttribute("aria-hidden", "true");
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
