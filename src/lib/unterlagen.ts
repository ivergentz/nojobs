/**
 * Phase 4.2 · Unterlagen weiterer Profile: Layout-Wahl und Daten für die PDF-Layouts.
 * Dein Profil („iver“) nutzt weiter CvDocument/LetterDocument mit den Daten deiner Website.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FOTO_BUCKET, fotoAus } from "./foto";
import type { Person } from "./lebenslauf";
import { optionenAus, type UnterlagenBrief, type UnterlagenCv } from "./pdf/layouts/typen";

export const SCHRIFT_ORDNER = "/pdf-fonts";

export type LayoutWahl = { layout: string; akzent: string; mitFoto: boolean };

/** Gespeicherte Wahl (einstellungen.unterlagen) → gültige Werte, sonst Standard. */
export function layoutWahlAus(einstellungen: Record<string, unknown> | null | undefined) {
  const u = (einstellungen ?? {}).unterlagen as Partial<LayoutWahl> | undefined;
  return optionenAus(u ?? null);
}

type CvRoh = {
  person?: Partial<Person>;
  kurzprofil?: string;
  stationen?: UnterlagenCv["stationen"];
  ausbildung?: UnterlagenCv["ausbildung"];
  kenntnisse?: string[];
  sprachen?: UnterlagenCv["sprachen"];
};

/** Ausgelesener (und ggf. bearbeiteter) Lebenslauf → Daten für ein Layout. */
export function cvAusLebenslauf(l: CvRoh, name: string, foto: string | null): UnterlagenCv {
  const p = l.person ?? {};
  const stationen = Array.isArray(l.stationen) ? l.stationen : [];
  return {
    name: p.name || name,
    titel: p.titel || stationen[0]?.titel || "",
    kontakt: {
      ort: p.ort ?? "",
      email: p.email ?? "",
      telefon: p.telefon ?? "",
      linkedin: p.linkedin || undefined,
      xing: p.xing || undefined,
    },
    foto,
    kurzprofil: l.kurzprofil ?? "",
    stationen: stationen.map((s) => ({ ...s, stichpunkte: Array.isArray(s.stichpunkte) ? s.stichpunkte : [] })),
    ausbildung: Array.isArray(l.ausbildung) ? l.ausbildung : [],
    kenntnisse: Array.isArray(l.kenntnisse) ? l.kenntnisse : [],
    sprachen: Array.isArray(l.sprachen) ? l.sprachen : [],
  };
}

/** Foto als Daten-URL für react-pdf (WebP kann react-pdf nicht — dann ohne Foto). */
export async function fotoDatenUrl(db: SupabaseClient, einstellungen: Record<string, unknown>): Promise<string | null> {
  const f = fotoAus(einstellungen);
  if (!f || (f.typ !== "image/jpeg" && f.typ !== "image/png")) return null;
  const { data, error } = await db.storage.from(FOTO_BUCKET).download(f.pfad);
  if (error || !data) return null;
  return `data:${f.typ};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`;
}

/** Platzhalter-Anschreiben für die Vorschau — zeigt das Layout, nicht den späteren Inhalt. */
export function beispielBrief(cv: UnterlagenCv, heute = new Date()): UnterlagenBrief {
  const datum = heute.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
  const rolle = cv.titel || "die ausgeschriebene Stelle";
  return {
    empfaenger: ["Beispiel GmbH", "Personalabteilung", "Frau Maria Muster", "Musterstraße 1", "12345 Musterstadt"],
    ortDatum: [cv.kontakt.ort, datum].filter(Boolean).join(", "),
    betreff: `Bewerbung als ${rolle} (m/w/d)`,
    anrede: "Sehr geehrte Frau Muster,",
    absaetze: [
      "Dies ist eine Vorschau: So sieht dein Anschreiben im gewählten Layout aus. Den Text schreibt nojobs später für jede Stelle passend — aus deinem Lebenslauf und der Anzeige, ohne etwas zu erfinden.",
      "Der erste Absatz sagt, warum genau diese Stelle zu dir passt. Der zweite zeigt mit ein, zwei Beispielen aus deinem Werdegang, was du mitbringst — möglichst mit Zahlen oder Ergebnissen.",
      "Der dritte Absatz greift auf, was dem Arbeitgeber laut Anzeige besonders wichtig ist, und verbindet es mit deinen Stärken.",
    ],
    schluss: "Zum Schluss: Eintrittstermin oder Kündigungsfrist und die Bitte um ein persönliches Gespräch.",
    gruss: "Mit freundlichen Grüßen",
  };
}
