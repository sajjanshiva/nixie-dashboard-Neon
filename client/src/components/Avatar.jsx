import React from "react";

const TONES = {
  client: { bg: "#DCFCE7", fg: "#166534" },
  admin: { bg: "#E0E7FF", fg: "#3730A3" },
  staff: { bg: "#FEF3C7", fg: "#92400E" },
};

export default function Avatar({ name = "?", tone = "admin", className = "h-8 w-8 text-[11px]" }) {
  const safeName = typeof name === "string" && name.trim() ? name.trim() : "?";
  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0] || "")
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
  const t = TONES[tone] || TONES.admin;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
      style={{ background: t.bg, color: t.fg }}
    >
      {initials}
    </div>
  );
}
