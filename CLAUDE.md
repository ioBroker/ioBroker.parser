# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run build           # Full build: TypeScript compilation + admin UI
npm run build:tsc       # TypeScript only (src/ -> build/)
npm run lint            # ESLint (flat config, eslint.config.mjs)
npm test                # All tests (package + integration)
npm run test:package    # Package file validation only
npm run test:integration # Parser integration tests only (mocha)
npm run admin-build     # Build admin UI only (src-admin/ -> admin/custom/)
npm run npm             # Install deps in root + src-admin/
```

Single test file: `npx mocha test/testParser.js --exit`

TypeScript compilation uses `tsconfig.build.json` (extends `tsconfig.json` with `noEmit: false`).

## Architecture

**ioBroker adapter** (daemon mode) that polls URLs, local files, ioBroker states/files/logs at configurable intervals and extracts values using regex.

### Backend (`src/main.ts` -> `build/main.js`)

Single-file adapter extending `@iobroker/adapter-core` Adapter class. Core flow:

1. On ready: reads all configured states under `parser.<instance>`, builds polling timers grouped by interval
2. Per tick: fetches each unique URL/file/state, caches response, runs regex extraction on all rules sharing that source
3. Extracted values undergo type coercion (number/boolean/string/array), optional factor/offset math, optional HTML entity decoding
4. Results written via `setForeignState` with quality codes on errors

**Source types** (determined by URI prefix in `link` field):
- `http://` / `https://` - HTTP via axios with per-host request queue and configurable delay
- Bare path - local file via `node:fs`
- `iobstate://` - read ioBroker state value
- `iobfile://` - read ioBroker file
- `ioblog://` - subscribe to ioBroker log messages

Types are defined in `src/types.d.ts` (`ParserAdapterConfig`, `ParserNative`, `ParserStateObject`).

### Admin UI (`src-admin/` -> `admin/custom/`)

React + Material-UI configuration interface built with Vite and module federation. Exposes `ConfigCustomParserSet` component. Build pipeline orchestrated by `tasks.js` (clean -> npm install -> vite build -> copy to admin/).

The `admin/jsonConfig.json` defines the adapter settings page schema (poll interval, timeouts, etc.). The custom component handles the per-state rule table.

### Key path note

Compiled `build/main.js` is 3 directory levels deep from the project root. Local file path resolution in the adapter uses `../../../` relative to `__dirname` to reach the ioBroker data directory.

## CI

GitHub Actions (`.github/workflows/test-and-release.yml`):
- Lint: Ubuntu, Node 22
- Adapter tests: matrix of Ubuntu/Windows/macOS x Node 20/22/24
- Deploy: on version tags, publishes to npm with Sentry release

## Code Style

- ESLint flat config based on `@iobroker/eslint-config`
- Prettier config from `@iobroker/eslint-config/prettier.config.mjs`
- `src-admin/` is currently excluded from linting (TODO in eslint config)
- Tests are excluded from linting

## Config Structure

Global adapter config (`io-package.json` native defaults): `pollInterval`, `requestTimeout`, `requestDelay`, `acceptInvalidCertificates`, `useInsecureHTTPParser`, `updateNonChanged`, `userAgent`.

Per-state config (stored in each state object's `native`): `link`, `interval`, `regex`, `item`, `factor`, `offset`, `substitute`, `substituteOld`, `comma`, `parseHtml`, `type`, `logLevel`, `logSource`.
