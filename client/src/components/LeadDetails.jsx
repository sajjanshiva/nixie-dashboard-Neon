import React from "react";

// Shared field ordering for a lead's detail view — used by both the admin
// (ShopifyInbox) and staff (MyLeads) "View Details" modals, so the two
// never drift apart. Important, at-a-glance fields first; address block
// (less urgent, order-fulfillment-related) at the end.
//
// If the lead has an image, it renders alongside the details (left on
// desktop, stacked on top on mobile) instead of as a plain "open in new
// tab" link. No image → just the details, full width, no placeholder.
export default function LeadDetails({ lead }) {
  const primaryRows = [
    ["Lead number", lead.lead_number],
    ["Name", lead.name],
    ["Phone", lead.phone],
    ["Email", lead.email],
  ];
  const outfitRows = [
    ["Outfit type", lead.outfit_type],
    ["Primary fabric", lead.primary_fabric],
    ["Secondary fabrics", (lead.secondary_fabrics || []).join(", ")],
    ["Price estimate", lead.price_estimate],
    ["Status", lead.status],
    ["Message", lead.message],
  ];
  const addressRows = [
    ["Address", lead.address],
    ["City", lead.city],
    ["State", lead.state],
    ["Pincode", lead.pincode],
  ];

  const Row = ([label, value]) => (
    <div key={label} className="flex justify-between gap-3 border-b border-slate-50 py-1.5 dark:border-white/6">
      <dt className="text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="text-right text-slate-700 dark:text-slate-200">{value || "—"}</dd>
    </div>
  );

  const details = (
    <dl className="space-y-2 text-[13px]">
      {primaryRows.map(Row)}
      {outfitRows.map(Row)}
      <p className="pt-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Address</p>
      {addressRows.map(Row)}
    </dl>
  );

  if (!lead.image_url) return details;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <a
        href={lead.image_url}
        target="_blank"
        rel="noreferrer"
        className="block w-full shrink-0 sm:w-[42%]"
        title="Open full size"
      >
        <img
          src={lead.image_url}
          alt="Outfit reference"
          className="h-56 w-full rounded-xl border border-slate-100 bg-slate-50 object-contain dark:border-white/10 dark:bg-white/5 sm:h-auto"
        />
      </a>
      <div className="flex-1 min-w-0">{details}</div>
    </div>
  );
}