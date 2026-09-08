import type { BaDetail, BaHit } from "./ba";
import { baUrl } from "./ba";
import type { JobRow } from "./normalize";

/**
 * Deutschland läuft anders als Norwegen und Schweden.
 *
 * Dort gibt es einen Feed und wir filtern selbst. Hier gibt es nur eine Suche,
 * also müssen wir vorab wissen, wonach wir fragen. Der Preis ist ein blinder
 * Fleck: Was keine Suche trifft, sehen wir nie. Gegenmittel ist Breite —
 * viele Begriffe statt weniger enger.
 */
export const SUCHBEGRIFFE = [
  // Kern
  "Product Owner",
  "Product Manager",
  "Produktmanager",
  "Senior Product Manager",
  "Product Lead",
  "Produktverantwortlicher",
  "Technical Product Manager",
  // KI
  "AI Product Manager",
  "KI Produktmanager",
  "AI Product Owner",
  // Plattform und interne Systeme
  "Platform Product Manager",
  "Applikationsmanager",
  "Systemverantwortlicher",
  "IT-Produktmanager",
  // Digitalisierung
  "Digital Product Manager",
  "Digitalisierungsmanager",
  "Produktmanager Digitalisierung",
  // SaaS und Growth
  "SaaS Product Manager",
  "Product Marketing Manager",
  "Growth Manager",
];

const TITEL_AUSSCHLUSS = [
  "praktikum", "praktikant", "werkstudent", "trainee", "ausbildung",
  "azubi", "duales studium", "bachelorand", "masterand", "aushilfe",
];

/**
 * Zwei Wege in die Inbox: Homeoffice möglich, oder Standort Hamburg.
 * Eine Präsenzstelle in München nützt nichts.
 */
const HAMBURG = ["hamburg", "norderstedt", "pinneberg", "ahrensburg", "wedel", "buchholz"];

export type DeVerdict = { keep: true; matched: string } | { keep: false; reason: string };

export function filterDe(hit: BaHit, suchbegriff: string): DeVerdict {
  const titel = (hit.stellenangebotsTitel ?? "").toLowerCase();

  const ausgeschlossen = TITEL_AUSSCHLUSS.find((needle) => titel.includes(needle));
  if (ausgeschlossen) {
    return { keep: false, reason: `titel-ausschluss:${ausgeschlossen}` };
  }

  const remote = hit.homeofficemoeglich === true;
  const ort = (hit.stellenlokationen?.[0]?.adresse?.ort ?? "").toLowerCase();
  const nahHamburg = HAMBURG.some((stadt) => ort.includes(stadt));

  if (!remote && !nahHamburg) {
    return { keep: false, reason: "weder-remote-noch-hamburg" };
  }

  return { keep: true, matched: remote ? `remote:${suchbegriff}` : `hamburg:${suchbegriff}` };
}

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const asTimestamp = (value: unknown): string | null => {
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

export function normalizeDe(hit: BaHit, detail: BaDetail | null, matchTerm: string): JobRow {
  const adresse = hit.stellenlokationen?.[0]?.adresse ?? null;
  const ref = hit.referenznummer ?? "";

  const homeoffice =
    hit.homeofficemoeglich === true
      ? hit.homeofficeprozent
        ? `Homeoffice ${hit.homeofficeprozent} %`
        : "Homeoffice möglich"
      : null;

  return {
    uuid: `de-${ref}`,
    source: "ba",
    status: "ACTIVE",
    title: clean(hit.stellenangebotsTitel) ?? clean(hit.hauptberuf),
    employer_name: clean(hit.firma) ?? clean(detail?.arbeitgeber),
    employer_homepage: null,
    municipal: clean(adresse?.ort),
    county: clean(adresse?.region),
    country: "Deutschland",
    published: asTimestamp(hit.datumErsteVeroeffentlichung),
    expires: null,
    updated: asTimestamp(hit.aenderungsdatum),
    application_url: ref ? baUrl(ref) : null,
    application_due: null,
    source_url: ref ? baUrl(ref) : null,
    description: clean(detail?.stellenangebotsBeschreibung),
    extent: hit.arbeitszeitVollzeit ? "Vollzeit" : "Teilzeit",
    engagement_type: clean(hit.vertragsdauer),
    // Kein Sektorfeld; Homeoffice-Angabe ist hier die nützlichere Information.
    sector: homeoffice,
    occupation_level1: clean(hit.hauptberuf),
    occupation_level2: clean(hit.alleBerufe?.[1]),
    categories: hit.alleBerufe ?? null,
    match_term: matchTerm,
    raw: {
      homeofficemoeglich: hit.homeofficemoeglich ?? null,
      homeofficetyp: hit.homeofficetyp ?? null,
      homeofficeprozent: hit.homeofficeprozent ?? null,
      branche: detail?.branche ?? null,
      eintritt: hit.eintrittszeitraum?.von ?? null,
      referenznummer: ref,
    },
    imported_at: new Date().toISOString(),
  };
}

/**
 * Gehalt kommt hier strukturiert — anders als bei NAV, wo es aus dem Fließtext
 * gelesen werden muss. Werte sind Euro pro Jahr.
 */
export function gehaltDe(hit: BaHit): { min: number | null; max: number | null; note: string | null } {
  const min = typeof hit.gehaltsspanneVon === "number" ? hit.gehaltsspanneVon : null;
  const max = typeof hit.gehaltsspanneBis === "number" ? hit.gehaltsspanneBis : null;
  if (min === null && max === null) return { min: null, max: null, note: null };
  return { min, max, note: clean(hit.verguetungsangabe) };
}
