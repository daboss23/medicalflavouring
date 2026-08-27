# Testing the purchase experience

Everything below runs in Stripe **test mode**. No real card is charged and no money moves.

## What is already set up

Your Stripe sandbox (`Viral Surge`, test mode) has been configured so Automatic Tax works:

- **Head office** set to P.O. Box 270, Brunswick East VIC 3057, AU. Tax settings were
  `pending` before this — Automatic Tax rejects every checkout while it is pending, so no
  test purchase could have completed.
- **Default tax behaviour** `exclusive` and a general tax code, matching the prices the site sends.
- **Australian GST registration** active, so GST computes at 10% instead of $0.

None of this touched live mode. Live mode still needs its own head office and a real ATO
registration before you can take actual payments.

## Option A — test locally (fastest)

No deploy needed, and you can edit and re-test immediately.

1. Get your test secret key from <https://dashboard.stripe.com/test/apikeys> (starts `sk_test_`).
2. Create a file called `.env.local` in the project root:

   ```
   STRIPE_SECRET_KEY=sk_test_your_key_here
   ```

   Git ignores this file, so the key cannot be committed by accident.
   To test the embedded card fields on `checkout.html` as well, add your test
   publishable key (`pk_test_…`, from the same page) beside it:

   ```
   STRIPE_SECRET_KEY=sk_test_your_key_here
   STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
   ```

   Without the publishable key the checkout page hands over to hosted Stripe
   Checkout instead — worth testing once too, since that is the live fallback.
3. Run:

   ```
   node dev-server.js
   ```
4. Open <http://localhost:3000>.

The sandbox refuses to start with a live key, so a stray `sk_live_` key cannot charge a
real card here.

## Option B — test on a Vercel preview

Closer to production, and shareable with someone else.

1. In Vercel → Settings → Environment Variables, add `STRIPE_SECRET_KEY` with your
   **test** key, scoped to **Preview** only. Leave Production on the live key.
2. Deploy the branch and open the preview URL.

Vercel bakes environment variables in at build time, so **redeploy after adding or changing
a key** — an existing deployment will not pick it up.

## Test cards

Any future expiry date, any 3-digit CVC, any postcode.

| Card | What happens |
| --- | --- |
| `4242 4242 4242 4242` | Payment succeeds |
| `4000 0000 0000 0002` | Card declined |
| `4000 0000 0000 9995` | Declined for insufficient funds |
| `4000 0027 6000 3184` | Requires 3D Secure authentication |

Full list: <https://docs.stripe.com/testing>

## What to check

**On the shop page**

- Adding six bottles triggers the deal price and offers a free seventh. The 12-bottle upgrade is
  **not** offered here — it belongs to the checkout page.
- The running total matches $29.99 a bottle at six or more, $32.99 below that.

**On the checkout page** (`/checkout.html`)

- The bottles, free bottles and totals match what the shop page showed.
- Ticking the order bump opens the upgrade modal; the tick only lands once ADD TO CART is pressed.
- Closing the modal with the X, the veil or Escape leaves the order untouched.
- The modal will not advance until exactly the threshold number of bottles is chosen, and the
  free-bottle step offers one row per free bottle.
- After ADD TO CART the order summary lists exactly the bottles chosen, paid and free, and the
  total matches. Unticking the bump puts the original basket back.
- Re-opening the bump (its footer) shows the selection that was made, not a fresh start.
- The total, the pay button and the Stripe amount all move together when you switch options.
- Submitting an empty form marks the first missing field, focuses it and explains what is wrong.
- A declined card leaves you on the page with the reason, and paying again reuses the same
  PaymentIntent — check the Stripe dashboard shows one payment, not two.
- With `STRIPE_PUBLISHABLE_KEY` removed, the page hides the card field and hands over to hosted
  Stripe Checkout instead.

**On Stripe Checkout** (the hosted fallback)

- Prices, quantities and the free bottle at $0.00 all match the shop page.
- GST appears as a separate line at 10% (this is what the tax setup above fixed).
- It asks for name, email, phone, billing and Australian shipping address.
- The purchase order and order notes fields appear and are optional.

**On the thank-you page** — this is the part that had no coverage before

- The headline greets the buyer by first name.
- The bottle lineup shows one bottle per product ordered, badged with the right count
  (a product bought twice with one free shows 3).
- Line items match what was paid, with the free bottle flagged FREE at $0.00.
- The total matches the amount charged.
- Order number, confirmation email and card brand/last4 are present.
- The purchase order row appears only if you entered one — leave it blank and it should vanish.

**Edge cases worth trying once**

- Abandon checkout and press back: you should land on the shop, not a thank-you page.
- Open `/thank-you.html` with no `session_id`: a polite message, not a broken page.
- Pay with the declined card: Stripe should keep you on Checkout with an error.

## Seeing the order afterwards

<https://dashboard.stripe.com/test/payments> lists every test payment. Open one to see the
line items, the customer details, the GST Stripe calculated, and the metadata the site sent
(`pricing_version`, `paid_bottles`, `bonus_bottles`). Orders taken on the embedded checkout page appear
under Payments too, with `checkout: embedded` and the bottles in `items` metadata.

## Going live later

1. Set the live-mode head office and add your real ATO GST registration in Stripe.
2. Put **both** live keys in Vercel's **Production** environment, then redeploy:

   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```

   The secret key alone is not enough. With it set and the publishable key
   missing, the store still takes money — but `checkout.html` hides its own
   card field and hands every real customer to Stripe's hosted page instead.
   Nothing errors, so this is easy to ship without noticing. Load the live
   checkout page once after deploying and confirm the card field appears on
   our page; the browser console names the reason if it does not.
3. Keep the test keys on **Preview** and the live keys on **Production**, scoped
   separately. Vercel bakes environment variables in at build time, so every key
   change needs a redeploy before it takes effect.
4. Make one small real purchase and refund it, to confirm the live path end to end.
