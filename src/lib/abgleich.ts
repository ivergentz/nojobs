/**
 * Abgleich jobs ↔ matches (Schritt 1.3).
 *
 * Seit Schritt 1.2 spiegelt die Datenbank deine persönlichen Felder aus jobs
 * nach matches. Hier wird geprüft, ob beide wirklich übereinstimmen — die
 * Voraussetzung, bevor in Schritt 1.4 Inbox und Co. aus matches lesen.
 * Liest nur; fehlt die Tabelle (matches.sql noch nicht ausgeführt), meldet es das.
 */

type Db = { from: (tabelle: string) => any };

export type Abweichung = {
  job_uuid: string;
  title: string | null;
  employer_name: string | null;
  art: "fehlt" | "abweichend";
  felder: string[];
};

export type Abgleich =
  | { stand: "nicht_eingerichtet"; hinweis: string }
  | { stand: "fehler"; hinweis: string }
  | { stand: "ok" | "abweichend"; gespiegelt: number; abweichungen: number; beispiele: Abweichung[] };

export async function ladeAbgleich(db: Db, beispiele = 20): Promise<Abgleich> {
  try {
    const [gesp, abw] = await Promise.all([
      db.from("matches").select("job_uuid", { count: "exact", head: true }),
      db
        .from("matches_abweichungen")
        .select("job_uuid,title,employer_name,art,felder", { count: "exact" })
        .order("job_uuid", { ascending: true })
        .limit(beispiele),
    ]);
    const fehler = gesp.error ?? abw.error;
    if (fehler) {
      const fehlt = /matches|does not exist|schema cache|42P01|PGRST20/i.test(`${fehler.message} ${fehler.code ?? ""}`);
      return fehlt
        ? { stand: "nicht_eingerichtet", hinweis: "supabase/matches.sql ist noch nicht ausgeführt." }
        : { stand: "fehler", hinweis: fehler.message };
    }
    const anzahl = abw.count ?? (abw.data ?? []).length;
    return {
      stand: anzahl === 0 ? "ok" : "abweichend",
      gespiegelt: gesp.count ?? 0,
      abweichungen: anzahl,
      beispiele: ((abw.data ?? []) as Abweichung[]).map((a) => ({ ...a, felder: Array.isArray(a.felder) ? a.felder : [] })),
    };
  } catch (err) {
    return { stand: "fehler", hinweis: err instanceof Error ? err.message : String(err) };
  }
}
