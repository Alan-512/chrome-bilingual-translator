type ObserverCoordinatorCallbacks = {
  onVisible: (elements: HTMLElement[]) => void;
  onMutation: () => void;
};

type ObserverCoordinatorDependencies = {
  createIntersectionObserver?: (callback: IntersectionObserverCallback) => IntersectionObserver;
  createMutationObserver?: (callback: MutationCallback) => MutationObserver;
};

export function createObserverCoordinator(
  doc: Document,
  dependencies: ObserverCoordinatorDependencies = {}
) {
  let mutationFlushScheduled = false;

  function scheduleMutationFlush() {
    if (mutationFlushScheduled) {
      return;
    }

    mutationFlushScheduled = true;
    const schedule = doc.defaultView?.setTimeout?.bind(doc.defaultView) ?? setTimeout;
    schedule(() => {
      mutationFlushScheduled = false;
      callbacks?.onMutation();
    }, 0);
  }

  function isExtensionOwnedNode(node: Node | null): boolean {
    if (node instanceof Text) {
      return isExtensionOwnedNode(node.parentElement);
    }

    if (!(node instanceof Element)) {
      return false;
    }

    return (
      node.closest("[data-bilingual-translator-owned='true']") !== null ||
      node.closest("[data-bilingual-translator-pill='true']") !== null
    );
  }

  function hasMeaningfulMutation(records: MutationRecord[]): boolean {
    return records.some((record) => {
      if (record.type === "childList") {
        const changedNodes = [...record.addedNodes, ...record.removedNodes];
        return changedNodes.some((node) => !isExtensionOwnedNode(node));
      }

      return !isExtensionOwnedNode(record.target);
    });
  }

  const createIntersectionObserver =
    dependencies.createIntersectionObserver ??
    ((callback) => {
      if (typeof IntersectionObserver === "undefined") {
        return {
          observe() {},
          disconnect() {}
        } as IntersectionObserver;
      }

      return new IntersectionObserver(callback, { rootMargin: "200px" });
    });
  const createMutationObserver =
    dependencies.createMutationObserver ??
    ((callback) => {
      if (typeof MutationObserver === "undefined") {
        return {
          observe() {},
          disconnect() {}
        } as MutationObserver;
      }

      return new MutationObserver(callback);
    });

  const intersectionObserver = createIntersectionObserver((entries) => {
    const visibleElements = entries
      .filter((entry) => entry.isIntersecting)
      .map((entry) => entry.target)
      .filter((target): target is HTMLElement => target instanceof HTMLElement);

    if (visibleElements.length > 0) {
      callbacks?.onVisible(visibleElements);
    }
  });

  const mutationObserver = createMutationObserver((records) => {
    if (hasMeaningfulMutation(records)) {
      scheduleMutationFlush();
    }
  });

  let callbacks: ObserverCoordinatorCallbacks | null = null;

  return {
    start(candidates: HTMLElement[], nextCallbacks: ObserverCoordinatorCallbacks) {
      callbacks = nextCallbacks;

      candidates.forEach((candidate) => {
        intersectionObserver.observe(candidate);
      });

      if (doc.body) {
        mutationObserver.observe(doc.body, {
          childList: true,
          subtree: true
        });
      }
    },

    observeCandidates(candidates: HTMLElement[]) {
      candidates.forEach((candidate) => {
        intersectionObserver.observe(candidate);
      });
    },

    disconnect() {
      callbacks = null;
      intersectionObserver.disconnect();
      mutationObserver.disconnect();
    }
  };
}
