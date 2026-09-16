/**
 * PAYMENT SERVICE
 * -----------------------------------------------------------------------
 * Responsibility (per activity spec, Section 3):
 *   "The only service that talks to PayMongo. It receives an order from
 *    the Order Service, calls PayMongo's Checkout API, and returns the
 *    hosted checkout URL to redirect the customer to."
 *
 * WHY THIS MATTERS (this is also your reflection deliverable, Section 7):
 *   The PayMongo secret key (sk_test_...) lives ONLY in this service's
 *   environment variables. Product Service and Order Service never see it,
 *   the browser never sees it. If PayMongo were ever swapped for another
 *   gateway, this is the only file that would change (Section 3).
 *
 * FLOW (Section 5-6 of the activity):
 *   1. Browser -> POST /checkout { orderId }
 *   2. This service fetches the order from Order Service (to get the
 *      authoritative price -- never trust a price sent from the browser)
 *   3. This service calls POST https://api.paymongo.com/v1/checkout_sessions
 *      using Basic Auth: base64(secret_key:)
 *   4. PayMongo returns a checkout_url -> we hand that back to the browser
 *   5. Browser redirects to checkout_url (PayMongo's own hosted page)
 *   6. PayMongo redirects back to success_url/cancel_url when done
 *   7. Since this activity skips webhooks (Section 9), the success page
 *      calls GET /checkout/:sessionId/verify, which re-checks the session
 *      status directly with PayMongo before marking the order paid --
 *      this is safer than blindly trusting the redirect happened.
 * -----------------------------------------------------------------------
 */
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4003;
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://localhost:4002";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5500";

// PayMongo TEST secret key only. Never a live key (sk_live_...) -- see
// activity Section 9 instructor note. Set this in a real .env file;
// it is intentionally NOT committed with a real value.
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || "";

if (!PAYMONGO_SECRET_KEY.startsWith("sk_test_")) {
  console.warn(
    "[payment-service] WARNING: PAYMONGO_SECRET_KEY is missing or is not a sk_test_ key. " +
      "Set it in payment-service/.env before creating real checkout sessions."
  );
}

function paymongoAuthHeader() {
  return "Basic " + Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64");
}

app.get("/health", (_req, res) => res.json({ service: "payment-service", status: "ok" }));

// POST /checkout  { orderId }
app.post("/checkout", async (req, res) => {
  const { orderId } = req.body || {};
  if (!orderId) return res.status(400).json({ error: "orderId is required" });

  try {
    // 1. Get the authoritative order + price from Order Service
    const orderRes = await fetch(`${ORDER_SERVICE_URL}/orders/${orderId}`);
    if (!orderRes.ok) return res.status(404).json({ error: "Order not found" });
    const { data: order } = await orderRes.json();

    console.log("[payment-service] Order received:", order); //add new

    if (order.status !== "pending") {
      return res.status(409).json({ error: `Order is already ${order.status}` });
    }

    // 2. Build the Checkout Session request exactly per PayMongo's spec
    //    (activity Section 5). amount is already in centavos.
    const payload = {
      data: {
        attributes: {
          line_items: [
            {
              name: order.productName,
              quantity: order.quantity,
              amount: order.amount,
              currency: order.currency,
              description: `Order ${order.id}`,
            },
          ],
          payment_method_types: ["card", "gcash", "paymaya"],
          description: `Order ${order.id}`,
          send_email_receipt: false,
          show_line_items: true,
          success_url: `${FRONTEND_URL}/success.html?order=${order.id}`,
          cancel_url: `${FRONTEND_URL}/cancel.html?order=${order.id}`,
        },
      },
    };

    const pmRes = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: paymongoAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const pmData = await pmRes.json();

    if (!pmRes.ok) {
      console.error("[payment-service] PayMongo error:", pmData);
      return res.status(502).json({ error: "PayMongo request failed", details: pmData });
    }

    const session = pmData.data;
    res.json({
      data: {
        orderId: order.id,
        checkoutSessionId: session.id,
        checkoutUrl: session.attributes.checkout_url,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error creating checkout session" });
  }
});

// GET /checkout/:sessionId/verify?order=ORD-XXXX
// Called from success.html. Re-checks payment status directly with
// PayMongo (instead of trusting the redirect alone) then marks the
// order paid via Order Service.
app.get("/checkout/:sessionId/verify", async (req, res) => {
  const { sessionId } = req.params;
  const { order: orderId } = req.query;

  try {
    const pmRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
      headers: { Authorization: paymongoAuthHeader() },
    });
    const pmData = await pmRes.json();
    if (!pmRes.ok) return res.status(502).json({ error: "Could not verify session", details: pmData });

    const payments = pmData.data.attributes.payments || [];
    const isPaid = payments.some((p) => p.attributes.status === "paid");

    if (isPaid && orderId) {
      await fetch(`${ORDER_SERVICE_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
    }

    res.json({ data: { paid: isPaid, raw: pmData.data } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error verifying checkout session" });
  }
});

app.listen(PORT, () => {
  console.log(`[payment-service] listening on http://localhost:${PORT}`);
});
