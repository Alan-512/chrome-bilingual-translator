export type CandidateBlock = {
  blockId: string;
  element: HTMLElement;
  sourceText: string;
  rehydrateKey?: string;
  renderHint?: {
    anchorElement?: HTMLElement;
    expansionRoot?: HTMLElement;
    skipLoadingPlaceholder?: boolean;
    skipVirtualizedLayoutAdjustment?: boolean;
    preserveExistingRenderedCopies?: boolean;
    renderAsSourceInline?: boolean;
  };
};

