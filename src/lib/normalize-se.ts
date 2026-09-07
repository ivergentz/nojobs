import type { SeAd } from "./jobstream";
import type { JobRow } from "./normalize";

/**
 * Filter und Normalisierung für Schweden.
 *
 * Anders als bei NAV kostet ein Treffer hier nichts extra — die vollständige
 * Anzeige liegt schon vor. Der Filter dient also nur noch dazu, die Datenbank
 * und die spätere Bewertung sauber zu halten, nicht dazu, Netzwerklast zu
 * sparen. Entsprechend großzügiger ist er geschnitten.
 */

const TITLE_INCLUDE = [
  // Produkt und Projekt
  "produkt", "product", "projektled", "project", "program", "portfölj",
  "ägare", "owner", "scrum", "agil",
  // Digital und Tech
  "digital", "teknolog", "technolog", "tech", "utveckl", "developer", "engineer",
  "ingenjör", "arkitekt", "architect", "system", "plattform", "platform",
  "mjukvara", "software", "moln", "cloud", "devops", "data", "analytic",
  "analys", "analyst", "insikt", "insight", "ai", "artificiell intelligens",
  "machine learning", "maskininlärning", "low-code", "no-code",
  // Verwaltung und Weiterentwicklung interner Systeme
  "förvalt", "systemförvalt", "verksamhetsutveckl", "digitaliser",
  "kravanalytiker", "kravställ", "lösningsarkitekt", "tjänstedesign",
  // Business
  "affärsutveckl", "business", "strategi", "strategy", "rådgivare", "advisor",
  "konsult", "consultant", "innovation", "transformation", "saas", "growth",
  // Führung
  "chef", "ledare", "manager", "head of", "director", "cto", "cpo", "cio", "lead",
  // Design
  "ux", "design", "interaktion",
];

const TITLE_EXCLUDE = [
  "lärling", "praktikant", "praktik", "internship", "sommarjobb", "summer job",
  "studentmedarbetare", "student assistant", "timanställ", "vikariepool",
];

/**
 * Berufsfelder, die wir verwerfen.
 *
 * BEWUSST LEER beim ersten Lauf — dieselbe Lehre wie bei NAV: Erst die echte
 * Verteilung auf /stats ansehen, dann die Werte exakt so eintragen, wie sie
 * dort stehen. Geratene Taxonomie-Strings haben schon einmal Zeit gekostet.
 */
const FIELD_EXCLUDE: string[] = [];

export type SeVerdict = { keep: true; matched: string | null } | { keep: false; reason: string };

const lower = (value: unknown): string =>
  typeof value === "string" ? value.toLowerCase() : "";

export function filterSe(ad: SeAd): SeVerdict {
  if (ad.removed === true) {
    return { keep: false, reason: "status:removed" };
  }

  const field = ad.occupation_field?.label ?? null;
  if (field && FIELD_EXCLUDE.includes(field)) {
    return { keep: false, reason: `yrkesomrade:${field}` };
  }

  const haystack = [lower(ad.headline), lower(ad.occupation?.label)].join(" ");

  const excluded = TITLE_EXCLUDE.find((needle) => haystack.includes(needle));
  if (excluded) {
    return { keep: false, reason: `titel-ausschluss:${excluded}` };
  }

  const matched = TITLE_INCLUDE.find((needle) => haystack.includes(needle));
  if (!matched) {
    return { keep: false, reason: "titel-kein-treffer" };
  }

  return { keep: true, matched };
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

export function normalizeSe(ad: SeAd, matchTerm: string | null): JobRow {
  const address = ad.workplace_address ?? null;

  return {
    uuid: `se-${String(ad.id ?? "")}`,
    source: "jobstream",
    status: ad.removed === true ? "INACTIVE" : "ACTIVE",
    title: clean(ad.headline),
    employer_name: clean(ad.employer?.name) ?? clean(ad.employer?.workplace),
    employer_homepage: clean(ad.employer?.url),
    municipal: clean(address?.municipality),
    county: clean(address?.region),
    country: clean(address?.country) ?? "Sverige",
    published: asTimestamp(ad.publication_date),
    expires: asTimestamp(ad.last_publication_date),
    updated: asTimestamp(ad.publication_date),
    // Bewerbungslink zeigt auf das Originalsystem, sonst auf die Platsbanken.
    application_url: clean(ad.application_details?.url) ?? clean(ad.webpage_url),
    application_due: clean(ad.application_deadline),
    source_url: clean(ad.webpage_url),
    description: clean(ad.description?.text),
    extent: clean(ad.working_hours_type?.label),
    engagement_type: clean(ad.employment_type?.label),
    // Kein Sektorfeld in JobStream; Gehaltsangabe passt hier fachlich besser.
    sector: clean(ad.salary_description) ?? clean(ad.salary_type?.label),
    occupation_level1: clean(ad.occupation_field?.label),
    occupation_level2: clean(ad.occupation_group?.label),
    categories: ad.must_have ?? null,
    match_term: matchTerm,
    raw: {
      identified_language: ad.identified_language ?? null,
      occupation: ad.occupation?.label ?? null,
      scope_of_work: ad.scope_of_work ?? null,
      must_have: ad.must_have ?? null,
      nice_to_have: ad.nice_to_have ?? null,
    },
    imported_at: new Date().toISOString(),
  };
}
