// Sends invite emails via Brevo's HTTP API (not SMTP) — this is the
// whole reason we switched: Render's free tier blocks outbound SMTP
// ports entirely, but a plain HTTPS API call like this is unaffected.
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_TIMEOUT_MS = 8_000;

export async function sendInviteEmail({ to, role, title, inviteUrl }) {
  const roleLabel = title
    ? `${/^[aeiou]/i.test(title) ? "an" : "a"} ${title}`
    : role === "admin" ? "an Admin" : "a Staff member";

  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "Nixie Dashboard", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: "You've been invited to Nixie Dashboard",
      htmlContent: `
        <p>You've been invited to join <strong>Nixie Dashboard</strong> as ${roleLabel}.</p>
        <p>Click the link below to set your name and password. This link is valid for 7 days.</p>
        <p><a href="${inviteUrl}">${inviteUrl}</a></p>
        <p>If you weren't expecting this, you can ignore this email.</p>
      `,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${errBody}`);
  }
}

export async function sendResetEmail({ to, resetUrl }) {
  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(BREVO_TIMEOUT_MS),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: process.env.BREVO_SENDER_NAME || "Nixie Dashboard", email: process.env.BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: "Reset your Nixie Dashboard password",
      htmlContent: `
        <p>We got a request to reset your password for <strong>Nixie Dashboard</strong>.</p>
        <p>Click the link below to set a new password. This link is valid for 1 hour.</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>If you didn't request this, you can safely ignore this email — your password won't change.</p>
      `,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${errBody}`);
  }
}