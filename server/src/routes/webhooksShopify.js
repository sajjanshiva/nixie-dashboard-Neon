import { Router } from "express";
import crypto from "crypto";
import { pool } from "../lib/db.js";
import { notifyAllAdmins } from "../lib/notify.js";

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

// Line-item custom properties come back from Shopify as an array of
// { name, value } pairs (this is what "customAttributes" on the GraphQL
// draftOrderCreate mutation becomes in the REST webhook payload). This
// turns that array into a plain lookup object, and separately collects
// every "Secondary Fabric N" entry into a list since there can be any
// number of them (including zero).
function parseLineItemProperties(properties = []) {
  const map = {};
  const secondaryFabrics = [];
  for (const prop of properties) {
    if (/^secondary fabric/i.test(prop.name)) {
      if (prop.value) secondaryFabrics.push(prop.value);
    } else {
      map[prop.name] = prop.value;
    }
  }
  return { map, secondaryFabrics };
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

  const items = (order.line_items || []).map((li) => `${li.quantity}x ${li.title}`).join(", ");
  const shopifyOrderId = String(order.id);

  let rows;
  try {
    ({ rows } = await pool.query(
      `insert into shopify_orders (order_number, customer_name, customer_phone, items, price, shopify_order_id, status)
       values ($1, $2, $3, $4, $5, $6, 'unassigned') returning *`,
      [
        order.name,
        [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || order.email,
        order.customer?.phone || order.shipping_address?.phone || null,
        items,
        `${order.currency} ${order.total_price}`,
        shopifyOrderId,
      ]
    ));
  } catch (err) {
    if (err.code === "23505") {
      // Duplicate delivery of a webhook we've already processed (Shopify
      // retries automatically on any non-200 response) — this is the
      // EXPECTED, normal case for a retry, not an error. Returning 200
      // tells Shopify the delivery succeeded so it stops retrying;
      // returning 500 here would just make it keep retrying forever.
      console.log(`Duplicate order webhook for ${shopifyOrderId} — already processed, ignoring.`);
      return res.status(200).send("already processed");
    }
    console.error("Failed to save Shopify order:", err.message);
    return res.status(500).send("DB error");
  }

  // Replaces trg_notify_admins_new_order.
  await notifyAllAdmins(`New order: ${rows[0].order_number || "Unknown"}`, "/admin/shopify-inbox");

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
  const lineItem = draft.line_items?.[0] || {};
  const { map, secondaryFabrics } = parseLineItemProperties(lineItem.properties);
  const leadNumber = draft.name;

  let rows;
  try {
    ({ rows } = await pool.query(
      `insert into shopify_leads
         (lead_number, name, phone, email, address, city, state, pincode, outfit_type, primary_fabric, secondary_fabrics, price_estimate, image_url, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'unassigned')
       returning *`,
      [
        leadNumber,
        map["Name"] || null,
        map["Phone"] || null,
        map["Email"] || null,
        map["Address"] || null,
        map["City"] || null,
        map["State"] || null,
        map["Pincode"] || null,
        map["Outfit Type"] || lineItem.title || null,
        map["Primary Fabric"] || null,
        secondaryFabrics,
        lineItem.price || draft.total_price || null,
        map["Main Outfit Image"] || null,
      ]
    ));
  } catch (err) {
    if (err.code === "23505") {
      // Same as the orders webhook — a duplicate delivery of a draft
      // order we've already turned into a lead. Expected on retries,
      // not an error; 200 tells Shopify to stop retrying.
      console.log(`Duplicate lead webhook for ${leadNumber} — already processed, ignoring.`);
      return res.status(200).send("already processed");
    }
    console.error("Failed to save Shopify lead:", err.message);
    return res.status(500).send("DB error");
  }

  // Replaces trg_notify_admins_new_lead.
  await notifyAllAdmins(`New lead: ${rows[0].name || "Unknown"}`, "/admin/shopify-inbox");

  res.status(200).send("ok");
});

export default router;