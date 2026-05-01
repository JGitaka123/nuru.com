import type { Config } from "tailwindcss";

const config: Config = {
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
        ink: {
          50: "#f6f7f9",
          100: "#ecedf2",
          200: "#d5d8e1",
          300: "#b1b6c5",
          400: "#878fa5",
          500: "#6b7389",
          600: "#555c70",
          700: "#454b5b",
          800: "#3b404e",
          900: "#1f232c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
