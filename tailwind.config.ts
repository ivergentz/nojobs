import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16181d",
        paper: "#fbfbf9",
        rule: "#d9d8d2",
        muted: "#6d6f76",
        keep: "#1f6f4a",
        drop: "#9a4a2f",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
