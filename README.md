# Chrome Bilingual Translator

A Chrome Manifest V3 extension for on-demand bilingual webpage translation.

It keeps the original text on the page and inserts Simplified Chinese translations below the source content. Translation is triggered manually from the browser context menu and progresses as you browse visible content.

## What It Does

- Manually translates the current webpage from the right-click menu
- Keeps the source text visible and inserts Chinese below it
- Supports lazy translation for visible content as you scroll
- Supports dynamic pages that rerender while you browse
- Supports:
  - `OpenAI Compatible`
  - `Google Gemini`

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
7. Select the project folder

After that, the extension is installed locally.

## Share With Other People

For small-scale sharing, the practical way is:

1. Run:

   ```bash
   npm install
   npm run build
   ```

2. Zip the whole project directory
3. Send that folder to the other person
4. They load it with `Load unpacked` in `chrome://extensions`

This is easier than asking them to build from scratch, but they still need to configure their own API.

## Configuration

Open the extension's `Extension options` page and fill in:

- `Provider`
- `API Base URL`
- `API Key`
- `Model`

The target language is fixed to Simplified Chinese.

### Option 1: OpenAI Compatible

Use this for OpenAI-style APIs that accept:

- `Authorization: Bearer ...`
- OpenAI-compatible request bodies

Example fields:

- `Provider`: `OpenAI Compatible`
- `API Base URL`: your full compatible endpoint
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

1. Open a webpage
2. Right-click anywhere on the page
3. Click `Translate current webpage`

What happens next:

- The extension translates visible content first
- As you scroll, newly visible content continues translating
- The original text stays in place
- The Chinese translation is inserted below it

## Settings

The options page includes:

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
