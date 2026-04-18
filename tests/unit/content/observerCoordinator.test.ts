// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createObserverCoordinator } from "../../../src/content/observerCoordinator";

describe("observerCoordinator", () => {
  it("observes candidates and forwards visible elements", () => {
    const observedTargets: Element[] = [];
    let intersectionCallback: IntersectionObserverCallback | undefined;

    const coordinator = createObserverCoordinator(document, {
      createIntersectionObserver(callback) {
        intersectionCallback = callback;
        return {
          observe(target) {
            observedTargets.push(target);
          },
          disconnect: vi.fn()
        } as unknown as IntersectionObserver;
      },
      createMutationObserver() {
        return {
          observe: vi.fn(),
          disconnect: vi.fn()
        } as unknown as MutationObserver;
      }
    });

    const a = document.createElement("p");
    const b = document.createElement("p");

    const onVisible = vi.fn();
    coordinator.start([a, b], {
      onVisible,
      onMutation: vi.fn()
    });

    intersectionCallback?.(
      [
        { isIntersecting: true, target: a },
        { isIntersecting: false, target: b }
      ] as IntersectionObserverEntry[],
      {} as IntersectionObserver
    );

    expect(observedTargets).toEqual([a, b]);
    expect(onVisible).toHaveBeenCalledWith([a]);
  });

  it("forwards mutation events and disconnects both observers", () => {
    let mutationCallback: MutationCallback | undefined;
    const intersectionDisconnect = vi.fn();
    const mutationDisconnect = vi.fn();

    const coordinator = createObserverCoordinator(document, {
      createIntersectionObserver() {
        return {
          observe: vi.fn(),
          disconnect: intersectionDisconnect
        } as unknown as IntersectionObserver;
      },
      createMutationObserver(callback) {
        mutationCallback = callback;
        return {
          observe: vi.fn(),
          disconnect: mutationDisconnect
        } as unknown as MutationObserver;
      }
    });

    const onMutation = vi.fn();
    coordinator.start([], {
      onVisible: vi.fn(),
      onMutation
    });

    const target = document.createElement("main");
    mutationCallback?.(
      [
        {
          type: "childList",
          target,
          addedNodes: [document.createElement("p")] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList
        }
      ] as MutationRecord[],
      {} as MutationObserver
    );
    coordinator.disconnect();

    expect(onMutation).toHaveBeenCalledTimes(1);
    expect(intersectionDisconnect).toHaveBeenCalledTimes(1);
    expect(mutationDisconnect).toHaveBeenCalledTimes(1);
  });
});
