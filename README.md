# MFS — ORA® range sales page

Sales page for the Padagis ORA® compounding vehicle range (Medical Flavouring Systems, Brunswick East VIC).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Single file, no build step, no dependencies. Loads fonts from Google Fonts and bottle images from `assets/`. |
| `studies.html` | Searchable, branded A–Z bibliography of ORA® stability studies. |
| `studies-data.js` | The 107 Padagis study citations, available synopsis links, and 70-issue Secundum Artem archive. |
| `thank-you.html` | Post-checkout thank-you page. Reads the real order back from Stripe via `api/checkout-session.js` and renders it; `success_url` points here. |
| `privacy.html` | Branded MFS privacy policy covering website, order and hosted Stripe Checkout data. |
| `terms.html` | Branded MFS website and ordering Terms of Use. |
| `legal.css` | Shared responsive design system for the Privacy Policy and Terms of Use pages. |
| `pricing.js` | Shared, integer-cent pricing engine used by the page and Stripe checkout endpoint. |
| `api/create-checkout-session.js` | Stripe-ready Vercel endpoint that validates product choices and recalculates every charge server-side. |
| `api/checkout-session.js` | Reads one paid Checkout Session back from Stripe for the thank-you page, returning a whitelisted subset of the order. |
| `assets/` | Product photography and logo, supplied by the manufacturer. |
| `dist/mfs-ora-sales-page.html` | Self-contained build — images inlined as data URIs, no `<html>`/`<head>` wrapper. Used for the shared preview. Regenerate with `build.py`. |
| `dev-server.js` | Local sandbox: serves the site and routes `/api/*` to the real handlers so the whole purchase flow can be tested in Stripe test mode. See `TESTING.md`. |
| `build.py` | Inlines `assets/` into `dist/` (re-encoded to WebP) and swaps the SEO `<title>` for the short preview name. Needs Pillow. |

## Testing a purchase

`TESTING.md` walks through running the full checkout and thank-you flow against Stripe test mode,
including test card numbers and what to verify at each step.

## Deploying

Upload the site HTML, CSS and JavaScript files together with `assets/`. There is no application compile step; `build.py` is only needed when regenerating the self-contained sales-page preview in `dist/`.

## Pricing and checkout

The commercial rules live in `pricing.js` and use integer cents to avoid floating-point payment errors:

- 1–5 paid bottles: $32.99 each, no bonus.
- 6 paid bottles: $29.99 each and 1 free; $179.94 ex GST for 7 shipped, displayed as $25.70 effective per bottle.
- 12 paid bottles: $29.99 each and 3 free; $359.88 ex GST for 15 shipped, displayed as $23.99 effective per bottle.
- Larger orders repeat the same pattern: each complete 12 earns 3 bonus bottles and a remaining block of 6 earns 1.

A flat freight charge of $30.00 is added once per order — never per bottle, and never on an empty builder.
Unlike the bottle prices it is GST-inclusive, so $30.00 is what lands on the card; the GST inside it is
broken out as `freightGstCents`. It lives in `pricing.js` as `RULES.freightCents`, so the on-page summary,
the Stripe Checkout total and the thank-you receipt all read the same number. Stripe receives it as an
inline `shipping_options` fixed-amount rate with `tax_behavior: inclusive` and the shipping tax code, so
Automatic Tax breaks the GST out of the flat fee rather than adding it on top, and the amount comes back in
`total_details.amount_shipping`.
Changing the freight price means changing that one constant (and the expectations in `tests/pricing.test.js`).

Run `node tests/pricing.test.js`, `node tests/checkout-api.test.js` and `node tests/thank-you-api.test.js` after changing any pricing or checkout rule.

The page sends product quantities and bonus selections directly to hosted Stripe Checkout. Stripe then collects the customer and business names, email, phone, billing address, Australian shipping address, optional purchase order number, order notes and payment details. On Vercel, `api/create-checkout-session.js` creates the Checkout Session when `STRIPE_SECRET_KEY` is configured (and uses `SITE_URL` for return links when supplied). The endpoint accepts product choices—not browser-calculated prices—and recalculates the quote with the shared pricing engine before sending integer-cent line items to Stripe. Stripe Automatic Tax is enabled with exclusive product prices; the Stripe account must have its Australian tax registration and default product tax code configured before live payments are enabled.

After payment Stripe returns the buyer to `thank-you.html?session_id={CHECKOUT_SESSION_ID}`. That page holds no order data
of its own: it calls `api/checkout-session.js`, which retrieves the session from Stripe with the secret key and returns only
the fields the page renders. The endpoint rejects anything that is not a well-formed `cs_…` reference before it calls Stripe,
and a session that is not yet paid returns a `pending` state rather than a receipt.

Product copy, specs and FAQ entries are the `SKUS`, `EXTRA` and `FAQ` arrays in the same script block.

## Product colour system

Each product carries an identity colour sampled from its printed label stripe, held
in `:root` as `--sku-plus`, `--sku-sweet` and `--sku-blend`. Colour marks the family,
so the two SF variants share their parent's colour — a pharmacist scanning the range
sees family first and sugar-free second. The colour appears as the rule above each
product card, the dot beside its name, the bar on an active bundle row, and the tick
under each product-detail swatch. Selection state stays flame; identity stays tinted.

## Placeholders to replace before launch

- The product detail thumbnails include two empty slots (label detail, carton).
