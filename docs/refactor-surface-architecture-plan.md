# Surface Architecture Refactor Plan

## Goal

Move candidate detection away from one adapter per website and toward a layered architecture:

- shared DOM/text/candidate utilities
- page-type surfaces
- thin site profiles
- temporary collector implementations kept only while moving detailed logic into surfaces/profiles

This keeps the translator usable on modern dynamic pages such as X/Twitter without turning every new website into a full custom adapter.

## Phases

### Phase 0 — Baseline and diagnostics

- Preserve current behavior.
- Add candidate-level debug diagnostics where useful.
- Keep existing GitHub, Reddit, Google Search, Product Hunt, and OpenRouter tests as regression gates.

### Phase 1 — Extract shared core utilities

- Extract text normalization and numeric/timestamp filtering.
- Extract DOM visibility and extension-owned checks.
- Extract structured text grouping for tables, description lists, and nested blockquotes.
- Keep output behavior unchanged.

### Phase 2 — Introduce surface registry

- Introduce a `SurfaceContext` and `SurfaceCandidateCollector` contract.
- Route all candidate collection through the surface registry.
- Add `genericSurface` for the existing generic fallback path.
- Keep existing adapters in place during migration.

### Phase 3 — Modern generic detection

- Add visible text-node based fallback for modern `div`/`span` pages.
- Add scoring and action-chrome filtering.
- Enable conservatively for generic pages first.

### Phase 4 — Social feed surface

- Add `socialFeedSurface`.
- Add thin profiles for X/Twitter and later Reddit.
- Translate post bodies, quote bodies, and replies while skipping navigation, buttons, handles, timestamps, counts, and right-side chrome.

### Phase 5 — Migrate existing adapters

- Migrate Reddit to `socialFeedSurface`.
- Migrate Google Search to `searchResultsSurface`.
- Migrate GitHub to `docsRepoSurface`.
- Migrate Product Hunt/OpenRouter to `productSurface`.
- Remove old adapter files only after tests prove parity.

## Initial implementation slice

The first implementation slice covers Phase 0, Phase 1, and the Phase 2 bridge:

- shared text utility module
- shared DOM visibility module
- shared structured text module
- surface context and registry
- surface registry bridge
- generic surface wrapper

This creates the new extension point while keeping current behavior stable before X-specific social feed work begins.

## Current progress

- Added shared candidate type module.
- Added shared text, DOM visibility, and structured-text core modules.
- Introduced the first surface registry bridge.
- Split the generic fallback collector into `genericSurface` so candidate detection now orchestrates surfaces instead of owning fallback details.
- Routed all candidate collection through surface modules.
- Routed Google Search through `searchResultsSurface`, GitHub through `docsRepoSurface`, and Product Hunt/OpenRouter through `productSurface`.
- Removed the legacy site adapter bridge; Reddit now routes through `socialFeedSurface` with selectors extracted into `redditProfile`.
- Moved the remaining collector implementations out of `siteAdapters` and into their owning surface modules.
- Added the first `socialFeedSurface` slice for X/Twitter-style tweet bodies.
- Added an X/Twitter site profile with post body and action chrome selectors.
- Added unit regression coverage for X page classification and tweet body candidate collection.
- Added a browser fixture and smoke test for X-style post detail rendering; local execution requires a Playwright Chromium install.
- Extended the X browser fixture with a reused-node mutation path and smoke coverage for retranslation after virtualized text replacement.
- Social feed rendering now avoids loading placeholders, host-managed virtual-list transform rewrites, and cross-copy stale translation removal to reduce scroll-time flicker on X/Reddit.

