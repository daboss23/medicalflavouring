# MFS — ORA® range sales page

Sales page for the Padagis ORA® compounding vehicle range (Medical Flavouring Systems, Brunswick East VIC).

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Single file, no build step, no dependencies. Loads fonts from Google Fonts and bottle images from `assets/`. |
| `studies.html` | Searchable, branded A–Z bibliography of ORA® stability studies. |
| `studies-data.js` | The 107 Padagis study citations, available synopsis links, and 70-issue Secundum Artem archive. |
| `checkout.html` | Branded checkout page. Collects the customer's details in MFS fields and takes the card in an embedded Stripe Payment Element, with the offer, order summary and upgrade beside it. |
| `checkout.js` | The checkout page's logic: basket, price options, order bump, validation, Stripe Elements and payment confirmation. |
| `catalog.js` | The ORA® range — names, photography, colours and product copy. One list, read by the sales page, the checkout page and the Stripe endpoints. |
| `cart.js` | Carries the basket from the sales page to checkout and back, in the URL with sessionStorage as a fallback. |
| `thank-you.html` | Post-checkout thank-you page. Reads the real order back from Stripe — `api/checkout-session.js` for hosted Checkout, `api/payment-intent.js` for the embedded page — and renders it. |
| `privacy.html` | Branded MFS privacy policy covering website, order and hosted Stripe Checkout data. |
| `terms.html` | Branded MFS website and ordering Terms of Use. |
| `legal.css` | Shared responsive design system for the Privacy Policy and Terms of Use pages. |
| `pricing.js` | Shared, integer-cent pricing engine used by the page and Stripe checkout endpoint. |
| `api/create-checkout-session.js` | Stripe-ready Vercel endpoint that validates product choices and recalculates every charge server-side. |
| `api/checkout-session.js` | Reads one paid Checkout Session back from Stripe for the thank-you page, returning a whitelisted subset of the order. |
| `api/create-payment-intent.js` | Opens (or updates) the PaymentIntent behind the embedded checkout page, recalculating every cent server-side. |
| `api/payment-intent.js` | Reads one embedded-checkout order back for the thank-you page, in the same shape `checkout-session.js` returns. |
| `api/checkout-config.js` | Hands the checkout page the Stripe publishable key, so test and live keys follow the environment. |
| `api/order-fields.js` | Shared order shaping for both read endpoints — product names, photography, colours, order references. |
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
It is quoted ex GST like the bottle prices, so its GST is added on top and the summary's single
"GST (10%)" line covers the bottles and the freight together. It lives in `pricing.js` as
`RULES.freightCents`, so the on-page summary, the checkout page, the Stripe total and the thank-you receipt
all read the same number. Hosted Checkout receives it as an inline `shipping_options` fixed-amount rate
with `tax_behavior: exclusive` and the shipping tax code, so Automatic Tax adds its GST alongside the GST
on the bottles, and the amount comes back in `total_details.amount_shipping`.
Changing the freight price means changing that one constant (and the expectations in `tests/pricing.test.js`).

Run the whole suite after changing any pricing or checkout rule:

```
node tests/pricing.test.js
node tests/cart.test.js
node tests/checkout-api.test.js
node tests/payment-intent-api.test.js
node tests/thank-you-api.test.js
```

### The checkout page

`checkout.html` is where an order is completed. The basket travels from the sales page in the URL
(`checkout.html?q=plus:4,sweet:2&b=blend`), so a checkout link can be quoted, shared or bookmarked, and
`cart.js` keeps it in `sessionStorage` so a reload or a trip back to the builder does not lose it. Nothing
about the price travels with it: the page holds no prices of its own, reads every figure from `pricing.js`,
and the server recalculates the whole quote again before Stripe sees an amount.

- **Price options and the order bump are the same offer, mirrored.** The upgrade is derived from the
  pricing rules — the next bonus threshold above the current basket, the bottles needed to reach it spread
  across what is already in the basket, and what the extra free stock is worth. Ticking either control
  moves the other.
- **The card field is a Stripe Payment Element** in deferred-intent mode, so changing the order updates the
  amount without a server round trip and no PaymentIntent is opened for a basket nobody pays for.
- **One customer, one PaymentIntent.** A declined card or a corrected typo updates the existing intent
  rather than leaving abandoned intents behind every order.
- **Falls back to hosted Stripe Checkout** when no publishable key is configured or Stripe.js cannot load,
  so the page never shows a dead card field.

`STRIPE_PUBLISHABLE_KEY` (`pk_test_…` or `pk_live_…`) enables the embedded card field;
`STRIPE_SECRET_KEY` is still what actually charges. Both belong in the environment, per environment.

GST on this page is the 10% computed by `pricing.js` rather than Stripe Automatic Tax — a PaymentIntent
carries no tax engine of its own. Hosted Checkout, which the fallback uses, still runs Automatic Tax.

### Hosted Stripe Checkout (the fallback)

The sales page sends product quantities and bonus selections to `checkout.html`, which takes the card
itself. When it cannot — no publishable key, or Stripe.js blocked — it posts the same product choices to
`api/create-checkout-session.js` and hands the customer to hosted Stripe Checkout, where Stripe collects the
customer and business names, email, phone, billing address, Australian shipping address and payment
details. On Vercel that endpoint creates the Checkout Session when `STRIPE_SECRET_KEY` is configured (and
uses `SITE_URL` for return links when supplied). It accepts product choices—not browser-calculated
prices—and recalculates the quote with the shared pricing engine before sending integer-cent line items to
Stripe. Stripe Automatic Tax is enabled with exclusive product prices; the Stripe account must have its
Australian tax registration and default product tax code configured before live payments are enabled.

After payment on the embedded page the buyer lands on
`thank-you.html?payment_intent=…&payment_intent_client_secret=…`, which `api/payment-intent.js` reads back —
the client secret is what proves the browser asking is the one that paid. After payment on hosted Checkout
Stripe returns them to `thank-you.html?session_id={CHECKOUT_SESSION_ID}`. That page holds no order data
of its own: it calls `api/checkout-session.js`, which retrieves the session from Stripe with the secret key and returns only
the fields the page renders. The endpoint rejects anything that is not a well-formed `cs_…` reference before it calls Stripe,
and a session that is not yet paid returns a `pending` state rather than a receipt.

Product copy and specs are the `SKUS` and `EXTRA` structures in `catalog.js`; the FAQ entries are the
`FAQ` array in the sales page's script block.

## Product colour system

Each product carries an identity colour sampled from its printed label stripe, held
in `:root` as `--sku-plus`, `--sku-sweet` and `--sku-blend`. Colour marks the family,
so the two SF variants share their parent's colour — a pharmacist scanning the range
sees family first and sugar-free second. The colour appears as the rule above each
product card, the dot beside its name, the bar on an active bundle row, and the tick
under each product-detail swatch. Selection state stays flame; identity stays tinted.

## Placeholders to replace before launch

- The product detail thumbnails include two empty slots (label detail, carton).
