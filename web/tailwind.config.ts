import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Nuru accent — a refined amber ("nuru" = light in Swahili).
        brand: {
          50: "#fdf7ee",
          100: "#f9e9cf",
          200: "#f2d09b",
          300: "#eab266",
          400: "#e2963c",
          500: "#d97a1e",
          600: "#bd5f14",
          700: "#9a4816",
          800: "#7e3b18",
          900: "#683216",
        },
        // Warm neutral ramp via CSS variables so .dark inverts without
        // touching component classes (see globals.css).
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
        // Card/panel background: white in light, warm charcoal in dark.
        surface: "rgb(var(--surface) / <alpha-value>)",
      },
      fontFamily: {
        // Editorial serif for display headings; clean sans for body/UI.
        serif: [
          "Iowan Old Style", "Palatino Linotype", "Palatino", "Cambria",
          "Georgia", "ui-serif", "serif",
        ],
        sans: [
          "Inter", "ui-sans-serif", "system-ui", "-apple-system",
          "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif",
        ],
      },
      letterSpacing: {
        tightish: "-0.015em",
      },
      boxShadow: {
        card: "0 1px 2px rgb(28 25 22 / 0.04), 0 8px 24px -12px rgb(28 25 22 / 0.12)",
        lift: "0 2px 4px rgb(28 25 22 / 0.06), 0 18px 40px -16px rgb(28 25 22 / 0.22)",
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};
export default config;
