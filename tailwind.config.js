/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class", // ← important
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // add any other folders you use
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#88E788",
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e", // close neighbor – good fallback
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        // You can add more semantic colors later
        surface: {
          light: "#ffffff",
          dark: "#0f1215", // very dark almost black – modern feel
        },
        muted: {
          light: "#6b7280",
          dark: "#9ca3af",
        },
      },
    },
  },
  plugins: [],
};
