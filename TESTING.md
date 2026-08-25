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

- Adding six bottles triggers the deal price and offers a free seventh.
- The running total matches $29.99 a bottle at six or more, $32.99 below that.

**On Stripe Checkout**

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
(`pricing_version`, `paid_bottles`, `bonus_bottles`).

## Going live later

1. Set the live-mode head office and add your real ATO GST registration in Stripe.
2. Put the live key in Vercel's **Production** environment, then redeploy.
3. Make one small real purchase and refund it, to confirm the live path end to end.
