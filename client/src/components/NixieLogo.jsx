import React from "react";

export default function NixieLogo({ size = 28 }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent shadow-sm"
    >
      <span style={{ fontSize: size * 0.42, lineHeight: 1 }} className="font-bold tracking-tight text-white select-none">
        N
      </span>
    </div>
  );
}