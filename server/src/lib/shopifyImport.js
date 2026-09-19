import { pool } from "./db.js";
import { notifyAllAdmins } from "./notify.js";
import { shopifyAdminFetchPaginated } from "./shopifyAuth.js";

// Line-item custom properties come back from Shopify as an array of
// { name, value } pairs (this is what "customAttributes" on the GraphQL
// draftOrderCreate mutation becomes in the REST payload). This turns
// that array into a plain lookup object, and separately collects every
// "Secondary Fabric N" entry into a list.
export function parseLineItemProperties(properties = []) {
  const list = Array.isArray(properties)
    ? properties
    : Object.entries(properties || {}).map(([name, value]) => ({ name, value }));
  const map = {};
  const secondaryFabrics = [];
  for (const prop of list) {
    if (!prop?.name) continue;
    if (/^secondary fabric/i.test(prop.name)) {
      if (prop.value) secondaryFabrics.push(prop.value);
    } else {
      map[prop.name] = prop.value;
    }
  }
  return { map, secondaryFabrics };
}

export async function upsertLeadFromDraft(draft, { notify = false } = {}) {
  const lineItem = draft.line_items?.[0] || {};
  const { map, secondaryFabrics } = parseLineItemProperties(lineItem.properties);
  const leadNumber = draft.name || null;

  if (leadNumber) {
    const { rows: existing } = await pool.query(
      "select * from shopify_leads where lead_number = $1",
      [leadNumber]
    );
    if (existing[0]) return { lead: existing[0], created: false };
  }

  try {
    const { rows } = await pool.query(
      `insert into shopify_leads
         (lead_number, name, phone, email, address, city, state, pincode, outfit_type, primary_fabric, secondary_fabrics, price_estimate, image_url, status, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'unassigned', coalesce($14::timestamptz, now()))
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
        draft.created_at || null,
      ]
    );

    if (notify) {
      await notifyAllAdmins(`New lead: ${rows[0].name || "Unknown"}`, "/admin/shopify-inbox");
    }
    return { lead: rows[0], created: true };
  } catch (err) {
    if (err.code === "23505") {
      // A near-simultaneous webhook retry inserted this lead_number between
      // our check above and this insert (same race upsertPaidOrder guards
      // against) — fetch what's there now instead of 500ing back to Shopify.
      const { rows: existing } = await pool.query(
        "select * from shopify_leads where lead_number = $1",
        [leadNumber]
      );
      return { lead: existing[0] || null, created: false };
    }
    throw err;
  }
}

export async function upsertPaidOrder(order, { notify = false } = {}) {
  if (order.financial_status && order.financial_status !== "paid") {
    return { order: null, created: false, skipped: true };
  }

  const shopifyOrderId = String(order.id);
  const { rows: existing } = await pool.query(
    "select * from shopify_orders where shopify_order_id = $1",
    [shopifyOrderId]
  );
  if (existing[0]) return { order: existing[0], created: false };

  const items = (order.line_items || []).map((li) => `${li.quantity}x ${li.title}`).join(", ");
  try {
    const { rows } = await pool.query(
      `insert into shopify_orders (order_number, customer_name, customer_phone, items, price, shopify_order_id, status, created_at)
       values ($1, $2, $3, $4, $5, $6, 'unassigned', coalesce($7::timestamptz, now()))
       returning *`,
      [
        order.name,
        [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") || order.email,
        order.customer?.phone || order.shipping_address?.phone || null,
        items,
        `${order.currency} ${order.total_price}`,
        shopifyOrderId,
        order.created_at || null,
      ]
    );
    if (notify) {
      await notifyAllAdmins(`New order: ${rows[0].order_number || "Unknown"}`, "/admin/shopify-inbox");
    }
    return { order: rows[0], created: true };
  } catch (err) {
    if (err.code === "23505") return { order: null, created: false };
    throw err;
  }
}

// Pulls existing Shopify draft orders (leads) and paid orders into the
// inbox. Webhooks only fire for events AFTER they were registered, so
// anything created before go-live never arrived. Safe to re-run: already
// imported rows are skipped. Does not send admin notifications.
export async function syncShopifyInbox() {
  const leads = { imported: 0, skipped: 0 };
  const orders = { imported: 0, skipped: 0 };

  const draftStatuses = ["open", "invoice_sent", "completed"];
  const seenDraftIds = new Set();
  for (const status of draftStatuses) {
    const drafts = await shopifyAdminFetchPaginated(
      `/draft_orders.json?limit=250&status=${status}`,
      "draft_orders"
    );
    for (const draft of drafts) {
      if (seenDraftIds.has(draft.id)) continue;
      seenDraftIds.add(draft.id);
      const { created } = await upsertLeadFromDraft(draft, { notify: false });
      if (created) leads.imported += 1;
      else leads.skipped += 1;
    }
  }

  const paidOrders = await shopifyAdminFetchPaginated(
    "/orders.json?limit=250&status=any&financial_status=paid",
    "orders"
  );
  for (const order of paidOrders) {
    const result = await upsertPaidOrder(order, { notify: false });
    if (result.skipped) continue;
    if (result.created) orders.imported += 1;
    else orders.skipped += 1;
  }

  return { leads, orders };
}