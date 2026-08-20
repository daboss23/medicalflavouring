# MFS — ORA® range sales page

Sales page for the Padagis ORA® compounding vehicle range (Medical Flavouring Systems, Brunswick East VIC).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Single file, no build step, no dependencies. Loads fonts from Google Fonts and bottle images from `assets/`. |
| `assets/` | Product photography and logo, supplied by the manufacturer. |
| `dist/mfs-ora-sales-page.html` | Self-contained build — images inlined as data URIs, no `<html>`/`<head>` wrapper. Used for the shared preview. Regenerate with `build.py`. |
| `build.py` | Inlines `assets/` into `dist/` and swaps the SEO `<title>` for the short preview name. |

## Deploying

Upload `index.html` and `assets/` and you're done. Nothing to compile.

## Editing the offer

The commercial numbers live in one place, at the top of the `<script>` block in `index.html`:

```js
var UNIT = 25.70, RRP = 32.99, GOAL = 6, BUMP = 19.90;
var DEADLINE = new Date('2026-08-31T23:59:59+10:00').getTime();
```

`GOAL` drives the whole bundle mechanic — set it to 5 and the page becomes buy-5-get-1 everywhere, including the progress bar and the "N more bottles" copy. The hard-coded figures in the hero anchor bar (`$22.03`, `33% off`, `$76.73`) and the price card are derived from those constants, so update them together.

Product copy, specs and FAQ entries are the `SKUS`, `EXTRA` and `FAQ` arrays in the same script block.

## Placeholders to replace before launch

- Three testimonial quotes are marked `[Placeholder quote — …]`.
- The stability panel has an image slot for a lab / compounding bench photo.
- The product detail thumbnails include two empty slots (label detail, carton).
