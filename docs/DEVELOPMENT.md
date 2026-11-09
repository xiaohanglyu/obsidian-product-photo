# Development

This page is for contributors building or testing Product Photo. To install the ready-to-use plugin without a toolchain, follow [Install](../README.md#install).

## Build from source

Install Node.js 22.12 or later and npm, then run:

```sh
git clone https://github.com/xiaohanglyu/obsidian-product-photo.git
cd obsidian-product-photo
npm ci
npm run build
```

The build creates `main.js` and a generated `ocr/` folder in the repository root. Language packages must be installed, including development dependencies. Obsidian loads that file, not the TypeScript source. `npm run dev` rebuilds when source files change.

## Install a local build

Use a separate development vault. Run:

```sh
npm run package
```

Copy the resulting `dist/product-photo-0.2.0/product-photo/` folder into `<development-vault>/.obsidian/plugins/`. Restart Obsidian if this is a new installation, then enable Product Photo under Community plugins. For an already installed build, disable and re-enable Product Photo after copying updated files. Do not reload unrelated plugins.

Configure **Photo section heading** as `Product photos` before using the [sample note](../examples/Product.md). The initial heading value is currently localized; documentation examples explicitly configure it rather than assume it is English.

## Tests

```sh
npm test
npm run build
```

Unit and adapter tests cover note updates, input validation, import cleanup, naming, and locking. They use an Obsidian test double where the host API is required.

Browser tests exercise actual image decoding, WebP encoding, padding, and EXIF orientation:

```sh
npx playwright install chromium
npm run test:browser
```

To reuse a standalone test Chromium executable, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its absolute path. Browser tests use a temporary profile.

Validate clipboard behavior, both note view modes, native autosave, and Bases rendering in Obsidian as well. [VALIDATION.md](../VALIDATION.md) records completed and outstanding checks; automated tests alone do not establish in-app compatibility.

## Source layout

| File | Responsibility |
|---|---|
| `src/main.ts` | Obsidian commands, settings, note controls, clipboard/file input, and vault adapter |
| `src/core.ts` | Settings validation, photo section handling, and YAML/body transformations |
| `src/image.ts` | Image limits, decoding, optional whitespace trimming, and WebP encoding |
| `src/importer.ts` | Import orchestration and cleanup after a failed note update |
| `src/lock.ts` | Exclusive local locks for competing desktop import tasks |
| `tests/` | Unit, adapter, and browser tests |

## Prepare a distributable ZIP

`npm run package` creates the install folder; it does not create a ZIP. Archive that folder so extraction produces exactly one `product-photo/` directory with these files:

```text
product-photo/
├── main.js
├── manifest.json
├── styles.css
├── LICENSE
├── THIRD_PARTY_NOTICES.md
└── ocr/
    ├── assets.json
    ├── worker.js
    ├── core.js
    ├── eng.traineddata
    └── chi_sim.traineddata
```

The prebuilt ZIP in `downloads/` is generated from the current build for manual installation. When changing the shipped code, rebuild it and update this ZIP before publishing documentation that links to it. Do not include `node_modules`, test data, or personal vault contents.

For a new release, keep the versions in `package.json`, `manifest.json`, and `versions.json` consistent, update the README download link, and rerun the relevant checks. The manifest's 1.5.0 minimum is an API baseline, not evidence that every older runtime has been tested.

This repository currently has no automatic release publishing step. Creating a GitHub release or submitting to the community directory is a separate maintainer action.

## OCR implementation

`src/ocr/engine.ts` isolates the pinned Tesseract.js 7 worker message protocol. `assets.ts` reads and verifies local resources; `parser.ts` maps recognized lines into drafts; `modal.ts` provides review; `write.ts` validates selected fields and merges against the latest note. `scripts/ocr-assets.mjs` prepares offline resources from npm dependencies at build time. Keep the engine dependency pinned: protocol changes require updating the adapter and rerunning real worker tests.

`npm run build` must run before OCR tests, because they verify generated assets. Browser tests exercise both bundled language packs with external HTTPS requests blocked, plus worker cancellation. Never commit private order screenshots. An optional `OCR_SAMPLE_IMAGE=/absolute/path.jpg` enables a local smoke test; its input stays outside the repo. OCR extraction is deliberately independent of photo import.
