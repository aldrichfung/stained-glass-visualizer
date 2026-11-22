/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#050505",
        panel: "#1f1f1f",
        widget: "#424242",
        ink: "#ebebeb",
        dim: "#9a9a9a",
        accent: "#2cc9ff",
        lime: "#a2db3c",
      },
      fontFamily: {
        mono: ["ui-monospace", "Menlo", "Monaco", "Consolas", "monospace"],
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
