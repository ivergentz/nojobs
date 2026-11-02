/**
 * Schritt 1.5 · Aufbewahrungsregel (Datenbank-Funktion aufraeumen, supabase/aufbewahrung.sql).
 *
 *   AUFRAEUMEN_LOESCHEN nicht gesetzt (Standard) → nur zählen (Vorschau)
 *   AUFRAEUMEN_LOESCHEN=an                       → nachts wirklich löschen
 *
 * Fehlt die Funktion (SQL noch nicht ausgeführt), passiert nichts — es wird nur vermerkt.
 */

type Db = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export type Aufbewahrung =
  | { stand: "nicht_eingerichtet"; hinweis: string }
  | { stand: "fehler"; hinweis: string }
  | { stand: "ok"; stellen: number; aussortiert: number; behalten: number; geloescht: boolean; hinweis: string | null };

export function loeschenAn(): boolean {
  return ["an", "ja", "true", "1"].includes((process.env.AUFRAEUMEN_LOESCHEN ?? "").trim().toLowerCase());
}

export async function aufraeumen(db: Db, loeschen: boolean): Promise<Aufbewahrung> {
  try {
    const { data, error } = await db.rpc("aufraeumen", { loeschen });
    if (error) {
      const fehlt = /aufraeumen|could not find|does not exist|schema cache|PGRST20/i.test(`${error.code ?? ""} ${error.message ?? ""}`);
      return fehlt
        ? { stand: "nicht_eingerichtet", hinweis: "supabase/aufbewahrung.sql ist noch nicht ausgeführt." }
        : { stand: "fehler", hinweis: error.message };
    }
    const zeile = (Array.isArray(data) ? data[0] : data) ?? {};
    return {
      stand: "ok",
      stellen: Number(zeile.stellen ?? 0),
      aussortiert: Number(zeile.aussortiert ?? 0),
      behalten: Number(zeile.behalten ?? 0),
      geloescht: Boolean(zeile.geloescht),
      hinweis: zeile.hinweis ?? null,
    };
  } catch (err) {
    return { stand: "fehler", hinweis: err instanceof Error ? err.message : String(err) };
  }
}
