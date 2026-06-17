import type { Config } from "tailwindcss";

/**
 * Tailwind v4 — all color tokens come from CSS custom properties declared
 * in app/globals.css and exposed via the @theme inline block.
 *
 * This file keeps content paths, dark-mode strategy, font family, radii,
 * and shadow/anim shortcuts only. No hardcoded palettes.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans:    ["var(--font-jakarta)", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["var(--font-fraunces)", "Fraunces", "Georgia", "serif"],
      },
      borderRadius: {
        "4xl": "2rem",
        "5xl": "2.5rem",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        card: "var(--shadow-card)",
        pop:  "var(--shadow-pop)",
      },
      animation: {
        "fade-in":    "fadeIn 0.4s ease-out both",
        "fade-in-up": "skuli-fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-up":   "slideUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "slide-down": "slideDown 0.25s ease-out both",
        "scale-in":   "scaleIn 0.2s cubic-bezier(0.22, 1, 0.36, 1) both",
        "shimmer":    "skuli-shimmer 1.6s ease-in-out infinite",
      },
      keyframes: {
        fadeIn:           { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp:          { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        slideDown:        { "0%": { opacity: "0", transform: "translateY(-8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        scaleIn:          { "0%": { opacity: "0", transform: "scale(0.96)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        "skuli-shimmer":  { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        "skuli-fade-in-up": {
          "from": { opacity: "0", transform: "translateY(6px)" },
          "to":   { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
