# Product Photo — Product Requirements

This document defines the behavior of Product Photo 0.1. It is intended for contributors and reviewers. For installation and everyday use, see the [README](../README.md). For evidence of what has actually been tested, see [Validation](../VALIDATION.md).

## 1. Product overview

Product Photo is an Obsidian desktop plugin for people who keep a collection or inventory as one Markdown note per item. It turns a copied product image into a consistently sized local cover image and connects that image to the note and an optional Bases gallery.

For example, a collector creates a note named `Berry Lip Balm`, copies an image from an order or an image app, and clicks **Import product photo**. The note displays the optimized photo, its `photo` property points to the saved file, and an existing gallery using that property can display it.

The problem is the work between choosing an image and using it in an inventory: exporting, resizing, compressing, naming, saving, embedding, and filling in a property. Product Photo should perform those steps together after one deliberate import action.

## 2. Scope and success criteria

The first release targets macOS desktop. Mobile is excluded; Windows and Linux support is not established. Notes, images, and links remain ordinary vault files when the plugin is disabled.

A successful import requires no per-image filename, folder, size, or quality form after initial configuration. It produces one managed product photo in the note, a matching image property, and a valid local attachment without changing other note content.

The plugin does not create product notes, identify products, search websites, download clipboard URLs, split order screenshots, look up shelf life, or calculate inventory status. It does not intercept normal paste, monitor the clipboard, upload images, or require a model, account, API key, Python, or background service.

## 3. Terms and data contract

| Term | Meaning |
|---|---|
| Product note | A Markdown note created and maintained by the user for one item. No particular inventory schema is required. |
| Photo section | A section whose heading exactly matches the configured title. Examples use `Product photos`. |
| Import block | A fenced code block with language `product-photo`, placed inside the photo section; it renders the controls. |
| Image property | A text property, `photo` by default, containing the saved image's wikilink. |
| Managed photo | The image referenced by that property and its corresponding embed in the photo section. Other note images are not automatically managed. |
| Image folder | A configurable vault-relative destination, `Photos` by default. |

Example after importing into `Berry Lip Balm.md`:

````markdown
---
photo: "[[Photos/Berry Lip Balm.webp]]"
---

## Product photos

![[Photos/Berry Lip Balm.webp|320]]

```product-photo
```

## Notes
My own review remains here.
````

The example assumes **Photo section heading** has been explicitly set to `Product photos`. A note does not need brand, category, purchase dates, or any other inventory fields to work.

## 4. User journeys

### First-time setup

Provide a prebuilt installable package and instructions that do not require a development toolchain. The package must extract to a `product-photo` folder containing `main.js`, `manifest.json`, `styles.css`, and license notices.

The setup guide must explain how to enable the plugin, set the photo section title, and prepare one working note. Users must be able to start from the [sample note](../examples/Product.md) without knowing the project's development history.

### Import

1. The user opens a prepared product note and copies the image pixels for one product.
2. The user clicks **Import product photo**, or runs the clipboard import command for that prepared note.
3. The plugin validates the note and input, processes the image locally, saves it, and updates the property's link and body embed.
4. Success is reported only after the file and both note references are updated. The button becomes **Replace image**.

The photo section's `product-photo` block must show controls in Reading view and Live Preview. Source mode shows the source text. The add-button command creates the configured section if missing and must be idempotent within that section.

### Replace or choose a file

**Replace image** uses the same pipeline with the current clipboard image. **Choose image file** is a fallback for a local PNG, JPEG, or WebP. Replacing updates the managed photo's references while retaining the previous file, including references to it from other notes.

### Normal paste

Normal Obsidian paste remains unchanged. If a user pastes an image into the note and also imports it, the pasted original can remain alongside the managed image. The interface and guide must explain **copy → click Import**, without a paste step. The plugin must not silently delete pasted images to hide this situation.

## 5. Functional requirements

| ID | Requirement |
|---|---|
| FR1 | Read the clipboard only following a user-triggered import. Accept actual image data, not a page URL, image address, or text. |
| FR2 | Show a clear error for missing image data or denied clipboard access and keep a visible file-selection fallback. |
| FR3 | Bind processing to the note that initiated it. Switching notes must not redirect the write. |
| FR4 | Show an importing state and prevent repeated clicks from creating competing tasks for the same note. Competing desktop windows must not silently overwrite each other's imports. |
| FR5 | Validate destination and scope as vault-relative folders. Match directory boundaries, so `Products` does not include `Products-old`. Commands and buttons follow the same scope. |
| FR6 | Derive a valid filename from the note name. Add a unique suffix on conflicts, including case-insensitive collisions; never overwrite an existing attachment. |
| FR7 | Update only the configured image property and the corresponding embed inside the photo section. Preserve other property values and types, other sections, reviews, and unrelated images. |
| FR8 | Reject incompatible property types, ambiguous sections, duplicate import blocks, and ambiguous old-photo embeds instead of guessing which content to replace. |
| FR9 | Merge unrelated edits safely. Stop if the photo section/property changes during processing or the original note is moved/deleted; do not overwrite a stale note snapshot. |
| FR10 | On failure, retain the previous photo and references. Clean up newly created unused attachments where safe; report the path of any attachment that cannot safely be removed. |
| FR11 | Do not accumulate managed embeds across imports, redraws, or plugin restarts. The control block must not render a second copy of the body image. |
| FR12 | Keep local links usable without the plugin. Bases cards may consume the image property, but import must not rewrite Base definitions or dashboards. |

## 6. Image processing contract

| Aspect | Rule |
|---|---|
| Inputs | Static PNG, JPEG, and WebP from the clipboard or file picker. |
| Input limits | At most 20 MiB and 25 million decoded pixels; reject excessive dimensions before allocating the decoded image where possible. |
| Output | Static WebP, 800 × 800 pixels, white background. |
| Placement | Preserve aspect ratio and center the image; longest edge at most 704 pixels. Never crop to fill or stretch. |
| Small inputs | Upscale by no more than 1.5×, retaining remaining white space. |
| Quality | 0.82. Do not repeatedly lower quality to meet a fixed byte target. |
| Note display | Standard embed with a width of 320 pixels. |
| Orientation and metadata | Honor input orientation; omit unnecessary source EXIF/location metadata. |
| Outer whitespace | Optional trimming, off by default. Remove only outer white margins with a safety margin; do not remove backgrounds or alter product colors. |

The importer saves only its optimized output, not additional original copies or thumbnails. It does not detect or remove addresses and order text; the user chooses the image area before import. Under 100 KiB for representative screenshots is a size target, not a guarantee for every image.

HEIC, SVG, animated GIF, PDF, background removal, and an interactive crop editor are outside the first release.

## 7. Configuration and distribution

Expose folder scope, image folder, image property, photo section heading, and optional white-margin trimming. Examples and installation instructions must explicitly configure a matching section heading rather than assume a particular language. Any optional preset must not be necessary for the general workflow or edit existing notes automatically.

The plugin ID is `product-photo`; display name is `Product Photo`. Distribution includes source code, a prebuilt manual-install package, user instructions, and MIT/dependency license notices. The minimum app version follows the APIs used; actual tested versions are recorded separately. Community directory submission is not required for local use.

## 8. Acceptance scenarios

These describe required outcomes, not a claim that every scenario has been verified. See [Validation](../VALIDATION.md) for test evidence and remaining gaps.

| ID | Scenario | Expected result |
|---|---|---|
| A1 | First installation and import | A new user can follow the README from download to an imported image without installing developer tools. A prepared note needs only a copy and click per image. |
| A2 | Image variations | Landscape, portrait, transparent, small, and oriented inputs produce correctly proportioned 800×800 WebP images with white padding and no cut-off product. |
| A3 | Existing content | Unrelated properties, reviews, and other section images retain their values and content after import. |
| A4 | Bases gallery | A native cards view configured to use `photo` displays the imported image without changes to the Base definition. |
| A5 | Replacement | Property and managed embed point to the new image; old attachment and another note's old-image reference remain valid. |
| A6 | Collisions and repeated actions | Existing file content is unchanged, new names are unique, and repeated clicks do not create duplicate tasks or managed embeds. |
| A7 | Invalid clipboard and cancelled picker | The operation explains the problem or cancellation without changing existing note/image data. |
| A8 | Decode or write failure | The old photo and review survive; success is not reported; failed-task attachments are cleaned up safely or identified. |
| A9 | Concurrent edits or note switching | Imports stay bound to the initiating note; unrelated edits survive and conflicting photo edits stop the import. |
| A10 | View modes and disabling | Controls work in Reading view and Live Preview; Source mode remains editable; ordinary image links work after disabling the plugin. |
| A11 | Reusable templates and scope | A template can reuse the block; add-button is idempotent; out-of-scope notes cannot import. |
| A12 | Offline operation | Image import works without network access, model calls, external uploads, or a runtime toolchain. |
