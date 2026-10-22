/**
 * Begründungen beim Labeln: warum "Ignorieren" oder warum nur "Anschauen"?
 *
 * Feste Kürzel statt Freitext, damit sie sich zählen lassen. Die Bewertung
 * bekommt sie als Teil der Beispiele und als Häufigkeitsliste — so lernt das
 * Modell nicht nur WAS du entschieden hast, sondern WARUM.
 */

export type Grund = { key: string; label: string };

export const GRUENDE_IGNORE: Grund[] = [
  { key: "ort", label: "Ort / kein Remote" },
  { key: "gehalt", label: "Gehalt zu niedrig" },
  { key: "rolle", label: "Falsche Rolle (Sales, Marketing, HR, Data …)" },
  { key: "zu-technisch", label: "Zu technisch / Entwickler" },
  { key: "zu-junior", label: "Zu junior" },
  { key: "kein-ki", label: "Kein KI- oder Produktkern" },
  { key: "oeffentlich", label: "Öffentlicher Dienst" },
  { key: "branche", label: "Branche / Firma passt nicht" },
  { key: "beratung", label: "Beratung / Agentur / Dienstleister" },
];

export const GRUENDE_ANSCHAUEN: Grund[] = [
  { key: "ki-unklar", label: "KI-Anteil unklar" },
  { key: "rolle-daneben", label: "Rolle nur teilweise passend" },
  { key: "gehalt-unklar", label: "Gehalt unklar" },
  { key: "ort-unklar", label: "Ort / Remote unklar" },
  { key: "level", label: "Level unklar (zu senior / zu junior?)" },
  { key: "firma-unbekannt", label: "Firma unbekannt" },
];

const ALLE = new Map([...GRUENDE_IGNORE, ...GRUENDE_ANSCHAUEN].map((g) => [g.key, g.label]));

export function grundText(key: string): string {
  return ALLE.get(key) ?? key;
}

export function istGrund(key: string): boolean {
  return ALLE.has(key);
}
