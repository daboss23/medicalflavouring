# MFS — ORA® range sales page

Sales page for the Padagis ORA® compounding vehicle range (Medical Flavouring Systems, Brunswick East VIC).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Single file, no build step, no dependencies. Loads fonts from Google Fonts and bottle images from `assets/`. |
| `studies.html` | Searchable, branded A–Z bibliography of ORA® stability studies. |
| `studies-data.js` | The 107 Padagis study citations, available synopsis links, and 70-issue Secundum Artem archive. |
| `privacy.html` | Branded MFS privacy policy covering website, order and hosted Stripe Checkout data. |
| `terms.html` | Branded MFS website and ordering Terms of Use. |
| `legal.css` | Shared responsive design system for the Privacy Policy and Terms of Use pages. |
| `pricing.js` | Shared, integer-cent pricing engine used by the page and Stripe checkout endpoint. |
| `api/create-checkout-session.js` | Stripe-ready Vercel endpoint that validates product choices and recalculates every charge server-side. |
| `api/stripe-webhook.js` | Signature-verified Stripe webhook endpoint. The only trustworthy signal that an order was paid, and the place order fulfilment hooks in. |
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

Run `node tests/pricing.test.js`, `node tests/checkout-api.test.js` and `node tests/stripe-webhook.test.js` after changing any pricing, checkout or webhook rule.

The page sends product quantities and bonus selections directly to hosted Stripe Checkout. Stripe then collects the customer and business names, email, phone, billing address, Australian shipping address, optional purchase order number, order notes and payment details. On Vercel, `api/create-checkout-session.js` creates the Checkout Session when `STRIPE_SECRET_KEY` is configured (and uses `SITE_URL` for return links when supplied). The endpoint accepts product choices—not browser-calculated prices—and recalculates the quote with the shared pricing engine before sending integer-cent line items to Stripe. Stripe Automatic Tax is enabled with exclusive product prices; the Stripe account must have its Australian tax registration and default product tax code configured before live payments are enabled.

Checkout also collects an ABN via Stripe Tax ID collection and asks Stripe to issue a hosted PDF tax invoice for every order, so trade buyers get a compliant document without manual work. The request carries an `Idempotency-Key` derived from the order contents, so a double-click reuses the first Checkout Session rather than opening a second.

### Webhooks and fulfilment

The `success_url` only means the customer's browser came back — it can be visited directly and proves nothing about payment. `api/stripe-webhook.js` is the authoritative signal: it verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET`, rejects payloads whose timestamp is outside Stripe's five-minute tolerance, and ignores event ids it has already processed.

It fulfils on `checkout.session.completed` only when `payment_status` is `paid`, and on `checkout.session.async_payment_succeeded` for delayed payment methods that clear later. Order fulfilment belongs in the `fulfilOrder` function; it must stay idempotent, because Stripe retries deliveries for up to three days. The in-memory duplicate guard only covers a single warm instance, so durable de-duplication belongs in whatever store `fulfilOrder` writes to.

Register the endpoint in the Stripe Dashboard against `https://<site>/api/stripe-webhook` for those event types, and copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `STRIPE_SECRET_KEY` | Server-side Stripe API key. Without it the checkout endpoint returns 503 and the page reports that checkout is not connected. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the webhook endpoint. Without it the webhook returns 503 rather than trusting unverified payloads. |
| `SITE_URL` | Overrides the origin used for Stripe return links. Falls back to the forwarded host. |

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
