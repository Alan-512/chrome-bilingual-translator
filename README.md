# Chrome Bilingual Translator

A Chrome Manifest V3 extension for on-demand bilingual webpage translation.

It keeps the original text on the page and inserts translated text below the source content. Translation is triggered manually from the browser context menu and progresses as you browse visible content.

## What It Does

- **Full Page Bilingual Translation**: Manually translates the current webpage from the right-click menu, keeping the original text visible and inserting the selected target language cleanly below it.
- **Selection Translation & Explain (with Shadow DOM Piercing)**: Select any word or block of text, right-click, and choose to instantly translate it or get a contextual explanation. It recursively pierces Shadow DOM boundaries to support selections inside custom Web Components and nested comment feeds, rendering inside a beautiful, non-intrusive floating card that auto-handles z-indexes and screen boundaries.
- **Parallel Batch Translation & High-Throughput**: Employs an aggressive batching algorithm that packages up to 48 text blocks in a single translation request, running multiple streams in parallel to provide blistering translation speeds on content-heavy pages without triggering rate limits.
- **Dynamic Scroll & Re-render Support**: Dynamically translates newly visible content as you scroll down (lazy translation) and recovers translation elements automatically if a dynamic page re-renders.
- **Dynamic Target Language Switch & Isolated Cache**: Caching is fully isolated per target language. Modifying your target language in settings instantly triggers a clean page reactivation and re-translates all visible content in real-time with no page refresh required, preventing translation cache cross-contamination.
- **Context-Aware Flex & Grid Layout Protection**: Identifies flexbox, grid, and list containers, inserting translations inline within elements to prevent layout squeezing, text truncation, or vertical single-character text stack bugs.
- **Smart Visibility Detection**: Accurately checks responsive stylesheets to only translate elements currently visible on your viewport width, completely skipping hidden layout columns or duplicate menus.
- **Robust Rendering & Dynamic Page Stability**: Engineered to support highly interactive and layout-heavy modern websites:
  - **Jitter-Free Mutation Protection**: Neutralizes infinite DOM mutation/reflow loops on dynamic layouts and single-page applications (SPAs).
  - **Virtual & Mock Tag Preservation**: Native support for custom layout components, mock tag wrappers (e.g., `data-as`), and isolated container zones.
- **Wide AI Provider Support & Adaptive Parameter Tuning**: Seamlessly supports both standard `OpenAI Compatible` endpoints and native `Google Gemini` APIs. Features intelligent endpoint routing (preventing 404 errors) and dynamically adapts advanced API settings (like automatically adjusting reasoning budgets or `thinkingConfig` parameters) based on the model provider.

## Webpage Coverage

The extension is designed as a general webpage translation tool.

It works on normal article pages, feed-style pages, documentation pages, repository pages, and many dynamic websites. Internally it combines generic content detection with extra layout handling for more complex pages, but the product itself is meant to be used as a general-purpose webpage translator rather than a site-specific tool.

## Install For Yourself

### Prerequisites

- Node.js 18+
- Google Chrome

### Steps

1. Open the project directory:

   ```bash
   cd /path/to/chrome-bilingual-translator
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the extension:

   ```bash
   npm run build
   ```

4. Open `chrome://extensions`
5. Turn on `Developer mode`
6. Click `Load unpacked`
7. Select the generated `release` folder instead of the project root

After that, the extension is installed locally.

## Repository Layout

The public repository keeps source files, assets, and tests only.

- `src/`: extension source code
- `assets/`: icon assets
- `tests/`: unit, integration, and browser regression tests
- `dist/`: generated runtime bundles after `npm run build`
- `release/`: generated unpacked extension after `npm run build`

Notes:

- `dist/` and `release/` are build outputs and are intentionally ignored by git
- local artifacts such as `node_modules/`, `test-results/`, and `playwright-report/` are also ignored
- provider API keys are never committed; configure them locally in the extension options page

## Share With Other People

### Install From A GitHub Release

For non-developer testers, use the prebuilt release zip:

1. Open the latest GitHub Release.
2. Download `chrome-bilingual-translator-v0.1.0-alpha.1.zip`.
3. Unzip it.
4. Open `chrome://extensions` in Chrome.
5. Turn on `Developer mode`.
6. Click `Load unpacked`.
7. Select the unzipped folder that contains `manifest.json`.
8. Open the extension options page and configure your own API provider, API key, model, and target language.

This alpha build is intended for small-scale testing. It is not published to the Chrome Web Store yet, so Chrome requires loading it through Developer mode.

### Build And Share Manually

For small-scale sharing, the practical way is:

1. Run:

   ```bash
   npm install
   npm run build
   ```

2. Zip the generated `release` directory only
3. Send that folder to the other person
4. They load it with `Load unpacked` in `chrome://extensions`

This is easier than asking them to build from scratch, and it avoids shipping the full development workspace with `node_modules`, tests, and other non-extension files. Users still need to configure their own API.

If you make the repository public, other developers can also clone it, run `npm install && npm run build`, and then load the generated `release/` folder in Chrome.

## Configuration

Open the extension's `Extension options` page and fill in:

- `Provider`
- `API Base URL`
- `API Key`
- `Model`
- `Target language`

Currently supported target languages:

- `简体中文`
- `繁體中文`
- `English`
- `日本語`
- `한국어`
- `Français`
- `Deutsch`
- `Español`
- `Português`
- `Русский`
- `العربية`

### Option 1: OpenAI Compatible

Use this for OpenAI-style APIs that accept:

- `Authorization: Bearer ...`
- OpenAI-compatible request bodies

Example fields:

- `Provider`: `OpenAI Compatible`
- `API Base URL`: your API base endpoint (e.g. `https://api.openai.com/v1` or `https://integrate.api.nvidia.com/v1`). The extension automatically handles path suffixes and routes requests correctly to `/chat/completions`, preventing 404 path errors.
- `API Key`: your API key
- `Model`: your model name

Notes:

- Remote APIs must use `HTTPS`
- `HTTP` is only allowed for `localhost` / `127.0.0.1`

### Option 2: Google Gemini

Use this for Gemini via the native Gemini API.

Recommended example:

- `Provider`: `Google Gemini`
- `API Base URL`: `https://generativelanguage.googleapis.com/v1beta`
- `API Key`: your Gemini API key
- `Model`: for example `gemini-3.1-flash-lite-preview`

The extension will call Gemini's native `generateContent` endpoint in this mode.

## How To Use

### 1. Full Page Translation
1. Open a webpage.
2. Right-click anywhere on the page.
3. Click **`Translate current webpage`**.

What happens next:
- The extension translates visible content first.
- As you scroll, newly visible content continues translating automatically (lazy translation).
- The original text stays fully in place, with the selected target-language translation neatly inserted below it.

### 2. Selection Translate & Explain
1. Highlight any word, phrase, or paragraph on a page.
2. Right-click the highlighted text.
3. Hover over **`Bilingual Translation Selection`** and choose:
   - **`Translate Selection`**: Instantly shows the bilingual translation in a beautiful floating card.
   - **`Explain Selection`**: Translates and provides deep linguistic/semantic explanation of the selected text.

## Settings

The options page includes:

- `Target language`
- `Translate titles`
- `Translate short content blocks`
- `Debug mode`
- `Test API`

### Debug Mode

When `Debug mode` is enabled, the content script prints structured logs in DevTools Console with a `[bilingual]` prefix.

This is useful for diagnosing:

- candidate detection
- batching
- rerender recovery
- translation failures

## Common Questions

### Why does right-click translation do nothing?

Usually one of these:

- The API is not configured yet
- The API configuration is invalid
- The page is highly dynamic and still loading
- The page needs a refresh after the extension was reloaded

Check the extension options page first and use `Test API`.

### Will clearing browser cache erase my settings?

Normally no.

Settings are stored in Chrome extension storage, not regular webpage cache.

They may be lost if:

- you uninstall the extension
- you delete Chrome profile data
- you use a different Chrome profile

### Why do users still need their own API key?

Because the extension is just the client. The actual translation requests are sent to the provider you configure.

If you share the extension with others, they should normally use:

- their own API key
- their own API endpoint
- their own model

### Why are some sites more stable than others?

Modern sites often rerender content aggressively, virtualize long lists, or clamp content with custom layout rules. The extension is built to work broadly across normal webpages and many dynamic pages, but extremely custom frontends can still behave differently from simpler document-style pages.

## Development Commands

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

This writes runtime bundles to `dist/` and a loadable extension package to `release/`.

Run unit + integration tests:

```bash
npm test
```

Run browser-level regression checks:

```bash
npm run test:browser
```

## Project Status

This project is currently at a usable self-hosted MVP stage:

- main functionality is complete
- generic webpage translation architecture is in place
- browser regression coverage exists for key dynamic page patterns

It is usable now, but still open to further polish and broader site coverage.
