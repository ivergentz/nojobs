/**
 * Prüfbericht → Stelle im Lebenslauf-Editor. Damit steht jeder Hinweis genau dort,
 * wo man ihn ändert (Reiter, und bei Stationen/Abschlüssen am jeweiligen Eintrag).
 *
 * Neuere Prüfberichte liefern bereich + eintrag direkt mit. Für ältere wird aus dem
 * Text geschlossen (Arbeitgeber, Titel, Zeiträume, Stichworte). Was sich nicht
 * eindeutig zuordnen lässt, landet unter „Allgemein“ — nie an einer falschen Stelle.
 */

export type Bereich = "person" | "erfahrung" | "ausbildung" | "kenntnisse" | "allgemein";
export type Zuordnung = { bereich: Bereich; eintrag: number | null };

type Pp = { punkt?: string; vorschlag?: string; bereich?: string; eintrag?: number | null };
type Cv = {
  stationen?: Array<{ zeitraum?: string; titel?: string; arbeitgeber?: string }>;
  ausbildung?: Array<{ zeitraum?: string; abschluss?: string; einrichtung?: string }>;
};

const AUS_KI: Record<string, Bereich> = {
  person: "person",
  kurzprofil: "person",
  station: "erfahrung",
  ausbildung: "ausbildung",
  kenntnisse: "kenntnisse",
  sprachen: "kenntnisse",
  allgemein: "allgemein",
};

const klein = (t: unknown) => (typeof t === "string" ? t.toLowerCase() : "");
/** Namen wie „Kita Sonnenschein gGmbH“ → aussagekräftige Wörter (ohne Rechtsform, mind. 4 Zeichen). */
const woerter = (t: unknown) =>
  klein(t)
    .split(/[^a-zäöüß0-9]+/)
    .filter((w) => w.length >= 4 && !["gmbh", "ggmbh", "mbh", "e.v.", "stadt", "gruppe"].includes(w));
const daten = (t: string) => t.match(/\b\d{1,2}\/\d{4}\b|\b(19|20)\d{2}\b/g) ?? [];

function passtName(text: string, ...felder: unknown[]): boolean {
  for (const f of felder) {
    const ganz = klein(f).trim();
    if (ganz.length >= 4 && text.includes(ganz)) return true;
    const w = woerter(f);
    if (w.length && w.some((x) => x.length >= 6 && text.includes(x))) return true;
  }
  return false;
}

function einzig<T>(liste: T[], test: (x: T) => boolean): number | null {
  const treffer = liste.flatMap((x, i) => (test(x) ? [i] : []));
  return treffer.length === 1 ? treffer[0] : null;
}

export function zuordnen(p: Pp, cv: Cv): Zuordnung {
  const stationen = cv.stationen ?? [];
  const ausbildung = cv.ausbildung ?? [];

  // 1. Vom Prüfbericht selbst angegeben
  const b = p.bereich ? AUS_KI[p.bereich] : undefined;
  if (b) {
    const n = b === "erfahrung" ? stationen.length : b === "ausbildung" ? ausbildung.length : 0;
    const e = Number.isInteger(p.eintrag) && (p.eintrag as number) >= 0 && (p.eintrag as number) < n ? (p.eintrag as number) : null;
    return { bereich: b, eintrag: e };
  }

  // 2. Aus dem Text schließen
  const punkt = klein(p.punkt);
  const text = `${punkt} ${klein(p.vorschlag)}`;

  if (/kontakt|e-mail|email|telefon|handy|linkedin|xing|anschrift|adresse|geburts|familienstand|religion|konfession|staatsangeh|eltern|foto|kurzprofil|profiltext/.test(punkt))
    return { bereich: "person", eintrag: null };
  const sName = einzig(stationen, (s) => passtName(punkt, s.arbeitgeber, s.titel));
  if (sName !== null) return { bereich: "erfahrung", eintrag: sName };
  const aName = einzig(ausbildung, (a) => passtName(punkt, a.einrichtung, a.abschluss));
  if (aName !== null) return { bereich: "ausbildung", eintrag: aName };

  if (/\bsprachen\b|sprachkenntnis|sprachniveau|kenntnisse|skills|fähigkeiten|faehigkeiten|edv|software/.test(punkt)) return { bereich: "kenntnisse", eintrag: null };

  const d = daten(punkt);
  if (d.length) {
    const sDatum = einzig(stationen, (s) => d.some((x) => klein(s.zeitraum).includes(x)));
    if (sDatum !== null) return { bereich: "erfahrung", eintrag: sDatum };
    const aDatum = einzig(ausbildung, (a) => d.some((x) => klein(a.zeitraum).includes(x)));
    if (aDatum !== null) return { bereich: "ausbildung", eintrag: aDatum };
  }

  if (/ausbildung|studium|schule|abschluss|weiterbildung|abitur|zeugnis/.test(punkt)) return { bereich: "ausbildung", eintrag: null };
  if (/station|lücke|luecke|zeitraum|datum|stichpunkt|aufgabe|erfolg|arbeitgeber|berufserfahrung|tätigkeit/.test(text))
    return { bereich: "erfahrung", eintrag: null };
  return { bereich: "allgemein", eintrag: null };
}

/** Reiter im Editor zu einem Bereich (für Links von „Mein Profil“). */
export const REITER_ZU: Record<Bereich, string> = {
  person: "person",
  erfahrung: "erfahrung",
  ausbildung: "ausbildung",
  kenntnisse: "kenntnisse",
  allgemein: "person",
};
