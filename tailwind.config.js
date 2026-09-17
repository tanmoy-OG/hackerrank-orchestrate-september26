/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        apple: {
          blue: "#0071e3",
          gray: "#f5f5f7",
          dark: "#1d1d1f",
          border: "#d2d2d7",
        },
        google: {
          blue: "#1a73e8",
          red: "#ea4335",
          yellow: "#fbbc04",
          green: "#34a853",
          gray: "#5f6368",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "San Francisco",
          "Helvetica Neue",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
