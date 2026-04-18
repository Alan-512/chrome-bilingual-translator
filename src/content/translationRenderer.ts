type RenderTranslationInput = {
  blockId: string;
  translationText: string;
  tightLayout?: boolean;
};

const OWNED_ATTRIBUTE = "data-bilingual-translator-owned";
const BLOCK_ID_ATTRIBUTE = "data-bilingual-translator-block-id";

export function renderTranslationBelow(sourceElement: HTMLElement, input: RenderTranslationInput): HTMLElement {
  const translationElement = sourceElement.ownerDocument.createElement("div");
  translationElement.setAttribute(OWNED_ATTRIBUTE, "true");
  translationElement.setAttribute(BLOCK_ID_ATTRIBUTE, input.blockId);
  translationElement.className = "bilingual-translator-translation";
  translationElement.textContent = input.translationText;

  if (input.tightLayout) {
    translationElement.dataset.bilingualTranslatorLayout = "tight";
  }

  sourceElement.insertAdjacentElement("afterend", translationElement);
  return translationElement;
}

export function removeRenderedTranslations(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>(`[${OWNED_ATTRIBUTE}='true']`).forEach((element) => {
    element.remove();
  });
}
