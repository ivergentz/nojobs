/**
 * Alle Quellen, deren Stellen in Inbox, Bewertung, Labeln und Statistik
 * auftauchen. Norwegen ("nav") und Schweden ("jobstream") sind bewusst raus.
 *
 *   ba        — Jobbörse der Bundesagentur für Arbeit
 *   ats       — Karriereseiten einzelner Firmen (Personio, Greenhouse, Lever …),
 *               Liste in src/data/firmen.json
 *   google    — Google Jobs über SerpApi (enthält StepStone, LinkedIn, Indeed …)
 *   arbeitnow — Arbeitnow-Jobbörse (Deutschland, offene API)
 */
export const AKTIVE_QUELLEN = ["ba", "ats", "google", "arbeitnow"];

export const QUELLEN_NAME: Record<string, string> = {
  ba: "Arbeitsagentur",
  ats: "Karriereseite",
  google: "Google Jobs",
  arbeitnow: "Arbeitnow",
};
