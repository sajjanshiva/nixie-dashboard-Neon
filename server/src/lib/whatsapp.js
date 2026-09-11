// Thin wrapper around the WhatsApp Business Cloud API (Meta).
// Swap this file's internals for Twilio/Gupshup if you use a different
// provider — everything that calls sendWhatsAppMessage() stays the same.
const VERSION = process.env.WHATSAPP_API_VERSION || "v19.0";

// Numbers get typed/stored in all sorts of local formats — "8867685299",
// "08867685299", "+91 88676 85299" — but Meta's API needs the full
// international format with country code and no symbols (e.g.
// "918867685299"). Without this, a 10-digit local number gets sent to
// Meta as-is, which doesn't match any real WhatsApp account and fails
// with "Recipient phone number not in allowed list" (or just silently
// never reaches a real number in production).
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  const defaultCountryCode = process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "91";

  if (digits.length === 10) {
    // Plain local number, no country code at all.
    return defaultCountryCode + digits;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    // Domestic dialing format with a leading 0 (e.g. "08867685299").
    return defaultCountryCode + digits.slice(1);
  }
  // Already has a country code (or something unusual) — leave as-is.
  return digits;
}

export async function sendWhatsAppMessage(toPhone, text) {
  if (!toPhone) {
    console.warn("sendWhatsAppMessage: no phone number on this task, skipping send.");
    return { skipped: true };
  }
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) {
    console.warn("WhatsApp credentials not configured — message not sent:", text);
    return { skipped: true };
  }

  const normalized = normalizePhone(toPhone);

  const res = await fetch(`https://graph.facebook.com/${VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalized,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`WhatsApp send failed: ${err}`);
  }
  return res.json();
}