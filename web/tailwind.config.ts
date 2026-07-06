import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Nuru palette: warm amber + deep navy. Swahili "nuru" = light.
        brand: {
          50: "#fff8eb",
          100: "#feecc7",
          200: "#fdd88a",
          300: "#fcbe4d",
          400: "#fba424",
          500: "#f5840b",
          600: "#d96106",
          700: "#b44308",
          800: "#92340e",
          900: "#782b0f",
        },
        // Neutrals come from CSS variables so .dark can invert the ramp
        // (see globals.css) without touching any component classes.
        ink: {
          50: "rgb(var(--ink-50) / <alpha-value>)",
          100: "rgb(var(--ink-100) / <alpha-value>)",
          200: "rgb(var(--ink-200) / <alpha-value>)",
          300: "rgb(var(--ink-300) / <alpha-value>)",
          400: "rgb(var(--ink-400) / <alpha-value>)",
          500: "rgb(var(--ink-500) / <alpha-value>)",
          600: "rgb(var(--ink-600) / <alpha-value>)",
          700: "rgb(var(--ink-700) / <alpha-value>)",
          800: "rgb(var(--ink-800) / <alpha-value>)",
          900: "rgb(var(--ink-900) / <alpha-value>)",
        },
        // Card/panel background: white in light mode, raised slate in dark.
        surface: "rgb(var(--surface) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
