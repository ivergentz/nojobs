/**
 * Phase 4 · Gemeinsame Daten für alle Layouts (weitere Profile).
 * Dein Lebenslauf (ivergentz.de-Design) bleibt davon unberührt.
 */

export type Kontakt = { ort: string; email: string; telefon: string; linkedin?: string; xing?: string; web?: string };

export type UnterlagenCv = {
  name: string;
  titel: string; // Zeile unter dem Namen, z. B. „Teamleitung Kundenservice“
  kontakt: Kontakt;
  foto?: string | null; // Daten-URL oder Dateipfad (JPEG/PNG)
  kurzprofil: string;
  stationen: Array<{ zeitraum: string; titel: string; arbeitgeber: string; ort: string; stichpunkte: string[] }>;
  ausbildung: Array<{ zeitraum: string; abschluss: string; einrichtung: string }>;
  kenntnisse: string[];
  sprachen: Array<{ sprache: string; niveau: string }>;
};

export type UnterlagenBrief = {
  empfaenger: string[];
  ortDatum: string;
  betreff: string;
  anrede: string;
  absaetze: string[];
  schluss: string;
  gruss: string;
};

export type LayoutId = "editorial" | "klassisch" | "seitenleiste" | "zeitleiste" | "minimal";

/** Fünf Akzentfarben — in jedem Layout wählbar. */
export const AKZENTE = {
  petrol: "#1D5C68",
  bordeaux: "#8E2436",
  nachtblau: "#22325C",
  wald: "#2F5D45",
  graphit: "#3A3A3A",
} as const;
export type AkzentId = keyof typeof AKZENTE;

export type LayoutOptionen = { akzent: string; mitFoto: boolean };

export const LAYOUTS: Array<{ id: LayoutId; name: string; charakter: string; passtZu: string; fotoMoeglich: boolean }> = [
  { id: "editorial", name: "Editorial", charakter: "Große Display-Schrift, Label-Spalte links, kursive Akzente", passtZu: "Produkt, Digital, Kreativbranche", fotoMoeglich: true },
  { id: "klassisch", name: "Klassisch", charakter: "Serifenschrift, zentrierter Kopf, eine Spalte, feine Linien", passtZu: "Verwaltung, Banken, Kanzleien, öffentlicher Dienst", fotoMoeglich: true },
  { id: "seitenleiste", name: "Seitenleiste", charakter: "Farbige Spalte links mit Foto, Kontakt, Kenntnissen", passtZu: "Agenturen, Startups, Vertrieb", fotoMoeglich: true },
  { id: "zeitleiste", name: "Zeitleiste", charakter: "Werdegang als Zeitstrahl, weiche Formen, Kurzprofil oben", passtZu: "Soziales, Bildung, Pflege, Handwerk", fotoMoeglich: true },
  { id: "minimal", name: "Minimal (ATS)", charakter: "Eine Spalte, keine Grafik, kein Foto — maximal maschinenlesbar", passtZu: "Konzerne mit Bewerbermanagement-Systemen", fotoMoeglich: false },
];

export function kontaktZeilen(k: Kontakt): string[] {
  return [k.ort, k.telefon, k.email, k.linkedin, k.xing, k.web].filter((x): x is string => Boolean(x && x.trim()));
}

/** Unbekannte Werte fallen auf sichere Standards zurück (Editorial, Petrol, mit Foto). */
export function optionenAus(e: { layout?: unknown; akzent?: unknown; mitFoto?: unknown } | null | undefined): { layout: LayoutId; akzentId: AkzentId; o: LayoutOptionen } {
  const layout = LAYOUTS.some((l) => l.id === e?.layout) ? (e!.layout as LayoutId) : "editorial";
  const akzentId = typeof e?.akzent === "string" && Object.hasOwn(AKZENTE, e.akzent) ? (e.akzent as AkzentId) : "petrol";
  const fotoMoeglich = LAYOUTS.find((l) => l.id === layout)!.fotoMoeglich;
  return { layout, akzentId, o: { akzent: AKZENTE[akzentId], mitFoto: fotoMoeglich && e?.mitFoto !== false } };
}

