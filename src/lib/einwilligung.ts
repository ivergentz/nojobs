/**
 * Einwilligung vor dem ersten Lebenslauf-Upload (weitere Profile).
 * Ändert sich der Text wesentlich, VERSION hochsetzen — dann wird erneut gefragt.
 * Ohne Server-Abhängigkeiten, damit Seite und Route denselben Text nutzen.
 */

export const EINWILLIGUNG_VERSION = "2026-11-03";

export const EINWILLIGUNG_PUNKTE = [
  "nojobs ist ein privates, kostenloses Projekt von Iver Bohnes — derzeit ohne Bezahlung und ohne Werbung.",
  "Dein Lebenslauf, dein Foto und deine Angaben (Suchprofil, Urteile, Unterlagen) werden in seiner Datenbank gespeichert. Iver kann sie als Betreiber einsehen. Andere Nutzer sehen sie nicht.",
  "Zum Auslesen, Bewerten und Schreiben gehen Inhalte an die KI Claude (Anthropic). Für Suchprofil und Anschreiben ohne deine Kontaktdaten.",
  "Deine Daten werden nicht verkauft und nicht an Dritte weitergegeben. Auf eine kurze Nachricht an Iver wird alles gelöscht.",
];

export const EINWILLIGUNG_SATZ = "Ich habe das gelesen und bin einverstanden, dass mein Lebenslauf so gespeichert und genutzt wird.";

export type Einwilligung = { version: string; at: string };

export function einwilligungAus(einstellungen: Record<string, unknown> | null | undefined): Einwilligung | null {
  const e = (einstellungen ?? {}).einwilligung as Partial<Einwilligung> | undefined;
  return e && e.version === EINWILLIGUNG_VERSION && typeof e.at === "string" ? (e as Einwilligung) : null;
}
