/**
 * ORDER SERVICE
 * -----------------------------------------------------------------------
 * Responsibility (per activity spec, Section 3):
 *   "Creates an order from selected products and tracks its status
 *    (pending, paid, cancelled)."
 *
 * This service talks to the Product Service to price the order, but it
 * NEVER talks to PayMongo directly. It doesn't know PayMongo exists.
 * That is entirely the Payment Service's job (Section 3 + Section 8
 * rubric line: "Secret key is never exposed client-side; stored
 * server-side only" -- isolating it to ONE service is how we guarantee that).
 * -----------------------------------------------------------------------
 */
const express = require("express");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4002;
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || "http://localhost:4001";

// In-memory order store: { id, productId, productName, quantity, amount, currency, status }
// status: "pending" | "paid" | "cancelled"
const orders = new Map();

app.get("/health", (_req, res) => res.json({ service: "order-service", status: "ok" }));

// POST /orders  { productId, quantity }
app.post("/orders", async (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  if (!productId) return res.status(400).json({ error: "productId is required" });

  try {
    const productRes = await fetch(`${PRODUCT_SERVICE_URL}/products/${productId}`);
    if (!productRes.ok) return res.status(404).json({ error: "Product not found" });
    const { data: product } = await productRes.json();

    const order = {
      id: `ORD-${randomUUID().slice(0, 8).toUpperCase()}`,
      productId: product.id,
      productName: product.name,
      quantity,
      amount: product.price * quantity, // centavos, untouched
      currency: product.currency,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    orders.set(order.id, order);
    res.status(201).json({ data: order });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "Could not reach product-service" });
  }
});

// GET /orders/:id
app.get("/orders/:id", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json({ data: order });
});

// PATCH /orders/:id/status  { status: "paid" | "cancelled" }
app.patch("/orders/:id/status", (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const { status } = req.body || {};
  if (!["pending", "paid", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }
  order.status = status;
  order.updatedAt = new Date().toISOString();
  orders.set(order.id, order);
  res.json({ data: order });
});

app.listen(PORT, () => {
  console.log(`[order-service] listening on http://localhost:${PORT}`);
});
