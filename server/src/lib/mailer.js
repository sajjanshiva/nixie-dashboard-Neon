import "dotenv/config";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for 587/others
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // e.g. a Gmail App Password, not the account password
  },
});

export async function sendInviteEmail({ to, role, inviteUrl }) {
  const roleLabel = role === "admin" ? "an Admin" : "a Staff member";
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: "You've been invited to Nixie Dashboard",
    html: `
      <p>You've been invited to join <strong>Nixie Dashboard</strong> as ${roleLabel}.</p>
      <p>Click the link below to set your name and password. This link is valid for 7 days.</p>
      <p><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p>If you weren't expecting this, you can ignore this email.</p>
    `,
  });
}
