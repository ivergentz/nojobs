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

/**
 * Muster statt Teilstrings.
 *
 * Der erste Lauf hat gezeigt, warum: "cio" traf 24-mal, weil es in "socionom"
 * steckt. Kurze Begriffe und Abkürzungen brauchen Wortgrenzen.
 *
 * Zweite Lehre: "chef", "ledare", "ingenjör" und "konsult" allein sind zu
 * breit — butikschef, restaurangchef, byggingenjör. Sie zählen nur noch mit
 * fachlicher Vorsilbe.
 */
const TITLE_PATTERNS: Array<[string, RegExp]> = [
  // Produkt und Projekt
  ["produkt", /produkt|product/i],
  ["projektledare", /projektled|program(chef|ledare|ansvarig)/i],
  ["agile", /\bscrum\b|\bagil|product owner|produktägare/i],

  // Entwicklung und Architektur
  ["utveckling", /utveckl|developer|mjukvar|software/i],
  ["arkitekt", /arkitekt|architect/i],
  ["engineer", /\bengineer\b|\bengineering\b/i],
  ["ingenjör-tech", /(system|mjukvaru|data|test|plattform|it)[- ]?ingenjör/i],

  // Plattform und interne Systeme — die Rollen, die dem VBG-Profil entsprechen
  ["plattform", /plattform|platform/i],
  ["förvaltning", /förvalt|systemägare|objektägare/i],
  ["verksamhetsutveckling", /verksamhetsutveckl|digitaliser/i],
  ["kravanalys", /kravanalytiker|kravställ|lösningsarkitekt/i],
  ["low-code", /low[- ]?code|no[- ]?code/i],

  // Daten und KI
  ["ai", /\bai\b|\bai[- ]|artificiell intelligens|machine learning|maskininlärning/i],
  ["data", /\bdata\b|\bdata[- ]/i],
  ["analys", /analytic|\banalys(t|chef|ansvarig)/i],

  // Business und Beratung
  ["affärsutveckling", /affärsutveckl|business develop/i],
  ["strategi", /\bstrategi|\bstrategy\b/i],
  ["rådgivare-digital", /(it|digital\w*|teknik\w*|data|verksamhet\w*)[- ]?(rådgivare|konsult|advisor|consultant)/i],
  ["innovation", /innovation|transformation/i],
  ["saas", /\bsaas\b|\bgrowth\b/i],

  // Führung, nur mit fachlicher Vorsilbe
  ["chef-tech", /(it|produkt|teknik|teknologi|digital|digitaliserings|utvecklings|system|data|innovations)[- ]?chef/i],
  ["ledare-tech", /(it|produkt|teknik|digital|utvecklings|team)[- ]?ledare/i],
  ["c-level", /\bcto\b|\bcpo\b|\bcio\b|\bcdo\b|head of (product|digital|technology|engineering)/i],

  // Design
  ["ux", /\bux\b|\bui\b|tjänstedesign|interaktionsdesign|produktdesign/i],
];

const TITLE_EXCLUDE = [
  "lärling", "praktikant", "praktik", "internship", "sommarjobb", "summer job",
  "studentmedarbetare", "student assistant", "timanställ", "vikariepool",
];

/**
 * Berufsfelder, die verworfen werden — gefüllt aus der echten Verteilung des
 * ersten Laufs, nicht geraten.
 */
const FIELD_EXCLUDE: string[] = [
  "Yrken med social inriktning",
  "Pedagogik",
  "Hälso- och sjukvård",
  "Bygg och anläggning",
  "Industriell tillverkning",
  "Transport, distribution, lager",
  "Installation, drift, underhåll",
  "Hotell, restaurang, storhushåll",
  "Säkerhet och bevakning",
  "Sanering och renhållning",
  "Naturbruk",
  "Kropps- och skönhetsvård",
];

/**
 * In diesem Feld ist jede Anzeige relevant genug fürs Modell — hier greift
 * kein Titelfilter. Recall vor Precision, und das Feld ist klein genug.
 */
const FIELD_ALWAYS = ["Data/IT"];

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

  const haystack = [ad.headline ?? "", ad.occupation?.label ?? ""].join(" ");
  const lowered = haystack.toLowerCase();

  const excluded = TITLE_EXCLUDE.find((needle) => lowered.includes(needle));
  if (excluded) {
    return { keep: false, reason: `titel-ausschluss:${excluded}` };
  }

  if (field && FIELD_ALWAYS.includes(field)) {
    const hit = TITLE_PATTERNS.find(([, pattern]) => pattern.test(haystack));
    return { keep: true, matched: hit ? hit[0] : "feld:Data/IT" };
  }

  const hit = TITLE_PATTERNS.find(([, pattern]) => pattern.test(haystack));
  if (!hit) {
    return { keep: false, reason: "titel-kein-treffer" };
  }

  return { keep: true, matched: hit[0] };
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
