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

/**
 * Schritt 2.6 · Begründungen für weitere Profile — allgemein, für jeden Beruf.
 * Kürzel, die es bei dir schon gibt, behalten ihre Bezeichnung; neue Kürzel
 * sind eindeutig. Deine Listen oben bleiben unverändert.
 */
export const GRUENDE_IGNORE_ALLGEMEIN: Grund[] = [
  { key: "fahrtweg", label: "Ort / Fahrtweg zu weit" },
  { key: "arbeitszeit", label: "Arbeitszeit passt nicht (Voll-/Teilzeit, Schichten)" },
  { key: "gehalt", label: "Gehalt zu niedrig" },
  { key: "falsche-richtung", label: "Falsche Richtung / anderer Beruf" },
  { key: "zu-junior", label: "Zu junior" },
  { key: "zu-senior", label: "Zu senior / zu viel Verantwortung" },
  { key: "traeger", label: "Träger / Arbeitgeber passt nicht" },
  { key: "zeitarbeit", label: "Zeitarbeit / Personaldienstleister" },
  { key: "befristet", label: "Befristet" },
];

export const GRUENDE_ANSCHAUEN_ALLGEMEIN: Grund[] = [
  { key: "rolle-daneben", label: "Rolle nur teilweise passend" },
  { key: "arbeitszeit-unklar", label: "Arbeitszeit unklar" },
  { key: "gehalt-unklar", label: "Gehalt unklar" },
  { key: "fahrtweg-grenzwertig", label: "Ort / Fahrtweg grenzwertig" },
  { key: "level", label: "Level unklar (zu senior / zu junior?)" },
  { key: "arbeitgeber-unbekannt", label: "Arbeitgeber unbekannt" },
];

/**
 * Ablegen in der Inbox: „Passt, aber …“ — die Stelle war ein guter Vorschlag, beworben
 * wurde aus einem äußeren Grund. Diese Gründe zählen NICHT gegen die Stelle.
 * (Die Gründe „Passt nicht“ sind dieselben wie beim Labeln mit Ignorieren.)
 */
export const GRUENDE_ABLAGE_PASST: Grund[] = [
  { key: "ablage-schon-beworben", label: "Schon beworben (anderer Weg)" },
  { key: "ablage-nicht-abrufbar", label: "Stelle nicht mehr abrufbar / besetzt" },
  { key: "ablage-frist", label: "Bewerbungsfrist abgelaufen" },
  { key: "ablage-doppelt", label: "Doppelt in der Liste" },
  { key: "ablage-zeitpunkt", label: "Gerade nicht der richtige Zeitpunkt" },
  { key: "ablage-sonstiges", label: "Anderer Grund (siehe Notiz)" },
];
export const ABLAGE_BEWORBEN = "ablage-schon-beworben";
export const istAblageGrund = (key: string) => GRUENDE_ABLAGE_PASST.some((g) => g.key === key);

/** Welche Begründungen das Profil beim Labeln sieht. Dein Profil: deine Listen wie bisher. */
export function gruendeFuer(profil: string): { ignore: Grund[]; anschauen: Grund[] } {
  return profil === "iver"
    ? { ignore: GRUENDE_IGNORE, anschauen: GRUENDE_ANSCHAUEN }
    : { ignore: GRUENDE_IGNORE_ALLGEMEIN, anschauen: GRUENDE_ANSCHAUEN_ALLGEMEIN };
}

// Deine Bezeichnungen haben Vorrang — gemeinsame Kürzel heißen in deinen Beispielen exakt wie bisher.
const ALLE = new Map(
  [...GRUENDE_ABLAGE_PASST, ...GRUENDE_IGNORE_ALLGEMEIN, ...GRUENDE_ANSCHAUEN_ALLGEMEIN, ...GRUENDE_IGNORE, ...GRUENDE_ANSCHAUEN].map((g) => [g.key, g.label])
);

export function grundText(key: string): string {
  return ALLE.get(key) ?? key;
}

export function istGrund(key: string): boolean {
  return ALLE.has(key);
}
