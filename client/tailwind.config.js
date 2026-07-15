/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#faf8f5",
          100: "#f0ebe4",
          200: "#e0d5c8",
          300: "#c9b8a4",
          400: "#b09a80",
          500: "#9a8068",
          600: "#86705c",
          700: "#6e5b4c",
          800: "#5c4d42",
          900: "#4d4138",
          950: "#2a221d",
        },
        desk: {
          bg: "#23201b",
          surface: "#2b2722",
          elevated: "#353029",
          border: "#464036",
          hover: "#524b40",
        },
        amber: {
          glow: "#e8a84c",
          warm: "#d4903a",
          muted: "#b87d34",
          dim: "#8a5f28",
        },
        paper: {
          white: "#f5f0e8",
          cream: "#ece5d8",
          aged: "#d8cfc0",
        },
      },
      fontFamily: {
        display: ['"Newsreader"', '"Noto Serif KR"', "Georgia", "serif"],
        body: ['"Pretendard"', '"Noto Sans KR"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', '"Fira Code"', "monospace"],
        guess: ['"Guess Sans W00 Heavy"', "sans-serif"],
        lemon: ['"Lemon Milk Pro"', "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.4s ease-out forwards",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "drop-zone": "dropZone 0.3s ease-out forwards",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
        dropZone: {
          from: { opacity: "0", backdropFilter: "blur(0px)" },
          to: { opacity: "1", backdropFilter: "blur(8px)" },
        },
      },
    },
  },
  plugins: [],
};
