import type { BaDetail, BaHit } from "./ba";
import { baUrl } from "./ba";
import type { JobRow } from "./normalize";

/**
 * Quelle ist die Jobsuche der Bundesagentur für Arbeit.
 *
 * Es gibt nur eine Suche, keinen Feed — wir müssen vorab wissen, wonach wir
 * fragen. Der Preis ist ein blinder Fleck: Was keine Suche trifft, sehen wir
 * nie. Gegenmittel ist Breite — viele Begriffe statt weniger enger. Was
 * inhaltlich nicht passt, sortiert danach das Modell aus.
 */
export const SUCHBEGRIFFE = [
  // Kern
  "Product Owner",
  "Product Manager",
  "Produktmanager",
  "Produktmanagerin",
  "Senior Product Manager",
  "Product Lead",
  "Produktverantwortlicher",
  "Technical Product Manager",
  // KI
  "AI Product Manager",
  "AI Product Owner",
  "KI Produktmanager",
  "KI Manager",
  "AI Manager",
  "AI Program Manager",
  "KI Projektmanager",
  "AI Solutions",
  "AI Transformation",
  "Conversational AI",
  // Plattform und interne Systeme
  "Platform Product Manager",
  "Applikationsmanager",
  "IT-Produktmanager",
  // Digitalisierung
  "Digital Product Manager",
  "Digitalisierungsmanager",
  "Produktmanager Digitalisierung",
  // Career Upgrade (Suchspur B): Führungs- und Senior-Rollen, auch ohne KI
  "Head of Product",
  "Head of Digital",
  "Lead Product Owner",
  "Director Product",
  "Digital Transformation Manager",
  "Leitung Digitalisierung",
  // SaaS und Growth
  "SaaS Product Manager",
  "Product Marketing Manager",
  "Growth Manager",
];

const TITEL_AUSSCHLUSS = [
  "praktikum", "praktikant", "werkstudent", "trainee", "ausbildung",
  "azubi", "duales studium", "bachelorand", "masterand", "aushilfe",
  "minijob", "abschlussarbeit",
];

/**
 * Großraum Hamburg. Primär über die Postleitzahl (20xxx–22xxx deckt Hamburg
 * und den Pendelgürtel ab: Norderstedt, Pinneberg, Ahrensburg, Wedel,
 * Buchholz, Buxtehude, Lüneburg). Der Ortsname ist das Netz, falls die PLZ fehlt.
 */
const HAMBURG_ORTE = [
  "hamburg", "norderstedt", "pinneberg", "ahrensburg", "wedel", "buchholz",
  "quickborn", "reinbek", "glinde", "halstenbek", "rellingen", "schenefeld",
  "buxtehude", "lüneburg", "seevetal", "henstedt-ulzburg", "bargteheide",
];

export function istHamburg(hit: BaHit): boolean {
  return (hit.stellenlokationen ?? []).some((lokation) => {
    const plz = (lokation?.adresse?.plz ?? "").trim();
    const ort = (lokation?.adresse?.ort ?? "").toLowerCase();
    return /^2[0-2]\d{3}$/.test(plz) || HAMBURG_ORTE.some((stadt) => ort.includes(stadt));
  });
}

/**
 * Remote heißt: von Hamburg aus machbar. Ein Homeoffice-Tag pro Woche in
 * München reicht dafür nicht. Fehlt die Prozentangabe, lassen wir die Stelle
 * durch — dann urteilt das Modell anhand des Anzeigentexts.
 */
export function istRemote(hit: BaHit): boolean {
  if (hit.homeofficemoeglich !== true) return false;
  const prozent = typeof hit.homeofficeprozent === "number" ? hit.homeofficeprozent : null;
  return prozent === null || prozent >= 60;
}

export type DeVerdict = { keep: true; matched: string } | { keep: false; reason: string };

export function filterDe(hit: BaHit, suchbegriff: string): DeVerdict {
  const titel = (hit.stellenangebotsTitel ?? "").toLowerCase();

  const ausgeschlossen = TITEL_AUSSCHLUSS.find((needle) => titel.includes(needle));
  if (ausgeschlossen) {
    return { keep: false, reason: `titel-ausschluss:${ausgeschlossen}` };
  }

  if (istHamburg(hit)) return { keep: true, matched: `hamburg:${suchbegriff}` };
  if (istRemote(hit)) return { keep: true, matched: `remote:${suchbegriff}` };

  return { keep: false, reason: "weder-hamburg-noch-remote" };
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

export function homeofficeText(hit: BaHit): string | null {
  if (hit.homeofficemoeglich !== true) return null;
  return hit.homeofficeprozent ? `Homeoffice ${hit.homeofficeprozent} %` : "Homeoffice möglich";
}

export function normalizeDe(hit: BaHit, detail: BaDetail | null, matchTerm: string): JobRow {
  // Bei mehreren Standorten den Hamburger zeigen, sonst den ersten.
  const lokationen = hit.stellenlokationen ?? [];
  const hamburg = lokationen.find((lokation) =>
    istHamburg({ stellenlokationen: [lokation] } as BaHit)
  );
  const adresse = (hamburg ?? lokationen[0])?.adresse ?? null;
  const ref = hit.referenznummer ?? "";

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
    // Externe Bewerbungsseite des Arbeitgebers, falls vorhanden — sonst die Anzeige bei der BA.
    application_url: clean(hit.externeUrl) ?? (ref ? baUrl(ref) : null),
    application_due: null,
    source_url: ref ? baUrl(ref) : null,
    description: clean(detail?.stellenangebotsBeschreibung),
    extent: hit.arbeitszeitVollzeit ? "Vollzeit" : "Teilzeit",
    engagement_type: clean(hit.vertragsdauer),
    // Kein Sektorfeld; Homeoffice-Angabe ist hier die nützlichere Information.
    sector: homeofficeText(hit),
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
 * Gehalt kommt hier strukturiert. Werte sind Euro pro Jahr.
 */
export function gehaltDe(hit: BaHit): { min: number | null; max: number | null; note: string | null } {
  const min = typeof hit.gehaltsspanneVon === "number" ? hit.gehaltsspanneVon : null;
  const max = typeof hit.gehaltsspanneBis === "number" ? hit.gehaltsspanneBis : null;
  if (min === null && max === null) return { min: null, max: null, note: clean(hit.verguetungsangabe) };
  return { min, max, note: clean(hit.verguetungsangabe) };
}
