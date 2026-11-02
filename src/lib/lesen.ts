/**
 * Schritt 1.4: Woher werden deine persönlichen Felder gelesen?
 *
 *   LESEN_AUS nicht gesetzt (Standard) → Tabelle jobs, wie bisher
 *   LESEN_AUS=matches                  → Sicht jobs_sicht: Stellen aus jobs,
 *                                        Bewertung/Label/Status/Entwurf … aus matches
 *
 * Nur Lesezugriffe laufen hierüber. Geschrieben wird weiter in jobs; der
 * Spiegel in der Datenbank überträgt es sofort nach matches.
 *
 * Sicherheitsnetz: Ist der Schalter an, die Sicht aber (noch) nicht angelegt,
 * wird dieselbe Abfrage automatisch auf jobs wiederholt — die Seite bleibt heil.
 * Zurückschalten: Variable in Vercel löschen und neu deployen.
 */

export type LeseQuelle = "jobs" | "jobs_sicht";

export function leseQuelle(): LeseQuelle {
  return (process.env.LESEN_AUS ?? "").trim().toLowerCase() === "matches" ? "jobs_sicht" : "jobs";
}

/**
 * Fehlt die Sicht? Postgres 42P01 bzw. PostgREST „nicht im Schema-Cache“ — oder
 * HTTP 404: Bei reinen Zählabfragen (head) liefert PostgREST keinen Fehlertext,
 * nur den Status. 404 gibt es dort nur, wenn die Tabelle/Sicht fehlt.
 */
export function sichtFehlt(error: { message?: string; code?: string } | null | undefined, status?: number): boolean {
  if (status === 404) return true;
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`;
  return /jobs_sicht/.test(text) && /(42P01|PGRST20\d|does not exist|schema cache|could not find)/i.test(text);
}

/**
 * Reine Zählabfragen (select mit { count, head: true }) melden eine fehlende Sicht
 * weder mit Fehler noch mit 404 — der Client macht daraus Status 204 und count = null.
 * Eine vorhandene Sicht liefert immer eine Zahl (auch 0).
 */
function zaehlungFehlt(aufrufe: Array<[PropertyKey, unknown[]]>, ergebnis: any): boolean {
  const zaehlt = aufrufe.some(([m, args]) => m === "select" && (args[1] as { count?: string } | undefined)?.count);
  return zaehlt && !ergebnis?.error && (ergebnis?.count === null || ergebnis?.count === undefined);
}

// Gibt denselben Abfrage-Typ zurück wie db.from("jobs") — die Aufrufer bleiben unverändert typisiert.
//
// profil: weggelassen oder "iver" → dein Profil, Verhalten wie bisher.
//         anderes Profil (Schritt 2.2) → Sicht jobs_profil, gefiltert auf dieses Profil.
export function lesen<D extends { from: (tabelle: string) => any }>(db: D, profil?: string): ReturnType<D["from"]> {
  if (profil && profil !== "iver") return profilKette(db, profil);
  if (leseQuelle() === "jobs") return db.from("jobs");

  // Aufrufe merken (select, eq, order …), damit sie bei Bedarf auf jobs wiederholt werden können.
  // Jeder Aufruf liefert eine neue, unabhängige Kette — wie beim echten Abfrage-Builder.
  const baue = (tabelle: LeseQuelle, aufrufe: Array<[PropertyKey, unknown[]]>) =>
    aufrufe.reduce((abfrage: any, [methode, args]) => abfrage[methode](...args), db.from(tabelle));

  const kette = (aufrufe: Array<[PropertyKey, unknown[]]>): any =>
    new Proxy(
      {},
      {
        get(_ziel, prop) {
          if (prop === "then") {
            return (erfuellt: (wert: unknown) => unknown, abgelehnt: (grund: unknown) => unknown) =>
              Promise.resolve(baue("jobs_sicht", aufrufe))
                .then((ergebnis: any) =>
                  sichtFehlt(ergebnis?.error, ergebnis?.status) || zaehlungFehlt(aufrufe, ergebnis) ? baue("jobs", aufrufe) : ergebnis
                )
                .then(erfuellt, abgelehnt);
          }
          return (...args: unknown[]) => kette([...aufrufe, [prop, args]]);
        },
      }
    );
  return kette([]);
}

/**
 * Lesen für ein weiteres Profil: dieselbe Abfrage auf jobs_profil, nach select()
 * automatisch auf das Profil eingeschränkt. Kein Rückfall auf jobs — dort stehen
 * nur deine Daten, die darf ein anderes Profil nie zu sehen bekommen.
 */
function profilKette(db: { from: (tabelle: string) => any }, profil: string): any {
  const baue = (aufrufe: Array<[PropertyKey, unknown[]]>) =>
    aufrufe.reduce((abfrage: any, [methode, args]) => {
      const weiter = abfrage[methode](...args);
      return methode === "select" ? weiter.eq("profil", profil) : weiter;
    }, db.from("jobs_profil"));
  const kette = (aufrufe: Array<[PropertyKey, unknown[]]>): any =>
    new Proxy(
      {},
      {
        get(_ziel, prop) {
          if (prop === "then") {
            return (erfuellt: (wert: unknown) => unknown, abgelehnt: (grund: unknown) => unknown) =>
              Promise.resolve(baue(aufrufe)).then(erfuellt, abgelehnt);
          }
          return (...args: unknown[]) => kette([...aufrufe, [prop, args]]);
        },
      }
    );
  return kette([]);
}
