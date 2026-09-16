# SIA1 Merch Counter — PayMongo Checkout Activity

A working implementation of the Module 3 activity ("Payments Microservice
with PayMongo Checkout"): three independent services plus a static
storefront, selling **3 t-shirt choices**.

```
paymongo-tshirt-shop/
├── product-service/   # GET /products, GET /products/:id
├── order-service/     # POST /orders, GET/PATCH /orders/:id
├── payment-service/   # POST /checkout  ← ONLY service holding the PayMongo secret key
└── frontend/          # index.html (storefront), success.html, cancel.html
```

## How it maps to the activity PDF

| Activity section | Where it lives here |
|---|---|
| §3 "Product Service exposes name/price(centavos)/description" | `product-service/server.js` — 3 hardcoded shirts, prices in centavos |
| §3 "Order Service tracks pending/paid/cancelled" | `order-service/server.js` — in-memory order store with a `status` field |
| §3 "Payment Service is the only one that talks to PayMongo" | `payment-service/server.js` — the secret key is read from `process.env.PAYMONGO_SECRET_KEY` and never leaves this service |
| §4 Setup | See below |
| §5 Creating a Checkout Session | `payment-service` builds the exact request body from §5, with `amount` already in centavos from the Order Service |
| §6 Testing the flow | Use PayMongo's test cards / simulated GCash-Maya authorization page |
| §9 "No webhooks — confirm via success_url" | `success.html` calls `GET /checkout/:sessionId/verify`, which re-checks the session status with PayMongo directly (a bit more robust than trusting the redirect alone — the stretch goal in the instructor notes would replace this with a real webhook) |

## 1. Setup (once)

1. Sign up at [paymongo.com](https://paymongo.com), stay in **test mode**.
2. Dashboard → Developers → API Keys → copy the **Test Secret Key** (`sk_test_...`).
3. In `payment-service/`, copy the env template and paste your key:
   ```bash
   cd payment-service
   cp .env.example .env
   # edit .env, set PAYMONGO_SECRET_KEY=sk_test_...
   ```
4. Install dependencies in all three services:
   ```bash
   cd product-service && npm install && cd ..
   cd order-service && npm install && cd ..
   cd payment-service && npm install && cd ..
   ```

## 2. Run it (each service independently, per the rubric's "genuinely separated" criterion)

Open three terminals:

```bash
# Terminal 1
cd product-service && npm start     # http://localhost:4001

# Terminal 2
cd order-service && npm start       # http://localhost:4002

# Terminal 3
cd payment-service && npm start     # http://localhost:4003
```

Then serve the frontend (any static file server works, e.g.):

```bash
cd frontend && npx serve -l 5500    # http://localhost:5500
```

If you serve the frontend somewhere other than `http://localhost:5500`, update
`FRONTEND_URL` in `payment-service/.env` to match — PayMongo needs the exact
`success_url`/`cancel_url` your browser will land on.

## 3. Walk through the flow

1. Open `http://localhost:5500`, pick one of the 3 shirts, adjust quantity.
2. Click **Checkout** — this is the full chain from §1's objectives:
   - Frontend → `POST /orders` on **Order Service** (creates the order, `status: "pending"`)
   - Frontend → `POST /checkout` on **Payment Service** (fetches the order back from Order Service, calls PayMongo's `POST /v1/checkout_sessions` with Basic Auth, returns `checkout_url`)
   - Browser redirects to PayMongo's **hosted** checkout page — you never see card fields in this app's own code
3. Pay with a PayMongo test card (any future expiry + any 3-digit CVC), or use the simulated GCash/Maya Authorize button.
4. PayMongo redirects back to `success.html`, which asks Payment Service to verify the session and mark the order `paid` in Order Service.

## 4. Deliverables checklist (§7 of the activity)

- [x] Three independently runnable services — see folders above
- [ ] Architecture diagram (draw the 3 boxes + PayMongo, arrows as described in §3/§5)
- [ ] Screen recording of one full test transaction (shop → PayMongo hosted page → success page)
- [ ] Written reflection — starter points below

### Reflection starter (fill in your own words for the ½-page writeup)

**Why isolate the secret key to the Payment Service?**
Because only one file (`payment-service/server.js` + its `.env`) can ever leak
it. If a bug or a compromised dependency exposed `product-service` or
`order-service`, the PayMongo key still wouldn't be reachable. It also means
swapping PayMongo for another gateway later only touches this one service —
`product-service` and `order-service` don't even know PayMongo exists.

**One trade-off of a hosted checkout page vs. a fully custom one:**
You give up control over the payment page's look and feel (it's PayMongo's
branding, not yours), and the customer briefly leaves your domain — which can
feel like a discontinuity in the experience. In exchange you get PCI-scope
reduction (raw card numbers never touch your servers) and a much smaller
integration (§2 table: 1 endpoint + 1 redirect vs. multiple endpoints, a
client SDK, and a webhook listener).

## 5. Optional stretch goal (§9)

Replace the "trust the redirect + re-verify" pattern in `success.html` with a
real PayMongo webhook: add a `POST /webhooks/paymongo` route to
`payment-service` that PayMongo calls server-to-server when a `checkout_session`
is paid, and have *that* update the Order Service instead of the browser
triggering the verification.
