# MFS — ORA® range sales page

Sales page for the Padagis ORA® compounding vehicle range (Medical Flavouring Systems, Brunswick East VIC).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Single file, no build step, no dependencies. Loads fonts from Google Fonts and bottle images from `assets/`. |
| `studies.html` | Searchable, branded A–Z bibliography of ORA® stability studies. |
| `studies-data.js` | The 107 Padagis study citations, available synopsis links, and 70-issue Secundum Artem archive. |
| `DESIGN.md` | The design system. Tokens, type scale, spacing, components, motion and depth strategy for both surfaces. Read it before any UI change. |
| `thank-you.html` | Order confirmation page. Stripe returns the buyer here after payment; the order populates itself from the Checkout Session. |
| `privacy.html` | Branded MFS privacy policy covering website, order and hosted Stripe Checkout data. |
| `terms.html` | Branded MFS website and ordering Terms of Use. |
| `legal.css` | Shared responsive design system for the Privacy Policy and Terms of Use pages. |
| `pricing.js` | Shared, integer-cent pricing engine used by the page and Stripe checkout endpoint. |
| `api/create-checkout-session.js` | Stripe-ready Vercel endpoint that validates product choices and recalculates every charge server-side. |
| `api/checkout-session.js` | Reads a paid Checkout Session back out of Stripe so `thank-you.html` can show the real order. |
| `assets/` | Product photography and logo, supplied by the manufacturer. |
| `dist/mfs-ora-sales-page.html` | Self-contained build — images inlined as data URIs, no `<html>`/`<head>` wrapper. Used for the shared preview. Regenerate with `build.py`. |
| `build.py` | Inlines `assets/` into `dist/` (re-encoded to WebP) and swaps the SEO `<title>` for the short preview name. Needs Pillow. |

## Deploying

Upload the site HTML, CSS and JavaScript files together with `assets/`. There is no application compile step; `build.py` is only needed when regenerating the self-contained sales-page preview in `dist/`.

## Pricing and checkout

The commercial rules live in `pricing.js` and use integer cents to avoid floating-point payment errors:

- 1–5 paid bottles: $32.99 each, no bonus.
- 6 paid bottles: $29.99 each and 1 free; $179.94 ex GST for 7 shipped, displayed as $25.70 effective per bottle.
- 12 paid bottles: $29.99 each and 3 free; $359.88 ex GST for 15 shipped, displayed as $23.99 effective per bottle.
- Larger orders repeat the same pattern: each complete 12 earns 3 bonus bottles and a remaining block of 6 earns 1.

Run `node tests/pricing.test.js`, `node tests/checkout-api.test.js` and
`node tests/checkout-session.test.js` after changing any pricing or checkout rule.

The page sends product quantities and bonus selections directly to hosted Stripe Checkout. Stripe then collects the customer and business names, email, phone, billing address, Australian shipping address, optional purchase order number, order notes and payment details. On Vercel, `api/create-checkout-session.js` creates the Checkout Session when `STRIPE_SECRET_KEY` is configured (and uses `SITE_URL` for return links when supplied). The endpoint accepts product choices—not browser-calculated prices—and recalculates the quote with the shared pricing engine before sending integer-cent line items to Stripe. Stripe Automatic Tax is enabled with exclusive product prices; the Stripe account must have its Australian tax registration and default product tax code configured before live payments are enabled.

Product copy, specs and FAQ entries are the `SKUS`, `EXTRA` and `FAQ` arrays in the same script block.

## Order confirmation

Stripe returns the buyer to `thank-you.html?session_id={CHECKOUT_SESSION_ID}`. The page
reads that id and calls `api/checkout-session.js`, which retrieves the session from
Stripe and returns the order — buyer's first name, order number, line items, and every
amount. Nothing is hard-coded and nothing is passed through the browser, so the figures
on screen are the figures Stripe settled.

The session id is the buyer's own capability token from the redirect, so it is the only
credential the page needs. The endpoint still validates its shape before calling Stripe
and returns nothing until Stripe reports the payment as `paid`.

The summary reconciles by construction:

    Subtotal (all shipped bottles at $32.99)
    − Discount (the bundle saving, including the free bottles)
    + Shipping
    + GST (Stripe Automatic Tax)
    = Total

Showing the range at list price and naming the saving underneath is what makes the
discount visible; the column still adds up to the exact amount charged. A discount of
zero removes its own row, and shipping shows "Free" only when it really is free.

The order number is derived from the session id, so it is stable across refreshes
without needing anywhere to persist it.

Opened without a `session_id` — a launch preview or a bookmarked link — the page renders
a clearly marked sample order rather than an empty shell. If the lookup fails, the buyer
gets a reassuring message pointing at their emailed invoice; Stripe's own error wording
goes to the console, never to the screen.

## Product colour system

Each product carries an identity colour sampled from its printed label stripe, held
in `:root` as `--sku-plus`, `--sku-sweet` and `--sku-blend`. Colour marks the family,
so the two SF variants share their parent's colour — a pharmacist scanning the range
sees family first and sugar-free second. The colour appears as the rule above each
product card, the dot beside its name, the bar on an active bundle row, and the tick
under each product-detail swatch. Selection state stays flame; identity stays tinted.

## Placeholders to replace before launch

- The product detail thumbnails include two empty slots (label detail, carton).
