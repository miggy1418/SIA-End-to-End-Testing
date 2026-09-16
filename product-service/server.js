/**
 * PRODUCT SERVICE
 * -----------------------------------------------------------------------
 * Responsibility (per activity spec, Section 3):
 *   "Exposes a REST endpoint listing items for sale (name, price in
 *    centavos, description)."
 *
 * This service knows NOTHING about orders or payments. That separation
 * is the point of the exercise: swap this service out (e.g. connect it
 * to a real product database) and nothing else in the system has to change.
 * -----------------------------------------------------------------------
 */
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4001;

// In-memory catalog: 3 t-shirt choices, as requested.
// price is stored in CENTAVOS, exactly like PayMongo expects downstream
// (this is the same unit the Payment Service will forward untouched).
const PRODUCTS = [
  {
    id: "shirt-01",
    name: "SIA1 Classic Tee",
    price: 35000, // PHP 350.00
    currency: "PHP",
    description: "Official class shirt. 100% cotton, unisex fit.",
    image: "https://placehold.co/400x400/1B2A4A/F5C518?text=Classic+Tee",
  },
  {
    id: "shirt-02",
    name: "SIA1 Canteen Tee",
    price: 29500, // PHP 295.00
    currency: "PHP",
    description: "Lightweight everyday tee, canteen exclusive print.",
    image: "https://placehold.co/400x400/2E7D4F/FAF7F0?text=Canteen+Tee",
  },
  {
    id: "shirt-03",
    name: "SIA1 Alumni Tee",
    price: 42000, // PHP 420.00
    currency: "PHP",
    description: "Premium heavyweight tee for graduating batches.",
    image: "https://placehold.co/400x400/C0392B/FAF7F0?text=Alumni+Tee",
  },
];

app.get("/health", (_req, res) => res.json({ service: "product-service", status: "ok" }));

// GET /products -> list all t-shirts
app.get("/products", (_req, res) => {
  res.json({ data: PRODUCTS });
});

// GET /products/:id -> single t-shirt (used by Order Service to validate + price an order)
app.get("/products/:id", (req, res) => {
  const product = PRODUCTS.find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ data: product });
});

app.listen(PORT, () => {
  console.log(`[product-service] listening on http://localhost:${PORT}`);
});
