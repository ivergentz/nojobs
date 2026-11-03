import type { Config } from "tailwindcss";

/**
 * Designsystem nojobs · „Calm Intelligence“
 *
 * Die alten Farbnamen (ink, paper, rule, muted, keep, drop) bleiben bestehen und
 * zeigen auf die neue Palette — so passt jede Seite zusammen.
 *   paper   App-Hintergrund (warm, hell)       surface  Karten und Felder (weiß)
 *   ink     Text, sehr dunkles Anthrazit        muted    Nebentext (Kontrast ≥ 4.5:1)
 *   rule    Linien und Rahmen                   subtle   zarte Flächen (Hover, Tabellenkopf)
 *   brand   Petrol — Primärfarbe, aktive Navigation, Links, Fokus
 *   keep    Grün — positive Signale (Bewerben, Pluspunkte, Erfolg)
 *   warn    Orange — Hinweise, Einschränkungen
 *   drop    Rot — Fehler, Minuspunkte, Warnungen
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1b1d22",
        paper: "#f6f5f1",
        surface: "#ffffff",
        subtle: "#efeee9",
        rule: "#e2e0da",
        muted: "#62656d",
        brand: { DEFAULT: "#1d5c68", strong: "#164a54", soft: "#e5eff0" },
        keep: { DEFAULT: "#2b7350", soft: "#e7f2ec" },
        warn: { DEFAULT: "#a35c12", soft: "#fbefe1" },
        drop: { DEFAULT: "#b0433a", soft: "#f9e9e7" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Typografieskala: Metadaten 12 · Text 14/15 · Kartentitel 16/17 · Abschnitt 18 · Seitentitel 24/28 · Kennzahl 28
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(27,29,34,0.04), 0 1px 3px rgba(27,29,34,0.04)",
        raised: "0 4px 16px -4px rgba(27,29,34,0.12), 0 2px 4px rgba(27,29,34,0.04)",
      },
      transitionDuration: { DEFAULT: "150ms" },
    },
  },
  plugins: [],
};

export default config;
