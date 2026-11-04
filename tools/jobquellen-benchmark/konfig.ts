/**
 * Grenzen des Benchmarks. Alle Werte über Umgebungsvariablen änderbar, aber nach oben gedeckelt:
 * Mehr als die Höchstwerte lassen sich auch per Variable nicht einstellen.
 */

const zahl = (name: string, standard: number, max: number) => {
  const roh = Number(process.env[name]);
  const wert = Number.isFinite(roh) && roh > 0 ? Math.floor(roh) : standard;
  return Math.min(wert, max);
};

export type Konfig = {
  /** SerpApi-Suchen insgesamt (Auftrag: höchstens 30) */
  googleMax: number;
  /** Adzuna-Aufrufe insgesamt */
  adzunaMax: number;
  /** Suchanfragen je Profil und Quelle (Auftrag: höchstens 10) */
  proProfil: number;
  /** Zeitraum in Tagen (BA „veröffentlicht seit“, Adzuna max_days_old) */
  tage: number;
  /** BA: Seiten je Suchbegriff (Produktion weiterer Profile: 2) */
  baSeiten: number;
  /** BA: Stichprobe an Detailaufrufen je Profil, um die Beschreibungsqualität zu messen (kostenlos) */
  baDetails: number;
  /** Pause zwischen Adzuna-Aufrufen in ms (Standardgrenze laut Doku: 25 pro Minute) */
  adzunaPauseMs: number;
  /** SerpApi: so viele Suchen pro Tag braucht der produktive Import (GOOGLE_SUCHEN) */
  googleProduktionProTag: number;
  /** Tag im Monat, an dem das SerpApi-Kontingent neu startet (1–28); null = Monatsende annehmen */
  serpapiNeustartTag: number | null;
};

export function ladeKonfig(): Konfig {
  return {
    googleMax: zahl("BENCH_GOOGLE_MAX", 30, 30),
    adzunaMax: zahl("BENCH_ADZUNA_MAX", 30, 60),
    proProfil: zahl("BENCH_PRO_PROFIL", 10, 10),
    tage: zahl("BENCH_TAGE", 14, 30),
    baSeiten: zahl("BENCH_BA_SEITEN", 2, 3),
    baDetails: zahl("BENCH_BA_DETAILS", 15, 40),
    adzunaPauseMs: zahl("BENCH_ADZUNA_PAUSE_MS", 3000, 60_000),
    googleProduktionProTag: 7,
    serpapiNeustartTag: (() => {
      const t = Number(process.env.BENCH_SERPAPI_TAG);
      return Number.isInteger(t) && t >= 1 && t <= 28 ? t : null;
    })(),
  };
}

/** Suchanfragen je Profil, damit das Gesamtlimit nie überschritten wird. */
export function anfragenJeProfil(gesamt: number, profile: number, proProfil: number): number {
  if (profile <= 0) return 0;
  return Math.max(0, Math.min(proProfil, Math.floor(gesamt / profile)));
}
