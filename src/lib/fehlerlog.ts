import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Protokoll für ausgefallene Schnittstellen (Tabelle `quellen_log`).
 *
 * Grundsatz: Fällt eine Quelle aus — eine Firma ändert ihr Bewerbersystem,
 * SerpApi ist leer, die Arbeitsagentur antwortet nicht —, läuft der Rest
 * weiter. Der Ausfall landet hier und ist unter /log sichtbar.
 *
 * Das Schreiben selbst darf nie etwas abbrechen: Fehlt die Tabelle oder ist
 * die Datenbank kurz weg, wird der Eintrag verworfen.
 */
export type LogEintrag = {
  quelle: string;
  detail?: string | null;
  meldung: string;
};

export async function logFehler(db: SupabaseClient, eintraege: LogEintrag[]): Promise<void> {
  if (!eintraege.length) return;
  try {
    await db.from("quellen_log").insert(
      eintraege.slice(0, 50).map((eintrag) => ({
        quelle: eintrag.quelle.slice(0, 60),
        detail: eintrag.detail?.slice(0, 120) ?? null,
        meldung: eintrag.meldung.slice(0, 500),
      }))
    );
  } catch {
    /* Protokoll ist Komfort, kein Pflichtteil */
  }
}
