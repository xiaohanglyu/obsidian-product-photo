# Order screenshot OCR

Product Photo 0.2 adds local, reviewed extraction to an existing product note. It does not create a batch of notes or download product photos.

## Workflow

Open the destination note, copy an order screenshot, then click **Fill from order screenshot** or run the matching command. A file picker is available if the clipboard is empty. Use English for English-only orders, or Chinese + English for mixed orders. Select a platform explicitly if automatic detection fails.

Choose one detected product, compare the fields with the screenshot, edit errors, and save only checked fields. Switching products resets unsaved field edits. Closing the dialog cancels recognition. No changes are written until Save is clicked. A changed destination property causes a conflict instead of replacing newer information.

## Property contract

| Field | Note destination | Rules |
|---|---|---|
| Brand | `brand` | Text |
| Shade/color | `shade` | Text |
| Item price | `price` | Nonnegative number, at most two decimal places; check discounts yourself |
| Currency | `currency` | Three uppercase letters; `$` alone is ambiguous |
| Purchase channel | `purchase_channel` | Text; format override can supply the platform |
| Purchase date | `purchase_date` | Full `YYYY-MM-DD`, from an explicit purchase label |
| Opening date | `open_date` | Full date, not in the future; never automatically copied from delivery |
| Product name | Optional first-level heading | Explicit toggle; no file rename |
| Size and quantity | None | Review only |

Only recognized values for empty properties already present in the note are initially checked. Existing filled properties and properties absent from the template are unchecked. Explicitly checking a new property allows adding that property. Unchecked properties, photo references, and body sections are preserved. Malformed YAML, complex property values, conflicting edits, and ambiguous top-level headings are rejected rather than silently rewritten.

## Accuracy and limits

Tesseract extracts visible text; a deterministic parser groups products and maps labels. It cannot reconstruct truncated names or read hidden order details. Dense Chinese layouts, tiny text, product packaging text and unfamiliar brands can cause errors. Built-in brand names and brands already used in this vault improve grouping, but are not a complete product catalog. Always review results. OCR confidence is an engine score, not a guarantee of field accuracy.

Dates without a year remain blank. A return cutoff is not a purchase date. The parser does not infer PAO, expiry, delivery years, or actual opening dates. A partial screenshot may omit necessary information. Use a complete, clear screenshot; PNG, JPEG and static WebP up to 20 MiB and 25 megapixels are accepted. Recognition times out after 90 seconds.

## Offline processing and installation

The install package contains the pinned Tesseract.js 7.0.0 worker, embedded WebAssembly core, English and Simplified Chinese data. Install the complete `ocr/` folder beside `main.js`. Resources are checked against their packaged SHA-256 manifest before use. Missing or corrupt files produce a reinstall message; there is no CDN fallback or automatic dependency download.

The screenshot preview, recognized text, and unused draft fields stay in memory and are discarded when the dialog closes. Only selected, reviewed fields are written. No OCR network request, telemetry, API key or AI token is required. The screenshot is not automatically saved as a product photo.
