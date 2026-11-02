/**
 * Schritt 2.6 · Fragebogen → Suchprofil (weitere Profile).
 *
 * Der Lebenslauf zeigt, was jemand gemacht hat — der Fragebogen, was als Nächstes
 * kommen soll. Aus beidem formuliert Claude einen Vorschlag: Suchbegriffe,
 * Profiltext und Bewertungskriterien. Ort und Umkreis kommen direkt aus den
 * Antworten. Die Person prüft, korrigiert und bestätigt; erst dann wird das
 * Suchprofil gespeichert (dieselben Felder wie in der Steuerung).
 *
 * Antworten und Vorschlag liegen in profiles.einstellungen — keine neue Tabelle.
 * Dein Profil („iver“) ist ausgeschlossen.
 */

import { callClaudeJson, DEFAULT_MODEL } from "./claude";
import type { KostenKontext } from "./kosten";

export const UMKREISE = [10, 25, 50, 100, 200] as const;

export const NOGOS = [
  { key: "zeitarbeit", label: "Zeitarbeit / Personaldienstleister" },
  { key: "konzern", label: "Großkonzern" },
  { key: "startup", label: "Startup" },
  { key: "oeffentlich", label: "Öffentlicher Dienst" },
  { key: "kirchlich", label: "Kirchlicher Träger" },
  { key: "befristet", label: "Befristete Stelle" },
] as const;

export type Antworten = {
  richtungen: string[];
  eigeneRichtung: string;
  anders: string;
  ebene: "gleich" | "hoch" | "zurueck" | "egal";
  ort: string;
  umkreis: number;
  arbeitsort: Array<"vor-ort" | "hybrid" | "remote">;
  reisen: "nein" | "gelegentlich" | "ja";
  umfang: "vollzeit" | "teilzeit" | "beides";
  stunden: string;
  gehalt: string;
  gehaltEinheit: "monat" | "jahr";
  nogos: string[];
  nogosText: string;
  englisch: "ja" | "etwas" | "nein";
};

export type Vorschlag = {
  suchbegriffe: string[];
  profiltext: string;
  kriterien: string;
  ort: string;
  umkreis: number;
};

const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
const tBlock = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const aus = <T extends string>(v: unknown, erlaubt: readonly T[], standard: T): T =>
  erlaubt.includes(v as T) ? (v as T) : standard;

/** Antworten aus dem Formular prüfen. Fehler → Meldung für die Person. */
export function pruefeAntworten(roh: unknown): { ok: true; antworten: Antworten } | { ok: false; fehler: string } {
  const r = (roh && typeof roh === "object" ? roh : {}) as Record<string, unknown>;
  const liste = (v: unknown, max: number, laenge: number) =>
    Array.isArray(v) ? v.map((x) => t(x, laenge)).filter(Boolean).slice(0, max) : [];
  const umkreis = Number(r.umkreis);
  const antworten: Antworten = {
    richtungen: liste(r.richtungen, 3, 100),
    eigeneRichtung: t(r.eigeneRichtung, 200),
    anders: tBlock(r.anders, 1000),
    ebene: aus(r.ebene, ["gleich", "hoch", "zurueck", "egal"] as const, "egal"),
    ort: t(r.ort, 60),
    umkreis: (UMKREISE as readonly number[]).includes(umkreis) ? umkreis : 25,
    arbeitsort: liste(r.arbeitsort, 3, 10).filter((x): x is Antworten["arbeitsort"][number] =>
      ["vor-ort", "hybrid", "remote"].includes(x)
    ),
    reisen: aus(r.reisen, ["nein", "gelegentlich", "ja"] as const, "gelegentlich"),
    umfang: aus(r.umfang, ["vollzeit", "teilzeit", "beides"] as const, "beides"),
    stunden: t(r.stunden, 40),
    gehalt: t(r.gehalt, 20).replace(/[^\d.,]/g, ""),
    gehaltEinheit: aus(r.gehaltEinheit, ["monat", "jahr"] as const, "jahr"),
    nogos: liste(r.nogos, NOGOS.length, 20).filter((k) => NOGOS.some((n) => n.key === k)),
    nogosText: t(r.nogosText, 300),
    englisch: aus(r.englisch, ["ja", "etwas", "nein"] as const, "etwas"),
  };
  if (antworten.richtungen.length === 0 && !antworten.eigeneRichtung) {
    return { ok: false, fehler: "Bitte mindestens eine Richtung wählen oder eine eigene eintragen." };
  }
  if (antworten.ort.length < 2) return { ok: false, fehler: "Bitte einen Ort oder eine Postleitzahl angeben." };
  if (antworten.arbeitsort.length === 0) antworten.arbeitsort = ["vor-ort", "hybrid", "remote"];
  return { ok: true, antworten };
}

const EBENE = { gleich: "gleiche Stufe wie bisher", hoch: "ein Schritt nach oben (mehr Verantwortung)", zurueck: "auch ein Schritt zurück ist okay", egal: "egal" };
const ARBEITSORT = { "vor-ort": "vor Ort", hybrid: "hybrid", remote: "remote" };
const REISEN = { nein: "keine Reisen", gelegentlich: "gelegentlich reisen ist okay", ja: "viel reisen ist okay" };
const UMFANG = { vollzeit: "Vollzeit", teilzeit: "Teilzeit", beides: "Vollzeit oder Teilzeit" };
const ENGLISCH = { ja: "Englisch im Job ist okay", etwas: "etwas Englisch ist okay", nein: "kein Englisch im Job" };

/** Antworten als lesbarer Text — für Claude und zur Kontrolle. */
export function antwortenText(a: Antworten): string {
  const zeilen = [
    `Gewünschte Richtung(en): ${[...a.richtungen, a.eigeneRichtung].filter(Boolean).join("; ")}`,
    a.anders ? `Was anders werden soll als im letzten Job: ${a.anders}` : "",
    `Ebene: ${EBENE[a.ebene]}`,
    `Ort: ${a.ort}, Umkreis ${a.umkreis} km`,
    `Arbeitsort: ${a.arbeitsort.map((x) => ARBEITSORT[x]).join(", ")}`,
    `Reisen: ${REISEN[a.reisen]}`,
    `Umfang: ${UMFANG[a.umfang]}${a.stunden ? ` (${a.stunden})` : ""}`,
    a.gehalt ? `Gehalt mindestens: ${a.gehalt} € brutto pro ${a.gehaltEinheit === "monat" ? "Monat" : "Jahr"}` : "Gehalt: keine Untergrenze angegeben",
    `No-Gos: ${[...a.nogos.map((k) => NOGOS.find((n) => n.key === k)?.label ?? k), a.nogosText].filter(Boolean).join("; ") || "keine"}`,
    `Sprache: ${ENGLISCH[a.englisch]}`,
  ];
  return zeilen.filter(Boolean).join("\n");
}

/** Fester Rahmen der Bewertungsregeln — die Kriterien dazwischen sind persönlich. */
export function regelnAus(kriterien: string): string {
  return `BEWERTUNG "fit". Die Person liest jede Stelle, die nicht "ignore" ist. Die Inbox soll klein und treffsicher sein.

${kriterien.trim()}

GRUNDSATZ: Fehlt eine Angabe in der Anzeige (Träger, Tarif, Befristung, Gehalt, Stunden), ist das kein Grund für eine Abwertung — höchstens als cons nennen. Abwerten nur bei dem, was die Anzeige tatsächlich sagt. Den genauen Wohnort kennst du nicht: keine Annahmen über Stadtteil oder Anfahrt.

spur: immer "keine".

AUSGABE:
- summary: HÖCHSTENS 40 Wörter. Zwei Sätze auf Deutsch: was die Rolle ist, warum sie passt oder nicht.
- pros und cons: je HÖCHSTENS vier Stichpunkte à HÖCHSTENS 10 Wörter, auf Deutsch, konkret auf die Person bezogen.
- confidence: low, wenn die Anzeige zu vage ist, um die Rolle einzuordnen.

Antworte im vorgegebenen JSON-Format.`;
}

/** Kriterien aus gespeicherten Regeln zurückholen (zum Bearbeiten). */
export function kriterienAus(regeln: string | null): string {
  if (!regeln) return "";
  const m = regeln.match(/klein und treffsicher sein\.\n\n([\s\S]*?)\n\n(?:GRUNDSATZ: [^\n]*\n\n)?spur: immer "keine"\./);
  if (m) return m[1];
  // Von Hand in der Steuerung eingetragen: festen Kopf und Ausgabe-Teil abschneiden, damit sie nicht doppelt stehen
  return regeln
    .replace(/^BEWERTUNG "fit"[^\n]*\n*/, "")
    .replace(/\n*GRUNDSATZ: [^\n]*/, "")
    .replace(/\n*spur: immer "keine"\.[\s\S]*$/, "")
    .replace(/\n*AUSGABE:[\s\S]*$/, "")
    .trim();
}

const SCHEMA = {
  type: "object",
  properties: {
    suchbegriffe: { type: "array", items: { type: "string" } },
    profiltext: { type: "string" },
    kriterien: { type: "string" },
  },
  required: ["suchbegriffe", "profiltext", "kriterien"],
};

const ANWEISUNG = `Du richtest die automatische Stellensuche für eine Person ein. Grundlage: ihr ausgelesener Lebenslauf und ihre Antworten aus einem Fragebogen. Die Antworten haben Vorrang vor dem Lebenslauf — sie beschreiben, was als Nächstes kommen soll. Sprache: Deutsch. Nichts erfinden.

Liefere drei Dinge:

1. suchbegriffe — 8 bis 12 Begriffe für die Suche bei der Bundesagentur für Arbeit. Mit jedem Begriff wird gesucht, UND er wird mit dem Stellentitel verglichen (Teilwort, Groß-/Kleinschreibung egal). Daher:
- kurze Wörter oder Wortstämme, wie sie in Stellentiteln stehen ("Erzieher" findet auch "Erzieherin" und "Erzieher (m/w/d)")
- keine Gender-Endungen, keine Klammern, keine Zusätze wie "m/w/d", "Teilzeit", Orte oder Firmennamen
- keine zu allgemeinen Wörter, die tausende fremde Stellen treffen ("Mitarbeiter", "Manager", "Leitung" allein)
- decke alle gewählten Richtungen ab, verwandte Berufsbezeichnungen und Synonyme eingeschlossen

2. profiltext — so beginnt er: "KANDIDAT: <Name>, sucht im Umkreis von <Umkreis> km um <Ort aus dem Fragebogen>." Den genauen Wohnort kennst du nicht: keinen Stadtteil und keinen Wohnort aus früheren Arbeitgebern ableiten, keine Annahmen über Anfahrtswege. Danach, kurz und sachlich in der dritten Person:
- Erfahrung: die wichtigsten Stationen und Abschlüsse in 3–5 Stichpunkten
- Stärken / Schwerpunkte (nur was belegt ist)
- SUCHE: gewünschte Richtung(en), Ebene, Ort und Umkreis, vor Ort/hybrid/remote, Reisebereitschaft, Voll-/Teilzeit (mit Stunden, falls genannt), Gehaltsuntergrenze (falls genannt), No-Gos, Englisch, und was anders werden soll als im letzten Job
Höchstens 250 Wörter.

WIDERSPRÜCHE: Die Freitext-Antwort „Was soll anders werden“ hat Vorrang vor angehakten Richtungen und der gewählten Ebene. Widerspricht eine angehakte Richtung dem Freitext (z. B. Leitungsrichtung angehakt, aber „ohne Leitungsfunktion“ geschrieben), behandle sie als Nebenrichtung: solche Stellen höchstens worth_reading — und Stellen der Hauptrichtung werden NIE abgewertet, weil ihnen etwas aus der Nebenrichtung fehlt (z. B. keine „fehlende Leitungsperspektive“ als Einschränkung). Nenne in den Suchbegriffen keine Begriffe, die nur zur Nebenrichtung passen, wenn der Freitext sie ausschließt.

3. kriterien — die persönlichen Bewertungsregeln. Sie werden zwischen einen festen Kopf und eine feste Ausgabe-Anweisung gesetzt; schreibe NUR diesen Mittelteil, in genau diesem Aufbau:
must_apply — <wann eine Stelle klar passt — NUR anhand der Kernkriterien: Hauptrichtung passt, Ort im Umkreis, Umfang passt (oder ist mit dem Wunsch vereinbar), kein No-Go ERKENNBAR verletzt>
worth_reading — <passt grundsätzlich, aber die Anzeige NENNT eine echte Einschränkung: Beispiele aus den Antworten>
ignore — <andere Richtung, Ort zu weit, No-Go verletzt, falscher Umfang, Ausbildung/Praktikum/FSJ (sofern nicht gesucht), zu vage>
Danach optional 2–4 Zeilen "Hinweise:" mit Dingen, die die Bewertung beachten soll (z. B. "Teilzeit unter 30 Stunden ist Pflicht — Vollzeit ohne Teilzeitoption ist ignore", "Gehalt fehlt in der Anzeige: kein Ausschlussgrund, als cons nennen").
WICHTIG: Was die Anzeige nicht sagt (Träger, Tarif, Befristung, Gehalt, genaue Stunden, Stadtteil), ist NIE eine Bedingung für must_apply und NIE ein Grund für worth_reading — das gehört höchstens als offener Punkt in die cons. Eine Stelle, die die Kernkriterien erfüllt und keine erkennbare Einschränkung hat, ist must_apply.
Konkret für diese Person, kurz, in der dritten Person ("die Person"). Höchstens 250 Wörter. Kein Wort zu Ausgabeformat, summary, pros oder cons.`;

export async function erstelleVorschlag(
  eingabe: { name: string; lebenslauf: unknown; antworten: Antworten },
  kosten?: Omit<KostenKontext, "zweck">
): Promise<Vorschlag> {
  const cv = eingabe.lebenslauf ? JSON.stringify(eingabe.lebenslauf).slice(0, 20_000) : "(kein Lebenslauf hochgeladen)";
  const roh = await callClaudeJson<{ suchbegriffe?: unknown; profiltext?: unknown; kriterien?: unknown }>({
    model: process.env.DRAFT_MODEL || DEFAULT_MODEL,
    system: ANWEISUNG,
    schema: SCHEMA,
    user: `NAME: ${eingabe.name}\n\nLEBENSLAUF (ausgelesen, JSON):\n${cv}\n\nANTWORTEN AUS DEM FRAGEBOGEN:\n${antwortenText(eingabe.antworten)}`,
    maxTokens: 3000,
    timeoutMs: 90_000,
    kosten: { ...kosten, zweck: "suchprofil" as const },
  });
  return bereinigeVorschlag({ ...roh, ort: eingabe.antworten.ort, umkreis: eingabe.antworten.umkreis });
}

/** Suchbegriff säubern wie beim Speichern — damit der Vorschlag zeigt, was wirklich gesucht wird. */
function begriff(s: string): string {
  return s
    .replace(/\(?\s*[mwd]\s*\/\s*[mwd]\s*(\/\s*[mwd])?\s*\)?/gi, " ")
    .replace(/[%*(),."]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function bereinigeVorschlag(roh: Record<string, unknown>): Vorschlag {
  const gesehen = new Set<string>();
  const suchbegriffe = (Array.isArray(roh.suchbegriffe) ? roh.suchbegriffe : [])
    .map((s) => (typeof s === "string" ? begriff(s) : ""))
    .filter((s) => s.length >= 2 && s.length <= 60)
    .filter((s) => (gesehen.has(s.toLowerCase()) ? false : (gesehen.add(s.toLowerCase()), true)))
    .slice(0, 15);
  const umkreis = Number(roh.umkreis);
  return {
    suchbegriffe,
    profiltext: tBlock(roh.profiltext, 6000),
    kriterien: tBlock(roh.kriterien, 6000),
    ort: t(roh.ort, 60),
    umkreis: (UMKREISE as readonly number[]).includes(umkreis) ? umkreis : 25,
  };
}
