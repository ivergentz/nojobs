/**
 * Der Hard Filter. Zwei Stufen.
 *
 * Stufe A läuft auf dem leichten Feed-Eintrag (Titel, Arbeitgeber, Kommune) und
 * entscheidet, ob wir das Detail überhaupt abrufen. Das ist die einzige Stelle,
 * an der wir Netzwerklast sparen können — der Feed enthält alle Branchen
 * Norwegens.
 *
 * Stufe B läuft auf dem Detail und entfernt, was inhaltlich sicher nicht passt.
 *
 * Grundsatz: Stufe A ist bewusst großzügig. Was hier fällt, sehen wir nie
 * wieder, deshalb wird jeder Drop mit Titel und Grund protokolliert und ist
 * unter /stats einsehbar. Recall vor Precision.
 */

import type { NavAdJson, NavFeedItem } from "./nav";

export type FilterVerdict =
  | { keep: true }
  | { keep: false; stage: "A" | "B"; reason: string };

/**
 * Stufe A: breite Netz-Begriffe, norwegisch UND englisch.
 * Ein rein englisches Titel-Whitelist würde den norwegischen Markt
 * lautlos halbieren — Produktsjef, Prosjektleder, Forretningsutvikler
 * heißen nicht "Product Manager".
 */
const TITLE_INCLUDE = [
  // Produkt / Projekt
  "produkt", "product", "prosjekt", "project", "program",
  "portefølj", "portfolio", "eier", "owner", "scrum", "smidig", "agile",
  // Digital / Tech
  "digital", "teknolog", "technolog", "tech", "utvikl", "developer", "engineer",
  "ingeniør", "arkitekt", "architect", "system", "plattform", "platform",
  "software", "programvare", "sky", "cloud", "devops", "data", "analytic",
  "analyse", "analyst", "innsikt", "insight", "ai", "kunstig intelligens",
  "machine learning", "maskinlæring",
  // Business / Beratung
  "forretning", "business", "strategi", "strategy", "rådgiver", "advisor",
  "konsulent", "consultant", "innovasjon", "innovation", "transformasjon",
  "saas", "growth",
  // Führung
  "leder", "sjef", "manager", "head of", "direktør", "director", "cto", "cpo",
  "cio", "lead",
  // Design
  "ux", "design", "interaksjon",
];

/**
 * Titel, bei denen wir sofort raus sind — unabhängig davon, ob oben etwas
 * gematcht hat. Betrifft Einstiegs- und Ausbildungsrollen.
 */
const TITLE_EXCLUDE = [
  "lærling", "apprentice", "praktikant", "praktikum", "internship",
  "sommerjobb", "summer job", "studentassistent", "student assistant",
  "tilkalling", "ringevikar",
];

const normalise = (value: string | null | undefined) => (value ?? "").toLowerCase();

export function stageA(item: NavFeedItem): FilterVerdict {
  const status = (item._feed_entry?.status ?? "").toUpperCase();
  if (status !== "ACTIVE") {
    return { keep: false, stage: "A", reason: `status:${status || "unbekannt"}` };
  }

  const haystack = [
    normalise(item.title),
    normalise(item._feed_entry?.title),
  ].join(" ");

  const excluded = TITLE_EXCLUDE.find((needle) => haystack.includes(needle));
  if (excluded) {
    return { keep: false, stage: "A", reason: `titel-ausschluss:${excluded}` };
  }

  const matched = TITLE_INCLUDE.some((needle) => haystack.includes(needle));
  if (!matched) {
    return { keep: false, stage: "A", reason: "titel-kein-treffer" };
  }

  return { keep: true };
}

/**
 * Berufskategorien, die wir nach dem Detailabruf verwerfen.
 *
 * BEWUSST LEER beim ersten Lauf.
 *
 * Wir wissen noch nicht, welche Werte NAV in occupationCategories.level1
 * tatsächlich liefert und wie oft das Feld überhaupt gefüllt ist. Die
 * Stats-Seite zeigt die echte Verteilung. Erst danach hier eintragen,
 * exakt so geschrieben wie dort angezeigt, z. B.:
 *
 *   const OCCUPATION_EXCLUDE = ["Helse og sosial", "Bygg og anlegg"];
 */
const OCCUPATION_EXCLUDE: string[] = [];

/**
 * Anzeigen ohne Berufskategorie werden NICHT verworfen. Ein leeres Feld ist
 * kein Signal gegen die Stelle, sondern nur ein Datenmangel bei der Quelle.
 */
export function stageB(ad: NavAdJson): FilterVerdict {
  const level1 = ad.occupationCategories?.[0]?.level1 ?? null;

  if (level1 && OCCUPATION_EXCLUDE.includes(level1)) {
    return { keep: false, stage: "B", reason: `beruf:${level1}` };
  }

  const title = normalise(ad.title ?? ad.jobtitle);
  const excluded = TITLE_EXCLUDE.find((needle) => title.includes(needle));
  if (excluded) {
    return { keep: false, stage: "B", reason: `titel-ausschluss:${excluded}` };
  }

  // Sprache wird hier bewusst nicht bewertet. "Flytende norsk kreves" steckt im
  // Fließtext und ist eine Ermessensfrage — das ist später Aufgabe des LLM,
  // nicht einer Regel, die still aussortiert.
  return { keep: true };
}
