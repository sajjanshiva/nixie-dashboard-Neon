import { Router } from "express";
import crypto from "crypto";
import { upsertLeadFromDraft, upsertPaidOrder } from "../lib/shopifyImport.js";

const router = Router();

// Shopify webhooks send the raw JSON body and an HMAC signature computed
// over those exact bytes — so this router uses express.raw() (mounted in
// index.js) instead of the app-wide express.json(), and verifies the
// signature BEFORE trusting anything in the payload.
function verifyShopifyHmac(req) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!hmacHeader || !secret) return false;
  const digest = crypto.createHmac("sha256", secret).update(req.body).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    // timingSafeEqual throws if the two buffers differ in length — that's
    // just an invalid signature, not a crash-worthy error.
    return false;
  }
}

// POST /webhooks/shopify/orders-paid
// Fires only once an order's payment actually goes through (financial_status
// becomes "paid"). Real orders are a view-only feed in their own table —
// they no longer auto-create a task; admin re-enters a real task manually
// via "+ New Task" if one is needed for a given order.
router.post("/orders-paid", async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.status(401).send("Invalid signature");

  const order = JSON.parse(req.body.toString("utf8"));

  if (order.financial_status !== "paid") {
    return res.status(200).send("ignored (not paid)");
  }

  try {
    const { created } = await upsertPaidOrder(order, { notify: true });
    if (!created) return res.status(200).send("already processed");
  } catch (err) {
    console.error("Failed to save Shopify order:", err.message);
    return res.status(500).send("DB error");
  }

  res.status(200).send("ok");
});

// POST /webhooks/shopify/draft-orders-create
// Draft orders from the AI outfit analyzer + "Contact Me" form on the
// Nixie site → become Shopify Inbox leads. The analyzer backend stores
// everything (outfit details AND the customer's contact info) as custom
// line-item properties on a single line item — there is no real Shopify
// customer or shipping address on these draft orders — so every field
// below is read out of that one line item's `properties` array.
router.post("/draft-orders-create", async (req, res) => {
  if (!verifyShopifyHmac(req)) return res.status(401).send("Invalid signature");

  const draft = JSON.parse(req.body.toString("utf8"));

  try {
    const { created } = await upsertLeadFromDraft(draft, { notify: true });
    if (!created) return res.status(200).send("already processed");
  } catch (err) {
    console.error("Failed to save Shopify lead:", err.message);
    return res.status(500).send("DB error");
  }

  res.status(200).send("ok");
});

export default router;
