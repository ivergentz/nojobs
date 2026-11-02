/**
 * Schritt 2.4 · Lebenslauf hochladen und auslesen (weitere Profile).
 *
 * Ablauf: Datei (PDF oder Word) → privater Speicher in Supabase („lebenslaeufe“)
 * → Claude liest sie und liefert eine feste Struktur, 2–3 vorgeschlagene
 * Richtungen und einen Prüfbericht → Tabelle profile_cv.
 *
 * Dein Profil („iver“) ist ausgeschlossen: Dein Lebenslauf kommt weiter von deiner Website.
 */

import { callClaudeJson, DEFAULT_MODEL } from "./claude";
import { docxText } from "./docx-text";
import type { KostenKontext } from "./kosten";

export const BUCKET = "lebenslaeufe";
export const MAX_BYTES = 10 * 1024 * 1024;
export const PDF = "application/pdf";
export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type Station = { zeitraum: string; titel: string; arbeitgeber: string; ort: string; stichpunkte: string[] };
export type Richtung = { titel: string; begruendung: string; suchbegriffe: string[] };
export type Pruefpunkt = { stufe: "rot" | "gelb" | "hinweis"; punkt: string; vorschlag: string };

export type Lebenslauf = {
  person: { name: string; ort: string };
  kurzprofil: string;
  stationen: Station[];
  ausbildung: Array<{ zeitraum: string; abschluss: string; einrichtung: string }>;
  kenntnisse: string[];
  sprachen: Array<{ sprache: string; niveau: string }>;
  richtungen: Richtung[];
  pruefung: Pruefpunkt[];
};

const SCHEMA = {
  type: "object",
  properties: {
    person: { type: "object", properties: { name: { type: "string" }, ort: { type: "string" } }, required: ["name", "ort"] },
    kurzprofil: { type: "string" },
    stationen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          zeitraum: { type: "string" },
          titel: { type: "string" },
          arbeitgeber: { type: "string" },
          ort: { type: "string" },
          stichpunkte: { type: "array", items: { type: "string" } },
        },
        required: ["zeitraum", "titel", "arbeitgeber", "ort", "stichpunkte"],
      },
    },
    ausbildung: {
      type: "array",
      items: {
        type: "object",
        properties: { zeitraum: { type: "string" }, abschluss: { type: "string" }, einrichtung: { type: "string" } },
        required: ["zeitraum", "abschluss", "einrichtung"],
      },
    },
    kenntnisse: { type: "array", items: { type: "string" } },
    sprachen: {
      type: "array",
      items: { type: "object", properties: { sprache: { type: "string" }, niveau: { type: "string" } }, required: ["sprache", "niveau"] },
    },
    richtungen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          titel: { type: "string" },
          begruendung: { type: "string" },
          suchbegriffe: { type: "array", items: { type: "string" } },
        },
        required: ["titel", "begruendung", "suchbegriffe"],
      },
    },
    pruefung: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stufe: { type: "string", enum: ["rot", "gelb", "hinweis"] },
          punkt: { type: "string" },
          vorschlag: { type: "string" },
        },
        required: ["stufe", "punkt", "vorschlag"],
      },
    },
  },
  required: ["person", "kurzprofil", "stationen", "ausbildung", "kenntnisse", "sprachen", "richtungen", "pruefung"],
};

const REGELN = `Du liest einen Lebenslauf und gibst ihn als strukturiertes JSON zurück. Sprache der Ausgabe: Deutsch.

GRUNDREGEL: Nichts erfinden. Was nicht im Dokument steht, bleibt leer ("") oder fehlt in der Liste. Keine geschätzten Daten, keine ergänzten Arbeitgeber.

person: Name und Wohnort, wie im Dokument.
kurzprofil: 2–3 Sätze, was die Person beruflich ausmacht — nüchtern, aus dem Dokument abgeleitet.
stationen: Berufsstationen, neueste zuerst. zeitraum im Format "MM/JJJJ – MM/JJJJ" bzw. "– heute", soweit erkennbar. stichpunkte: die Aufgaben und Erfolge aus dem Dokument, je höchstens 20 Wörter.
ausbildung: Schule, Ausbildung, Studium, Weiterbildungen mit Abschluss.
kenntnisse: höchstens 15 Stichworte — NUR was im Dokument ausdrücklich als Kenntnis, Fähigkeit, Werkzeug oder Zusatzqualifikation aufgeführt ist (meist in einem Abschnitt „Kenntnisse“, „Fähigkeiten“, „Skills“). Keine Tätigkeiten aus den Stationen und keine Schwerpunkte aus dem Profiltext übernehmen. Sprachen gehören nicht hierher, sondern zu sprachen.
sprachen: mit Niveau, wie angegeben.

richtungen: 2–3 realistische nächste Schritte für die Jobsuche, abgeleitet aus Erfahrung und Verlauf — z. B. gleiche Rolle mit mehr Verantwortung, naheliegender Wechsel, Spezialisierung. Je Richtung:
- titel: kurz, wie eine Stellenbezeichnung oder ein Berufsfeld (z. B. "Stellvertretende Kitaleitung")
- begruendung: ein Satz, warum diese Richtung zum Lebenslauf passt. Ist die Richtung ein Schritt nach oben (Leitung, Führung, mehr Verantwortung) oder ein Wechsel, für den im Lebenslauf eine typische Voraussetzung fehlt (z. B. Leitungserfahrung, Weiterbildung, Abschluss), nenne die Lücke ehrlich und den Weg dorthin — z. B. „Leitungserfahrung fehlt bisher; eine Weiterbildung zur Kitaleitung wäre der Weg.“
- suchbegriffe: 3–6 Begriffe, wie sie in Stellenanzeigen der Arbeitsagentur stehen (deutsch, ohne Gender-Zusätze wie m/w/d)

pruefung: Prüfbericht mit konkreten Verbesserungen. Je Punkt eine stufe:
- "rot": Lücken über 3 Monate, überlappende oder fehlende Zeiträume, fehlende Kontaktdaten
- "gelb": uneinheitliche Datumsformate/Schreibweisen, Stichpunkte ohne Ergebnis oder Zahl, zu lange Absätze, Tippfehler
- "hinweis": heute unübliche Angaben (Geburtsort, Familienstand, Religion, Eltern) mit Empfehlung zum Entfernen
punkt: was auffällt (konkret, mit Station oder Zeitraum). vorschlag: die konkrete Verbesserung — bei Dingen, die nur die Person wissen kann (eine Zahl, ein Zeitraum), als Frage formulieren statt raten.
Layout-Punkte nur, wenn sie eindeutig erkennbar sind (bei Word-Dateien siehst du nur den Text — dann keine Layout-Punkte).
Höchstens 10 Punkte, die wichtigsten zuerst.

ANREDE: In begruendung, punkt und vorschlag die Person immer mit „du“ ansprechen (du, dein, dir) — nie „Sie“. kurzprofil in der dritten Person.`;

const text = (v: unknown, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const liste = <T>(v: unknown, max: number): T[] => (Array.isArray(v) ? (v as T[]).slice(0, max) : []);

export function bereinige(roh: Partial<Lebenslauf>): Lebenslauf {
  return {
    person: { name: text(roh.person?.name, 120), ort: text(roh.person?.ort, 120) },
    kurzprofil: text(roh.kurzprofil, 800),
    stationen: liste<Station>(roh.stationen, 20).map((s) => ({
      zeitraum: text(s?.zeitraum, 60),
      titel: text(s?.titel, 160),
      arbeitgeber: text(s?.arbeitgeber, 160),
      ort: text(s?.ort, 120),
      stichpunkte: liste<string>(s?.stichpunkte, 8).map((p) => text(p, 300)).filter(Boolean),
    })),
    ausbildung: liste<Lebenslauf["ausbildung"][number]>(roh.ausbildung, 12).map((a) => ({
      zeitraum: text(a?.zeitraum, 60),
      abschluss: text(a?.abschluss, 200),
      einrichtung: text(a?.einrichtung, 200),
    })),
    kenntnisse: liste<string>(roh.kenntnisse, 15).map((k) => text(k, 80)).filter(Boolean),
    sprachen: liste<Lebenslauf["sprachen"][number]>(roh.sprachen, 8).map((s) => ({ sprache: text(s?.sprache, 40), niveau: text(s?.niveau, 60) })),
    richtungen: liste<Richtung>(roh.richtungen, 3).map((r) => ({
      titel: text(r?.titel, 100),
      begruendung: text(r?.begruendung, 400),
      suchbegriffe: liste<string>(r?.suchbegriffe, 6).map((b) => text(b, 60)).filter(Boolean),
    })),
    pruefung: liste<Pruefpunkt>(roh.pruefung, 10)
      .map((p) => ({
        stufe: (["rot", "gelb", "hinweis"].includes(p?.stufe as string) ? p.stufe : "gelb") as Pruefpunkt["stufe"],
        punkt: text(p?.punkt, 300),
        vorschlag: text(p?.vorschlag, 400),
      }))
      .filter((p) => p.punkt),
  };
}

/** Dateityp prüfen — am Inhalt, nicht nur am Namen. */
export function dateityp(name: string, mime: string, kopf: Buffer): typeof PDF | typeof DOCX | null {
  const istPdf = kopf.subarray(0, 5).toString("latin1") === "%PDF-";
  const istZip = kopf.readUInt32LE(0) === 0x04034b50;
  if (istPdf && (mime === PDF || /\.pdf$/i.test(name) || !mime)) return PDF;
  if (istZip && (mime === DOCX || /\.docx$/i.test(name))) return DOCX;
  return null;
}

export async function leseLebenslauf(
  datei: Buffer,
  typ: typeof PDF | typeof DOCX,
  kosten?: Omit<KostenKontext, "zweck">
): Promise<Lebenslauf> {
  const anfrage = {
    model: process.env.DRAFT_MODEL || DEFAULT_MODEL,
    system: REGELN,
    schema: SCHEMA,
    maxTokens: 8000,
    timeoutMs: 110_000,
    kosten: { ...kosten, zweck: "lebenslauf" as const },
  };
  const roh =
    typ === PDF
      ? await callClaudeJson<Partial<Lebenslauf>>({
          ...anfrage,
          user: "Lies den angehängten Lebenslauf und gib ihn im vorgegebenen JSON-Format zurück.",
          dokument: { base64: datei.toString("base64"), mediaType: PDF },
        })
      : await callClaudeJson<Partial<Lebenslauf>>({
          ...anfrage,
          user: `Hier der Text des Lebenslaufs (aus einer Word-Datei):\n\n${docxText(datei).slice(0, 40_000)}`,
        });
  return bereinige(roh);
}
