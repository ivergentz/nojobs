/**
 * Phase 4.3 · Anschreiben und Lebenslauf-Anpassung für weitere Profile — aus IHREM Lebenslauf
 * (profile_cv), passend zur Stelle, mit Layout-Vorschlag.
 *
 * Dein Profil nutzt weiter lib/application.ts (Lebenslauf von ivergentz.de) — hier ändert sich nichts.
 * Gespeichert wird der Entwurf in matches.application_draft der Person (art: "profil").
 */

import { callClaudeJson, DEFAULT_MODEL } from "./claude";
import type { KostenKontext } from "./kosten";
import { ohneKontakt } from "./suchprofil";
import { LAYOUTS, type LayoutId, type UnterlagenBrief, type UnterlagenCv } from "./pdf/layouts/typen";

export type ProfilEntwurf = {
  art: "profil";
  betreff: string;
  empfaenger: string[];
  anrede: string;
  absaetze: string[];
  schluss: string;
  gruss: string;
  cv: {
    titel: string;
    kurzprofil: string;
    /** Höchstens drei Stationen mit geschärften Stichpunkten (Index in der Stationsliste). */
    stichpunkte: Array<{ station: number; stichpunkte: string[] }>;
  };
  hinweise: string[];
  /** Vorschlag für diese Stelle; `layout` = tatsächlich gewählt (null = Einstellung aus Mein Profil). */
  layoutVorschlag: { id: LayoutId; grund: string } | null;
  layout: LayoutId | null;
  erstellt: string;
};

const LAYOUT_LISTE = LAYOUTS.map((l) => `- ${l.id}: ${l.name} — ${l.charakter}; passt zu ${l.passtZu}`).join("\n");

const REGELN = (name: string) => `Du schreibst Bewerbungsunterlagen für ${name}. Sprache: Deutsch.

HARTE REGELN:
- Nichts erfinden. Jede Aussage muss sich auf den gelieferten Lebenslauf zurückführen lassen. Keine Zahlen, Arbeitgeber, Abschlüsse oder Kenntnisse ergänzen, die dort nicht stehen.
- Erfahrung nicht aufblasen. Fehlt eine geforderte Voraussetzung, wird sie nicht überspielt: weglassen oder ehrlich mit dem Nächstbesten aus dem Lebenslauf kontern.
- Keine Floskeln: kein „mit großem Interesse habe ich Ihre Anzeige gelesen“, kein „dynamisches Team“, kein „hiermit bewerbe ich mich“.
- Ton: freundlich, klar, selbstbewusst, Ich-Form. Das Anschreiben in der Sie-Form an den Arbeitgeber.

ANSCHREIBEN:
- betreff: „Bewerbung als <Stellenbezeichnung aus der Anzeige>“, höchstens 10 Wörter.
- empfaenger: 1–4 Zeilen — Arbeitgeber, ggf. Ansprechperson, Anschrift. Nur was in der Anzeige steht.
- anrede: mit Namen, wenn die Anzeige eine Ansprechperson nennt („Sehr geehrte Frau …,“), sonst „Sehr geehrte Damen und Herren,“.
- absaetze: 3–4 Absätze, zusammen höchstens 250 Wörter.
  1. Warum genau diese Stelle — mit einem konkreten Bezug zur Anzeige.
  2. Der stärkste Beleg aus dem Lebenslauf für das, was die Stelle verlangt.
  3. Ein zweiter Beleg oder eine ehrlich adressierte Lücke.
  4. optional: Bezug zum Arbeitgeber oder zur Arbeitsweise.
- schluss: ein bis zwei Sätze — Bitte um ein Gespräch; Eintrittstermin nur, wenn im Lebenslauf oder in der Anzeige ein Anlass dafür steht.

LEBENSLAUF-ANPASSUNG (cv):
- titel: die Zeile unter dem Namen, auf die Stelle zugeschnitten, höchstens 6 Wörter — aus den tatsächlichen Rollen.
- kurzprofil: 2–3 Sätze, höchstens 60 Wörter, auf dieselben Fakten wie der Lebenslauf, aber mit Blick auf diese Stelle.
- stichpunkte: HÖCHSTENS DREI Stationen (station = Position in der Stationsliste, 0 = erste), deren Stichpunkte du für diese Stelle schärfst. Nur Betonung und Reihenfolge ändern, keine neuen Fakten. Je Station höchstens 4 Stichpunkte, je höchstens 20 Wörter.

LAYOUT: Wähle aus diesen fünf das passendste für Arbeitgeber und Branche und begründe in einem Satz:
${LAYOUT_LISTE}
Konzerne mit Bewerbermanagement-System → minimal. Verwaltung, öffentlicher Dienst, Banken → klassisch.

hinweise: HÖCHSTENS DREI kurze Sätze an ${name} (Du-Form): was du betont hast und welche Lücke im Gespräch zur Sprache kommen könnte.

Antworte im vorgegebenen JSON-Format. Längen sind verbindlich.`;

const STR = { type: "string" };
const LIST = { type: "array", items: STR };
const SCHEMA = {
  type: "object",
  properties: {
    betreff: STR,
    empfaenger: LIST,
    anrede: STR,
    absaetze: LIST,
    schluss: STR,
    cv: {
      type: "object",
      properties: {
        titel: STR,
        kurzprofil: STR,
        stichpunkte: {
          type: "array",
          items: { type: "object", properties: { station: { type: "integer" }, stichpunkte: LIST }, required: ["station", "stichpunkte"] },
        },
      },
      required: ["titel", "kurzprofil", "stichpunkte"],
    },
    layout: { type: "object", properties: { id: { type: "string", enum: LAYOUTS.map((l) => l.id) }, grund: STR }, required: ["id", "grund"] },
    hinweise: LIST,
  },
  required: ["betreff", "empfaenger", "anrede", "absaetze", "schluss", "cv", "layout", "hinweise"],
};

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const liste = (v: unknown, max: number, laenge: number) =>
  (Array.isArray(v) ? v : []).map((x) => text(x, laenge)).filter(Boolean).slice(0, max);
const istLayout = (v: unknown): v is LayoutId => LAYOUTS.some((l) => l.id === v);

/** Entwurf aus Claude-Antwort oder aus der Bearbeitung — immer gleich bereinigt. */
export function bereinigeEntwurf(roh: Record<string, any>, stationen: number): ProfilEntwurf {
  const cv = (roh.cv ?? {}) as Record<string, any>;
  const gesehen = new Set<number>();
  const lv = roh.layoutVorschlag ?? roh.layoutvorschlag ?? (roh.layout && typeof roh.layout === "object" ? roh.layout : null);
  return {
    art: "profil",
    betreff: text(roh.betreff, 200),
    empfaenger: liste(roh.empfaenger, 5, 120),
    anrede: text(roh.anrede, 120) || "Sehr geehrte Damen und Herren,",
    absaetze: liste(roh.absaetze, 6, 1500),
    schluss: text(roh.schluss, 600),
    gruss: text(roh.gruss, 60) || "Mit freundlichen Grüßen",
    cv: {
      titel: text(cv.titel, 120),
      kurzprofil: text(cv.kurzprofil, 800),
      stichpunkte: (Array.isArray(cv.stichpunkte) ? cv.stichpunkte : [])
        .filter((s: any) => Number.isInteger(s?.station) && s.station >= 0 && s.station < stationen && !gesehen.has(s.station) && gesehen.add(s.station))
        .slice(0, 3)
        .map((s: any) => ({ station: s.station as number, stichpunkte: liste(s.stichpunkte, 6, 300) }))
        .filter((s: { stichpunkte: string[] }) => s.stichpunkte.length > 0),
    },
    hinweise: liste(roh.hinweise, 3, 400),
    layoutVorschlag: lv && istLayout(lv.id) ? { id: lv.id, grund: text(lv.grund, 300) } : null,
    layout: typeof roh.layout === "string" && istLayout(roh.layout) ? roh.layout : null,
    erstellt: text(roh.erstellt, 40) || new Date().toISOString(),
  };
}

export async function entwurfFuerProfil(input: {
  name: string;
  lebenslauf: { stationen?: unknown[] } & Record<string, unknown>;
  profiltext?: string | null;
  stelle: { title: string; employer: string; place: string; description: string };
  kosten?: Omit<KostenKontext, "zweck">;
}): Promise<ProfilEntwurf> {
  const roh = await callClaudeJson<Record<string, unknown>>({
    model: process.env.DRAFT_MODEL || DEFAULT_MODEL,
    system: `${REGELN(input.name)}\n\nLEBENSLAUF VON ${input.name.toUpperCase()}:\n${JSON.stringify(ohneKontakt(input.lebenslauf)).slice(0, 20_000)}${
      input.profiltext ? `\n\nWAS ${input.name.toUpperCase()} SUCHT:\n${input.profiltext.slice(0, 3000)}` : ""
    }`,
    user: [
      `Stelle: ${input.stelle.title}`,
      `Arbeitgeber: ${input.stelle.employer}`,
      `Ort: ${input.stelle.place || "unbekannt"}`,
      "",
      "Ausschreibung:",
      input.stelle.description ? input.stelle.description.slice(0, 12_000) : "(keine Beschreibung — nur aus Titel und Arbeitgeber ableiten und das in hinweise sagen)",
    ].join("\n"),
    schema: SCHEMA,
    maxTokens: 6000,
    timeoutMs: 90_000,
    kosten: { ...input.kosten, zweck: "unterlagen" },
  });
  const e = bereinigeEntwurf({ ...roh, layoutVorschlag: roh.layout, layout: null }, Array.isArray(input.lebenslauf.stationen) ? input.lebenslauf.stationen.length : 0);
  return { ...e, erstellt: new Date().toISOString() };
}

/** Lebenslauf-Daten mit den Anpassungen für diese Stelle. */
export function cvFuerStelle(cv: UnterlagenCv, e: ProfilEntwurf): UnterlagenCv {
  const neu = new Map(e.cv.stichpunkte.map((s) => [s.station, s.stichpunkte]));
  return {
    ...cv,
    titel: e.cv.titel || cv.titel,
    kurzprofil: e.cv.kurzprofil || cv.kurzprofil,
    stationen: cv.stationen.map((s, i) => (neu.has(i) ? { ...s, stichpunkte: neu.get(i)! } : s)),
  };
}

export function briefAusEntwurf(e: ProfilEntwurf, ort: string, heute = new Date()): UnterlagenBrief {
  const datum = heute.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" });
  return {
    empfaenger: e.empfaenger,
    ortDatum: [ort, datum].filter(Boolean).join(", "),
    betreff: e.betreff,
    anrede: e.anrede,
    absaetze: e.absaetze,
    schluss: e.schluss,
    gruss: e.gruss,
  };
}
