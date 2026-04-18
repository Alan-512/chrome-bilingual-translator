# Chrome Bilingual Translator Extension Design

## Summary

Build a Chrome Manifest V3 extension for personal use that translates the current webpage into Simplified Chinese on demand. The extension is triggered manually from the browser context menu, preserves the original text, and inserts the Chinese translation below the source content by default. Translation progresses lazily as the user scrolls, similar to mature bilingual webpage translation extensions.

The first version targets content-heavy webpages rather than full-site UI localization. It should translate content titles and reading content, avoid short UI strings, and recover the original page cleanly when disabled.

## Goals

- Manual trigger from the right-click menu on the current page
- Preserve original text and render Simplified Chinese below it
- Translate content progressively as the user browses the page
- Automatically detect source language and always translate to Simplified Chinese
- Support OpenAI-compatible APIs configured directly by the user
- Restore the original page by removing only extension-injected nodes

## Non-Goals

- Auto-translate every page on navigation
- Public distribution or secure shared-key management
- Full UI localization of websites
- PDF, image OCR, subtitle, or iframe cross-origin translation
- Special support for highly interactive app surfaces such as Notion, Gmail, Figma, or canvas-heavy apps

## User Experience

### Entry Points

- Right-click menu item: `Translate current webpage`
- Right-click menu item after activation: `Show original text`

### Translation Behavior

- Translation is not automatic on page load
- Once started, visible content is translated first
- As the user scrolls, newly visible content is detected and translated
- The original text remains in place
- Chinese translation is rendered below the original block by default

### Status Feedback

Show a small floating status pill in the top-right corner of the page:

- `Translating`
- `Translated N blocks`
- `Show original`
- lightweight retry state when some blocks fail

The pill is primarily for self-use visibility and debugging, not a complex control panel.

## Product Decisions

### Translation Scope

The product is optimized for reading enhancement, not whole-site chrome translation.

Translate by default:

- content titles, even if they are only one to three words
- body paragraphs
- list items with content meaning
- comment bodies
- product descriptions and summaries

Do not translate by default:

- navigation labels
- action buttons
- subscribe/sign-in/share/upvote style UI text
- timestamps, counters, usernames, and badges
- code blocks and technical literals

This is not a pure length-based rule. A short content title should translate; a short UI label should not.

### Rendering Strategy

Primary rendering mode:

- inject a translation block directly below the original content block

Fallback rendering mode for unstable layouts:

- use a lighter inline translation block with conservative spacing

The extension does not rewrite or replace original text. It only appends extension-owned DOM nodes.

## Architecture

### Components

1. `manifest.json`
   Defines MV3 service worker, content script injection entry, packaged options page asset, context menu permissions, storage permissions, and optional host permissions for API access.

2. `service worker`
   Owns context menu actions, API requests, batching, caching, retries, and message routing. It may hold short-lived coordination state, but must not be the only source of truth for translation state because MV3 service workers can be suspended and restarted.

3. `content script`
   Runs in the page, identifies translatable blocks, observes viewport and DOM changes, injects translation nodes, manages page-local state, and removes injected nodes when disabled.

4. `options page`
   Minimal configuration UI for:
   - API Base URL
   - API Key
   - Model
   - translate short content blocks toggle
   - translate titles toggle
   The options page must be emitted as a packaged extension asset and load the built JavaScript bundle at runtime.

5. `shared translator client`
   Encapsulates OpenAI-compatible request and response handling, timeout control, structured JSON enforcement, retry policy, and result normalization.

## Permissions Model

Use the smallest practical permission set:

- `contextMenus`
- `storage`
- `activeTab`
- `scripting`
- `optional_host_permissions`

Rationale:

- `activeTab` allows user-initiated operation on the current page
- `optional_host_permissions` allows requesting access only to the configured API origin instead of broad network access

Permission rules:

- the saved API Base URL must be normalized to an origin before permission checks
- host permissions are origin-scoped, not path-scoped
- permission requests must happen during a user gesture, such as saving options or clicking the translate context-menu action
- the extension must not assume a background-only flow can request permissions silently later
- if the product allows arbitrary OpenAI-compatible endpoints, the manifest may need broad optional host patterns so a specific origin can be requested later; the runtime grant should still be limited to the one origin the user chose

## Data Flow

### Start Translation

1. User clicks `Translate current webpage` from the context menu
2. Service worker verifies that the configured API origin is permitted, or requests permission from the same user-triggered flow if needed
3. Service worker injects or activates the content script for the current tab
4. Content script scans the page and builds an initial queue of candidate blocks
5. Visible candidates are sent in batches to the service worker
6. Service worker calls the OpenAI-compatible API
7. Results are returned to the content script
8. Content script injects translation nodes below the source blocks

### Context Menu Labeling

The context menu label must be refreshed from the current tab state when the menu is shown, rather than treated as one global toggle label.

Expected behavior:

- a tab with translation inactive shows `Translate current webpage`
- a tab with translation active shows `Show original text`
- switching tabs must not leave the wrong menu label visible

### Scroll / Dynamic Page Updates

1. `IntersectionObserver` notices candidate blocks entering or approaching the viewport
2. Newly eligible blocks are queued for translation
3. `MutationObserver` catches SPA navigation or lazy-loaded content
4. New blocks are filtered, deduplicated, and observed

### Restore Original Page

1. User clicks `Show original text`
2. Content script disconnects observers
3. All extension-injected translation nodes are removed
4. Page-local translation markers and pending state are cleared

## DOM Block Detection

### Candidate Block Types

Prioritize these elements or semantic containers:

- `p`
- `li`
- `blockquote`
- `h1` to `h6`
- article body containers
- content card text containers
- comment body containers

### Filters

Skip these element types entirely:

- `nav`
- `header`
- `footer`
- `aside`
- `button`
- `input`
- `textarea`
- `select`
- `code`
- `pre`
- `svg`
- `canvas`

Skip nodes that are:

- not visible
- too structurally noisy
- mostly links or icons
- mostly numbers, timestamps, or counters
- extension-owned nodes

### Semantic Rule

Candidate evaluation uses multiple signals:

- element/tag type
- visibility
- text density
- whether the element looks like content or UI
- surrounding container role
- title heuristics for short meaningful headings

Length alone is not the decision boundary.

## Rendering Model

Each translated block gets:

- a stable internal block id
- an injected translation node with extension-specific classes
- `data-*` attributes linking source and translation nodes

### Default Layout

- source block remains untouched
- translation block is inserted immediately after source block
- translation style is visually subordinate but easy to read

### Fallback Layout

Use the fallback when:

- the container is too narrow
- the source belongs to a complex card/grid structure
- the source is short but still content-relevant

The fallback still keeps translation adjacent to the source, but uses tighter presentation to reduce layout breakage.

## Translation API Strategy

### API Shape

The extension calls an OpenAI-compatible chat/completions-style API configured by the user.

Prompt requirements:

- detect source language automatically
- translate to Simplified Chinese
- preserve meaning and concise structure
- return strict JSON aligned with input block ids

### Request Path

- content script sends batches of block payloads to the service worker
- service worker performs network requests
- service worker returns structured translations back to the content script

### Why the Service Worker Owns API Calls

- centralized retry and timeout handling
- centralized key handling
- easier request throttling and cache reuse
- cleaner page environment

### Permission Timing

The extension must request optional host permission during a real user action. Two valid entry points:

- the user saves API settings in the options page
- the user clicks `Translate current webpage` and permission is still missing

The runtime should normalize the configured base URL to origin form before comparing or requesting permissions.

## Batching, Caching, and Cost Control

### Batching

Translate multiple nearby blocks together per request, for example 5 to 20 blocks depending on size.

### Session Cache

Keep a per-tab cache for already translated blocks during the active browsing session.

### Persistent Cache

Use normalized text hashes as cache keys so repeated text across revisits can be reused.

### Cost Controls

- translate only blocks that enter the viewport or near-viewport
- avoid duplicate translation of identical text
- split extra-long blocks before sending, while merging for render
- skip low-value UI fragments

## Failure Handling

### Network/API Failures

- timeout requests
- retry transient failures with exponential backoff
- mark persistent failures as failed without blocking the page

### Per-Block Failure UX

Failed blocks should show a minimal retry affordance rather than a disruptive error panel.

### Degradation

If translation of some blocks fails:

- successfully translated blocks remain visible
- failed blocks stay in original-only form until retried

## State Model

### Tab-Level State

Shared across the service worker and content script:

- enabled/disabled
- current config snapshot
- pending request batches
- session cache references

State rules:

- the content script is the primary runtime owner of whether a page is actively translated
- the service worker may mirror lightweight tab metadata for menu refresh and request coordination
- any state needed after service-worker suspension must be reconstructible from the content script or persisted storage
- service-worker memory must not be the sole source of truth

### Page-Level Block State

Managed by the content script:

- `queued`
- `pending`
- `translated`
- `failed`
- `skipped`

These states prevent duplicate requests and duplicate DOM insertion.

## Options and Defaults

First version settings:

- API Base URL
- API Key
- Model
- translate titles: enabled by default
- translate short content blocks: enabled by default

Fixed defaults:

- target language: Simplified Chinese
- render mode: below-source bilingual mode

## Installation and Usage

### Local Installation

This extension is intended for personal use and can be loaded directly into Chrome without publishing it to the Chrome Web Store.

After implementation is complete:

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the local extension project directory

Chrome will then load the extension from the local filesystem.

The selected directory must contain the final packaged assets referenced by `manifest.json`, including the emitted options page HTML and bundled scripts.

### First-Time Setup

After the extension is loaded:

1. Open the extension options page
2. Fill in:
   - API Base URL
   - API Key
   - Model
3. Save the settings
4. Grant access to the configured API origin if Chrome prompts for optional host permission

The permission prompt should be tied to either saving the API settings or the first translation action, and should correspond to the normalized API origin.

### Daily Usage

Normal use flow:

1. Open a webpage with content to read
2. Right-click anywhere on the page
3. Click `Translate current webpage`
4. Wait for visible content blocks to begin rendering with Simplified Chinese below the original text
5. Continue scrolling to translate newly visible blocks
6. Right-click and choose `Show original text` to remove the injected translations

### Expected Operational Model

- Translation begins only after explicit user action
- Translation progresses lazily based on viewport visibility
- The original page remains readable throughout
- The local extension directory must remain available if using `Load unpacked`

## Supported Surfaces in V1

Best supported:

- blogs
- article pages
- documentation
- product detail pages
- Product Hunt-style listing/detail pages
- comment-heavy content pages

Out of primary scope:

- Gmail
- Notion
- Figma
- web apps with heavy virtualization
- canvas-rendered interfaces

Unsupported:

- image text OCR
- PDFs
- video subtitles
- cross-origin iframe internals

## Testing Strategy

### Functional Testing

- context menu starts translation on the active page
- original text remains visible
- translations render below the correct source block
- scroll-triggered translation works
- toggling back to original removes injected nodes cleanly

### Browser-Level Verification

At least one browser-level verification path is required in addition to unit tests. Browser-level checks should cover:

- real content-script injection into a loaded page
- context-menu-triggered activation
- observer-driven translation as the viewport changes
- cleanup when `Show original text` is triggered
- options-page asset loading and config persistence

### Heuristic Testing

Validate block classification on representative pages:

- article page
- documentation page
- Product Hunt-style product detail page
- comment thread page

### Failure Testing

- invalid API key
- API timeout
- rate limiting
- malformed API response
- dynamic SPA content load after activation
- missing optional host permission for the configured API origin

## Risks

1. Misclassifying short UI text as content titles
2. Layout disruption in dense card/grid containers
3. Duplicate translation on complex SPA updates
4. API response drift if the model does not follow strict JSON instructions
5. Personal API key exposure in a local self-use extension

## Recommended Delivery Order

1. Build MV3 shell: manifest, service worker, options page, content script wiring
2. Implement context menu activation and toggle-off restore flow
3. Implement candidate block detection and block state tracking
4. Implement viewport-driven queueing with `IntersectionObserver`
5. Implement service-worker translation client and batching
6. Implement DOM injection and cleanup
7. Add `MutationObserver` support for dynamic pages
8. Add session cache, persistent cache, and retry logic
9. Add floating status pill
10. Validate on representative real pages and tune heuristics
