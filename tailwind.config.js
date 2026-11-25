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
        obsidian: "#0D1117",
        navy: "#131B2E",
        surface: "#161F33",
        "surface-hover": "#1C2740",
        "border-subtle": "#26324D",
        emerald: {
          DEFAULT: "#10B981",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
        },
        blurple: {
          DEFAULT: "#5865F2",
          hover: "#4752C4",
        },
        ink: {
          primary: "#F8FAFC",
          muted: "#94A3B8",
        },
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 24px 60px -15px rgba(2, 6, 23, 0.7), 0 0 0 1px rgba(38, 50, 77, 0.8)",
        glow: "0 0 40px -10px rgba(16, 185, 129, 0.35)",
      },
    },
  },
  plugins: [],
};
