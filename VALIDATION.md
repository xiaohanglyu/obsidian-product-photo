# Validation — 0.2.0

## OCR checks completed — 2026-11-07

- 42 unit/adapter tests passed, including product grouping, explicit date labels, uncertain currencies, reviewed field writes, preservation, concurrent changes, empty YAML template properties and resource integrity failures.
- TypeScript checking and the production build passed.
- Real Chromium OCR tests use the packaged Tesseract worker/core and English + Simplified Chinese data, with HTTPS requests blocked. English grouping, Chinese text recognition and worker cancellation passed. The eight pre-existing image tests also passed.
- Private English Sephora and Chinese Tmall screenshots were processed locally as smoke checks. Inputs and raw text were not committed. Dense Chinese layouts produced imperfect names and shade text; manual review and platform selection remain necessary. Recognition is not a verified product database.
- In Obsidian 1.13.4 on macOS 26.6.2, the updated plugin was loaded only in the existing isolated test vault. The new note button opened review; an empty clipboard showed file fallback; a native picker loaded an order screenshot; OCR ran using local resources; the product selector and editable fields rendered. Saving brand and item price updated only those properties. The original heading, photo property, empty dates and usage text remained intact. Closing review returned the note controls to normal.
- A null-template-property detection issue found during this check was corrected and covered by a regression test.

OCR checks do not establish perfect extraction for arbitrary stores, Windows/Linux compatibility, every clipboard image source, or multi-window conflict behavior in the real host. Those cases still require manual testing. No update was installed in the user's original inventory vault.

## Previous photo import validation — 0.1.0


## Automated checks completed

- TypeScript strict type checking and the production bundle: passed (`npm run build`).
- 25 tests across five files: passed (`npm test`). Includes note and YAML preservation, concurrent review edits, conflicting photo edits, duplicate references, filename handling, import failures and cleanup, scope checks, exclusive locks, and plugin-adapter imports using an Obsidian API test double.
- Eight actual headless Chromium image tests: passed (`npm run test:browser`). Includes landscape, portrait, transparent and small PNG inputs encoded to WebP, white corners, subject color, 800×800 output, optional white-margin trimming, actual JPEG/WebP inputs, and a synthetic EXIF orientation-6 JPEG fixture.
- The four representative encoded images were each below 100 KiB. This is not a guarantee for arbitrary photographs.
- npm dependency audit after updating the test toolchain: zero known vulnerabilities reported.
- Local installation bundle generated under `dist/product-photo-0.1.0/product-photo/`.

Environment: macOS arm64, Node.js 26.11.0; exact package versions are recorded in package-lock.json. Browser tests used a pre-existing standalone Playwright Chromium headless shell (build 1243), selected with PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. It ran in a separate temporary profile and did not access personal browser data.

## In-app checks completed — 2026-11-06

Environment: **Obsidian 1.13.4, macOS 26.6.2 (arm64)**. Tested in a separate, newly created Product Photo Test vault, with user authorization to enable this local plugin. The existing Notebook inventory and its plugin settings were not modified.

| Check | Result |
|---|---|
| Load local plugin | Enabled successfully in the isolated vault. |
| Live Preview | The code block rendered Import product photo and Choose image file buttons. |
| File import | Selected a local product WebP through the native file picker; the plugin saved the new image, updated photo, and replaced the template placeholder. |
| Reading view | Standard photo embed and Replace image / Choose image file buttons rendered correctly. |
| Image clipboard import | Copied image pixels from macOS Preview with Select All / Copy, then clicked Replace image; Electron clipboard import succeeded. |
| Replacement and collision | Created a new `-2.webp` attachment, retained the original, and updated the single body embed and photo property. |
| Native Bases gallery | Dashboard's embedded cards view displayed the product photo using the photo property. |
| Non-image clipboard | Copied text, clicked Replace image, and received the expected image-required message. No note or image changes occurred. |
| File-picker cancellation | Cancelled native file selection; the plugin returned to its normal button state without changing existing data. |
| Data preservation | Brand, shade, opening date, and both usage-record bullets remained intact. |

Both saved outputs were valid **800×800 WebP, 5,954 bytes each**. Their identical pixel content produced the same SHA-256:

```text
32743aa7fbdd73463be782e7922ec211fd2f6c2b1a457b3d03516dfa563d3c85
```

After the rejected text import and cancelled picker, both attachment hashes were unchanged; the note still contained exactly one product image embed.

The system region-screenshot gesture was attempted, but the computer-use driver could not target the screenshot overlay. The image clipboard path was verified using Preview instead. **Do not describe the macOS region-screenshot gesture itself as verified.**

## Remaining in-app checks

- A region screenshot copied directly through the macOS system screenshot shortcut, and a browser's Copy Image action.
- Concurrent editor changes, delayed autosave, and competing imports in multiple real Obsidian windows.
- Real disk-write failures, safe cleanup failures, and image references in another open note.
- Disabling/re-enabling the plugin with notes open.
- Real camera JPEGs and maximum-size inputs on the target device (synthetic EXIF rotation is covered in browser tests).
- Visual quality across the user's actual order screenshots.

These results establish the core local import and replacement workflow on the tested app/OS combination, not full A1–A12 coverage or support for older runtime versions. No source changes were needed during this pass.

## Suggested isolated-vault acceptance pass

1. Create a disposable vault and copy the full built plugin folder (including `ocr/`) into `.obsidian/plugins/product-photo/`.
2. Enable the plugin, add the code block through the command, and verify Reading view and Live Preview.
3. Import a single-product screenshot; inspect the 800×800 WebP, property, and note embed.
4. Point a small Bases cards view to `photo` and verify its image updates without editing the Base.
5. Replace the photo; confirm the previous file and another note's reference remain valid.
6. Exercise empty clipboard, cancelled file selection, filename collisions, concurrent review edits, and two-window imports.
7. Record actual Obsidian/macOS versions and observed results before claiming A1–A12 fully verified.
