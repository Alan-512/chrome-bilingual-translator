import { normalizeText } from "./textUtils";

export const STRUCTURED_ROOT_SELECTOR = "blockquote, table, dl, [role='table'], [role='grid']";

export function collectTableText(tableRoot: HTMLElement): string {
  const rows = Array.from(
    tableRoot.querySelectorAll<HTMLElement>(
      ":scope > thead > tr, :scope > tbody > tr, :scope > tfoot > tr, :scope > tr, :scope [role='row']"
    )
  );
  const normalizedRows = rows
    .map((row) => {
      const cells = Array.from(
        row.querySelectorAll<HTMLElement>(":scope > th, :scope > td, :scope > [role='rowheader'], :scope > [role='cell']")
      )
        .map((cell) => normalizeText(cell.textContent))
        .filter(Boolean);

      return cells.length === 2 ? `${cells[0]}: ${cells[1]}` : cells.join(" | ");
    })
    .filter(Boolean);

  return normalizedRows.join("\n\n");
}

export function collectDescriptionListText(listRoot: HTMLElement): string {
  const directChildren = Array.from(listRoot.children) as HTMLElement[];
  const parts: string[] = [];
  let pendingTerm = "";

  directChildren.forEach((child) => {
    const text = normalizeText(child.textContent);
    if (!text) return;
    if (child.tagName === "DT") {
      pendingTerm = text;
      return;
    }
    if (child.tagName === "DD") {
      parts.push(pendingTerm ? `${pendingTerm}: ${text}` : text);
      pendingTerm = "";
    }
  });

  return parts.length > 0 ? parts.join("\n\n") : normalizeText(listRoot.textContent);
}

export function collectNestedBlockquoteText(blockquoteRoot: HTMLElement): string {
  let sourceText = normalizeText(blockquoteRoot.textContent);
  const nestedStructuredRoots = Array.from(blockquoteRoot.querySelectorAll<HTMLElement>(STRUCTURED_ROOT_SELECTOR)).filter(
    (nestedRoot) => nestedRoot !== blockquoteRoot
  );

  nestedStructuredRoots.forEach((nestedRoot) => {
    const nestedText = normalizeText(nestedRoot.textContent);
    if (nestedText) {
      sourceText = normalizeText(sourceText.replace(nestedText, " "));
    }
  });

  return sourceText;
}

