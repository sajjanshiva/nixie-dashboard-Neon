/** @type {import('tailwindcss').Config} */
//
// ── THEME COLOR — change the whole dashboard in ONE place ──────────────
//
//  accent   → main brand colour (buttons, active nav, progress bars, badges)
//  danger   → notification dot, overdue badge, error states  (#FF6B5E coral)
//
// Presets (uncomment one):
//   Cyan / Nixie (default): DEFAULT:"#22D3D3"  soft:"#E0FAFA"  text:"#0E9494"
//   Blue:                   DEFAULT:"#2563EB"  soft:"#EFF6FF"  text:"#1D4ED8"
//   Indigo:                 DEFAULT:"#4F46E5"  soft:"#EEF2FF"  text:"#3730A3"
//   Navy:                   DEFAULT:"#1E3A8A"  soft:"#EFF3FB"  text:"#1E3A8A"
//   Green:                  DEFAULT:"#059669"  soft:"#ECFDF5"  text:"#047857"
//
export default {
  darkMode: "class",                          // toggled by adding `dark` to <html>
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#22D3D3",   // Nixie cyan — swap this to re-theme everything
          soft:    "#E0FAFA",   // light tinted background
          text:    "#0E9494",   // darker shade for text on white
          dark:    "#19BABA",   // slightly deeper for hover states
        },
        danger: {
          DEFAULT: "#FF6B5E",   // coral-red — notifications, overdue, errors
          soft:    "#FFF1F0",
          text:    "#D94F44",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 4px 24px 0 rgba(0,0,0,0.08)",
        "glass-dark": "0 4px 24px 0 rgba(0,0,0,0.32)",
        card:  "0 1px 4px 0 rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
      },
      backgroundImage: {
        "glass-gradient": "linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)",
        "glass-dark-gradient": "linear-gradient(135deg, rgba(30,30,46,0.9) 0%, rgba(20,20,35,0.7) 100%)",
      },
      animation: {
        "slide-in-right": "slideInRight 0.28s cubic-bezier(0.22,1,0.36,1)",
        "slide-in-up":    "slideInUp 0.26s cubic-bezier(0.22,1,0.36,1)",
        "fade-in":        "fadeIn 0.2s ease",
      },
      keyframes: {
        slideInRight: {
          "0%":   { transform: "translateX(100%)", opacity: 0 },
          "100%": { transform: "translateX(0)",    opacity: 1 },
        },
        slideInUp: {
          "0%":   { transform: "translateY(100%)", opacity: 0 },
          "100%": { transform: "translateY(0)",    opacity: 1 },
        },
        fadeIn: {
          "0%":   { opacity: 0 },
          "100%": { opacity: 1 },
        },
      },
    },
  },
  plugins: [],
};
