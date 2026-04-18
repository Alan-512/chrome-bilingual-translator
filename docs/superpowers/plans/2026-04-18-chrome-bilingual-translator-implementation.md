# Chrome Bilingual Translator Extension Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-use Chrome Manifest V3 extension that translates reading content on the current page into Simplified Chinese on demand, preserves the source text, and renders translations lazily as the user scrolls.

**Architecture:** Use a small TypeScript extension project with a service worker for context-menu control, API requests, batching, retries, and lightweight tab coordination; a content script for block detection, observers, DOM injection, and page-owned translation state; and a plain HTML options page for API configuration. Keep rendering read-only by appending extension-owned nodes and removing them cleanly on disable, and make any tab state needed after service-worker suspension reconstructible from content-script reports or session storage.

**Tech Stack:** TypeScript, Chrome Extension Manifest V3, esbuild, Vitest, jsdom, Playwright for browser-level smoke checks, webextension-polyfill optional only if needed

---

## Assumptions

- Project root will be `/mnt/d/project/chrome-bilingual-translator`
- Plan document lives outside the project at `/mnt/d/project/chrome-bilingual-translator/docs/superpowers/plans/2026-04-18-chrome-bilingual-translator-implementation.md`
- The extension is for personal use only
- The extension will call an OpenAI-compatible API directly with user-provided credentials
- The first version targets content-heavy websites, not full app UIs

## Planned File Structure

### Project Root

- Create: `/mnt/d/project/chrome-bilingual-translator/package.json`
- Create: `/mnt/d/project/chrome-bilingual-translator/tsconfig.json`
- Create: `/mnt/d/project/chrome-bilingual-translator/esbuild.config.mjs`
- Create: `/mnt/d/project/chrome-bilingual-translator/manifest.json`
- Create: `/mnt/d/project/chrome-bilingual-translator/.gitignore`
- Create: `/mnt/d/project/chrome-bilingual-translator/README.md`
- Create: `/mnt/d/project/chrome-bilingual-translator/playwright.config.ts`

### Source Files

- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/index.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/contextMenus.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/messageRouter.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/tabSessionStore.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/permissionManager.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/index.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/pageController.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/candidateDetector.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/blockStateStore.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/observerCoordinator.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/translationRenderer.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/statusPill.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/options/index.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/options/options.html`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/options/options.css`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/config.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/storage.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/messageTypes.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/textNormalizer.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/hashText.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/translatorClient.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/promptBuilder.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/cacheStore.ts`

### Test Files

- Create: `/mnt/d/project/chrome-bilingual-translator/tests/setup/vitest.setup.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/shared/config.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/shared/translatorClient.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/background/contextMenus.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/background/messageRouter.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/background/tabSessionStore.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/content/candidateDetector.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/content/translationRenderer.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/content/statusPill.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/integration/content/pageController.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/browser/extension-smoke.spec.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/browser/fixtures/article.html`

## Implementation Notes

- Keep options UI plain HTML/CSS/TypeScript. Do not add React.
- Keep build tooling minimal. esbuild should emit `dist/background.js`, `dist/content.js`, `dist/options.js`, and a packaged `dist/options.html` that loads the built bundle.
- Keep prompt output strict JSON with block ids to avoid fragile parsing.
- Use stable `data-bilingual-translator-*` attributes for all injected DOM.
- Use `IntersectionObserver` for lazy translation and `MutationObserver` for dynamic pages.
- Use `chrome.storage.session` or equivalent reconstructible tab metadata for enabled state; do not rely on service-worker memory alone.
- Make the content script the primary owner of live page translation state and let it re-report status after worker restarts.
- Normalize the configured API base URL to an origin before permission checks or requests.
- Refresh context-menu labels on `contextMenus.onShown` using the current tab state.
- Treat jsdom tests as logic coverage only; keep at least one browser-level verification path in the plan.

### Task 1: Scaffold the extension project

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/package.json`
- Create: `/mnt/d/project/chrome-bilingual-translator/tsconfig.json`
- Create: `/mnt/d/project/chrome-bilingual-translator/esbuild.config.mjs`
- Create: `/mnt/d/project/chrome-bilingual-translator/.gitignore`
- Create: `/mnt/d/project/chrome-bilingual-translator/README.md`
- Create: `/mnt/d/project/chrome-bilingual-translator/playwright.config.ts`
- Test: `/mnt/d/project/chrome-bilingual-translator/tests/setup/vitest.setup.ts`

- [ ] **Step 1: Create the project directory and initialize git**

Run: `mkdir -p /mnt/d/project/chrome-bilingual-translator && cd /mnt/d/project/chrome-bilingual-translator && git init`
Expected: git repository initialized in `/mnt/d/project/chrome-bilingual-translator/.git`

- [ ] **Step 2: Write the package manifest with build and test scripts**

Include scripts:
- `build`: `node esbuild.config.mjs`
- `dev`: `node esbuild.config.mjs --watch`
- `test`: `vitest run`
- `test:watch`: `vitest`
- `test:browser`: `playwright test`

- [ ] **Step 3: Add TypeScript and Vitest configuration**

Set `target` to a Chrome-compatible modern baseline and configure path roots for `src` and `tests`.

- [ ] **Step 4: Add Playwright configuration for browser-level verification**

Configure Playwright to load local test fixtures and support extension smoke checks.

- [ ] **Step 5: Add `.gitignore` and README skeleton**

Ignore `dist`, `node_modules`, `.DS_Store`, and local extension artifacts.

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: dependency install succeeds and `package-lock.json` is created

- [ ] **Step 7: Commit the scaffold**

Run:
```bash
git add .
git commit -m "chore: scaffold chrome translator extension"
```

### Task 2: Define the manifest and build outputs

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/manifest.json`
- Modify: `/mnt/d/project/chrome-bilingual-translator/esbuild.config.mjs`
- Modify: `/mnt/d/project/chrome-bilingual-translator/README.md`

- [ ] **Step 1: Write the manifest with MV3 permissions and entrypoints**

Include:
- `manifest_version: 3`
- `background.service_worker: dist/background.js`
- `options_page: dist/options.html`
- `permissions: ["contextMenus", "storage", "activeTab", "scripting"]`
- `optional_host_permissions: ["https://*/*", "http://*/*"]`

Note:
- broad optional host patterns are declared only so a user-chosen API origin can be requested later
- the runtime permission grant must still be narrowed to the normalized origin the user configured

- [ ] **Step 2: Configure esbuild to output the background, content, and options assets**

Emit:
- `dist/background.js`
- `dist/content.js`
- `dist/options.js`
- `dist/options.html`
- `dist/options.css`

- [ ] **Step 3: Run the build to verify outputs exist**

Run: `npm run build`
Expected: `dist/background.js`, `dist/content.js`, `dist/options.js`, and `dist/options.html` are created without build errors

- [ ] **Step 4: Update README with load-unpacked instructions**

Document `chrome://extensions`, Developer Mode, and `Load unpacked`.

- [ ] **Step 5: Commit the manifest and build pipeline**

Run:
```bash
git add manifest.json esbuild.config.mjs README.md dist
git commit -m "chore: add manifest and build pipeline"
```

### Task 3: Implement shared config, storage, and message contracts

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/config.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/storage.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/messageTypes.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/shared/config.test.ts`

- [ ] **Step 1: Write the failing tests for config load/save behavior**

Cover:
- default settings shape
- save/load round-trip
- missing required API config detection
- base URL normalization to origin form

- [ ] **Step 2: Run the shared config tests to verify failure**

Run: `npm run test -- tests/unit/shared/config.test.ts`
Expected: FAIL because config and storage modules do not exist yet

- [ ] **Step 3: Implement config types and default values**

Include:
- `apiBaseUrl`
- `apiKey`
- `model`
- `translateTitles`
- `translateShortContentBlocks`
- fixed target language constant for Simplified Chinese

- [ ] **Step 4: Implement storage wrappers and message type contracts**

Add helper functions for `chrome.storage.sync` or `chrome.storage.local` reads and writes and define typed message payloads shared between background and content.

- [ ] **Step 5: Re-run the shared config tests**

Run: `npm run test -- tests/unit/shared/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the shared config layer**

Run:
```bash
git add src/shared tests/unit/shared
git commit -m "feat: add shared config and message contracts"
```

### Task 4: Implement the options page

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/options/index.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/options/options.html`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/options/options.css`
- Modify: `/mnt/d/project/chrome-bilingual-translator/manifest.json`
- Test: `/mnt/d/project/chrome-bilingual-translator/tests/unit/shared/config.test.ts`

- [ ] **Step 1: Extend the config tests to cover options-page expected fields**

Add assertions for:
- required API fields
- default checkbox states

- [ ] **Step 2: Build a minimal options form**

Fields:
- API Base URL
- API Key
- Model
- Translate titles checkbox
- Translate short content blocks checkbox

- [ ] **Step 3: Wire form save/load logic**

Load config on page open and save on submit with lightweight success/error feedback. Save normalized API origin metadata alongside the entered base URL so later permission requests have a reliable origin value.

- [ ] **Step 4: Build and smoke-test the options bundle**

Run: `npm run build`
Expected: options assets compile cleanly

- [ ] **Step 5: Re-run config tests**

Run: `npm run test -- tests/unit/shared/config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the options page**

Run:
```bash
git add src/options manifest.json tests/unit/shared/config.test.ts
git commit -m "feat: add extension options page"
```

### Task 5: Implement background context menus and tab session state

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/index.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/contextMenus.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/tabSessionStore.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/background/contextMenus.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/background/tabSessionStore.test.ts`

- [ ] **Step 1: Write failing tests for menu registration and tab state transitions**

Cover:
- initial `Translate current webpage` menu creation
- per-tab menu label refresh on `contextMenus.onShown`
- switch to `Show original text` when enabled
- durable per-tab enabled state tracking across worker restarts

- [ ] **Step 2: Run the background state tests to verify failure**

Run: `npm run test -- tests/unit/background/contextMenus.test.ts tests/unit/background/tabSessionStore.test.ts`
Expected: FAIL because background modules are not implemented

- [ ] **Step 3: Implement the tab session store**

Track:
- enabled/disabled
- current config snapshot
- translated block count
- pending request counts

Back the recoverable tab metadata with `chrome.storage.session` or an equivalent reconstructible store instead of service-worker memory alone.

- [ ] **Step 4: Implement context menu creation and update helpers**

Use stable menu ids, refresh the menu label in `contextMenus.onShown`, and keep menu rendering separate from click handling.

- [ ] **Step 5: Wire service worker startup registration**

Register menus on install/startup and initialize tab state cleanup hooks. Rebuild lightweight menu state from session storage when the worker wakes back up.

- [ ] **Step 6: Re-run background state tests**

Run: `npm run test -- tests/unit/background/contextMenus.test.ts tests/unit/background/tabSessionStore.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the background shell**

Run:
```bash
git add src/background tests/unit/background
git commit -m "feat: add background menu and tab session state"
```

### Task 6: Implement the translator client, prompt builder, and cache store

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/translatorClient.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/promptBuilder.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/textNormalizer.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/hashText.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/shared/cacheStore.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/shared/translatorClient.test.ts`

- [ ] **Step 1: Write failing translator client tests**

Cover:
- request body shape for OpenAI-compatible APIs
- strict JSON response parsing by block id
- timeout handling
- cache hit bypass

- [ ] **Step 2: Run translator client tests to verify failure**

Run: `npm run test -- tests/unit/shared/translatorClient.test.ts`
Expected: FAIL because translator client modules do not exist

- [ ] **Step 3: Implement prompt builder and text normalization**

Generate prompts that require:
- automatic source-language detection
- Simplified Chinese output
- valid JSON mapping `blockId -> translation`

- [ ] **Step 4: Implement hash and cache helpers**

Use normalized source text hashes as persistent cache keys and store translations in `chrome.storage.local`.

- [ ] **Step 5: Implement translator client with timeout and retry support**

Support:
- `AbortController`
- retry on 429 and transient network failure
- parse validation errors with actionable messages

- [ ] **Step 6: Re-run translator client tests**

Run: `npm run test -- tests/unit/shared/translatorClient.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the translation client layer**

Run:
```bash
git add src/shared tests/unit/shared/translatorClient.test.ts
git commit -m "feat: add translation client and cache support"
```

### Task 7: Implement candidate detection heuristics

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/candidateDetector.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/content/candidateDetector.test.ts`

- [ ] **Step 1: Write failing candidate detector tests**

Cover:
- paragraph detection
- short content-title detection
- skip navigation/button text
- skip mostly numeric or timestamp nodes
- skip extension-owned nodes

- [ ] **Step 2: Run candidate detector tests to verify failure**

Run: `npm run test -- tests/unit/content/candidateDetector.test.ts`
Expected: FAIL because candidate detector does not exist

- [ ] **Step 3: Implement visible content heuristics**

Use:
- allowed tag checks
- skip-tag checks
- text density
- visibility test
- content-title heuristics for short headings

- [ ] **Step 4: Add normalization for grouped content extraction**

Prefer a readable block string over raw fragmented text node traversal.

- [ ] **Step 5: Re-run candidate detector tests**

Run: `npm run test -- tests/unit/content/candidateDetector.test.ts`
Expected: PASS

- [ ] **Step 6: Commit candidate detection**

Run:
```bash
git add src/content/candidateDetector.ts tests/unit/content/candidateDetector.test.ts
git commit -m "feat: add content block detection heuristics"
```

### Task 8: Implement translation rendering and status pill UI

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/translationRenderer.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/statusPill.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/content/translationRenderer.test.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/content/statusPill.test.ts`

- [ ] **Step 1: Write failing renderer and status pill tests**

Cover:
- insert translation below source block
- do not mutate source text
- clean removal of extension-owned nodes
- translated count display update
- lightweight failed state display

- [ ] **Step 2: Run renderer tests to verify failure**

Run: `npm run test -- tests/unit/content/translationRenderer.test.ts tests/unit/content/statusPill.test.ts`
Expected: FAIL because renderer and pill modules do not exist

- [ ] **Step 3: Implement translation node rendering**

Use stable classes and `data-bilingual-translator-*` attributes for:
- translation wrapper
- source-to-translation linkage
- fallback tight layout marker

- [ ] **Step 4: Implement the floating status pill**

Support:
- idle
- translating
- translated count
- error/retry summary

- [ ] **Step 5: Re-run renderer and pill tests**

Run: `npm run test -- tests/unit/content/translationRenderer.test.ts tests/unit/content/statusPill.test.ts`
Expected: PASS

- [ ] **Step 6: Commit render and status UI**

Run:
```bash
git add src/content/translationRenderer.ts src/content/statusPill.ts tests/unit/content
git commit -m "feat: add translation rendering and status pill"
```

### Task 9: Implement the observer coordinator and page controller

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/blockStateStore.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/observerCoordinator.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/pageController.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/content/index.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/integration/content/pageController.test.ts`

- [ ] **Step 1: Write failing integration tests for page activation and cleanup**

Cover:
- initial scan queues visible content
- `IntersectionObserver` adds near-viewport blocks
- duplicate blocks are not re-queued
- content script can re-report active state after background restart
- disable flow removes translations and disconnects observers

- [ ] **Step 2: Run page controller integration tests to verify failure**

Run: `npm run test -- tests/integration/content/pageController.test.ts`
Expected: FAIL because page controller modules are not implemented

- [ ] **Step 3: Implement block state tracking**

Store per-block states:
- `queued`
- `pending`
- `translated`
- `failed`
- `skipped`

- [ ] **Step 4: Implement observer coordination**

Wire:
- `IntersectionObserver` for lazy translation
- `MutationObserver` for dynamic page rescans

- [ ] **Step 5: Implement the page controller**

Handle:
- activation
- queue creation
- message exchange with background
- render responses
- active-state reporting back to background for menu recovery
- disable cleanup

- [ ] **Step 6: Re-run page controller integration tests**

Run: `npm run test -- tests/integration/content/pageController.test.ts`
Expected: PASS

- [ ] **Step 7: Commit content orchestration**

Run:
```bash
git add src/content tests/integration/content
git commit -m "feat: add content observer and page controller flow"
```

### Task 10: Implement background message routing and API orchestration

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/messageRouter.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/src/background/permissionManager.ts`
- Modify: `/mnt/d/project/chrome-bilingual-translator/src/background/index.ts`
- Modify: `/mnt/d/project/chrome-bilingual-translator/src/options/index.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/unit/background/messageRouter.test.ts`

- [ ] **Step 1: Write failing tests for message routing and permission checks**

Cover:
- content-script translation request dispatch
- missing config rejection
- optional host permission request path from a user-triggered flow
- origin normalization before permission comparison
- translated count update in tab session store

- [ ] **Step 2: Run message router tests to verify failure**

Run: `npm run test -- tests/unit/background/messageRouter.test.ts`
Expected: FAIL because router and permission manager are not implemented

- [ ] **Step 3: Implement API host permission handling**

Normalize the configured base URL to origin form and request access for that origin from a user-triggered flow before the first fetch if not already granted.

- [ ] **Step 4: Implement translation request batching and routing**

Send candidate block batches through the translator client and map results back to block ids.

- [ ] **Step 5: Wire permission requests into both valid user-gesture entry points**

Support:
- options-page save flow
- translate context-menu click flow

- [ ] **Step 6: Update tab session counts and menu state**

Reflect:
- enabled/disabled
- translated blocks total
- pending count

Ensure per-tab menu labels are refreshed from current tab state instead of a single global label.

- [ ] **Step 7: Re-run message router tests**

Run: `npm run test -- tests/unit/background/messageRouter.test.ts`
Expected: PASS

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all unit and integration tests pass

- [ ] **Step 9: Commit the end-to-end messaging flow**

Run:
```bash
git add src/background src/options/index.ts tests/unit/background
git commit -m "feat: add translation orchestration and permissions"
```

### Task 11: Browser-level smoke verification

**Files:**
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/browser/extension-smoke.spec.ts`
- Create: `/mnt/d/project/chrome-bilingual-translator/tests/browser/fixtures/article.html`

- [ ] **Step 1: Write a browser-level smoke test**

Cover:
- options page loads from the emitted asset path
- a representative fixture page can load and receive extension injection
- translation rendering and cleanup can be observed in a real browser DOM

- [ ] **Step 2: Run the browser smoke test**

Run: `npm run test:browser`
Expected: PASS on the smoke path, or a concrete browser-level failure to fix before manual verification

- [ ] **Step 3: Commit browser-level verification coverage**

Run:
```bash
git add tests/browser playwright.config.ts
git commit -m "test: add browser smoke verification"
```

### Task 12: Manual extension verification in Chrome

**Files:**
- Modify: `/mnt/d/project/chrome-bilingual-translator/README.md`

- [ ] **Step 1: Build the production bundle**

Run: `npm run build`
Expected: a clean `dist/` folder ready for loading in Chrome

- [ ] **Step 2: Load the unpacked extension in Chrome**

Open `chrome://extensions`, enable Developer Mode, and load `/mnt/d/project/chrome-bilingual-translator`

- [ ] **Step 3: Verify options-page configuration**

Save:
- a valid API base URL
- a valid API key
- a valid model id

- [ ] **Step 4: Verify behavior on representative pages**

Check:
- article page
- Product Hunt-style page
- comments page

Expected:
- right-click menu appears
- translation begins only after click
- content titles translate
- UI action labels do not get translated
- translations appear below source blocks
- scroll loads more translations
- `Show original text` removes injected translations

- [ ] **Step 5: Document known limitations and troubleshooting**

Add a short section to `README.md` covering:
- API permission prompts
- unsupported sites
- likely rate-limit failures

- [ ] **Step 6: Commit the verified MVP**

Run:
```bash
git add README.md dist
git commit -m "docs: finalize verified extension usage notes"
```

## Acceptance Checklist

- [ ] The extension can be loaded through `chrome://extensions` using `Load unpacked`
- [ ] The options page persists API configuration
- [ ] The emitted `dist/options.html` loads correctly as the extension options page
- [ ] Right-click triggers translation only on demand
- [ ] Source text remains visible
- [ ] Content titles translate even when short
- [ ] UI action labels are skipped by default
- [ ] Viewport-based lazy translation works
- [ ] Dynamic content can be translated without duplicate insertion
- [ ] Per-tab context-menu labels stay correct when switching tabs
- [ ] Translation state can recover cleanly after MV3 service-worker suspension
- [ ] `Show original text` removes extension DOM cleanly
- [ ] Tests pass, including a browser-level smoke test, and manual verification covers at least three page types

## Execution Notes

- Do not widen the scope to full-site UI localization in V1.
- Keep DOM insertion conservative. If a layout looks unstable, use the tighter fallback render path.
- If prompt-following from the chosen model is unreliable, add a validation-and-repair parse step before expanding scope.
- Prefer small commits after each task. Do not batch the entire implementation into one change.
