import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0A1628",
          50: "#1A2A4A",
          100: "#0F1F3D",
          200: "#0D1A33",
          300: "#0A1628",
          400: "#081220",
          500: "#060E18",
          600: "#040A10",
          700: "#020608",
          800: "#000000",
          900: "#000000",
          950: "#000000",
        },
        amber: {
          DEFAULT: "#F5A623",
          50: "#FEF3E2",
          100: "#FDE8C5",
          200: "#FAD28B",
          300: "#F7BC51",
          400: "#F5A623",
          500: "#E08D0A",
          600: "#B37008",
          700: "#865406",
          800: "#593804",
          900: "#2D1C02",
        },
        emerald: {
          DEFAULT: "#10B981",
        },
        rose: {
          DEFAULT: "#F43F5E",
        },
        surface: "#0F1F3D",
      },
      fontFamily: {
        sans: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "scale-in": "scaleIn 0.2s ease-out",
        "count-up": "countUp 2s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        countUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 5px rgba(245, 166, 35, 0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(245, 166, 35, 0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
