import { supabaseAdmin } from "@/lib/supabase";
import { ladeAbgleich, pruefeLesequelle, type Abgleich } from "@/lib/abgleich";
import NachziehenKnopf from "./NachziehenKnopf";

const zahl = new Intl.NumberFormat("de-DE");

/**
 * Schritt 1.3: Stimmen deine Daten in jobs und matches überein?
 * Nur Anzeige plus Knopf zum Nachziehen — an Inbox und Läufen ändert das nichts.
 */
export default async function AbgleichUebersicht() {
  let abgleich: Abgleich;
  let lesen: Awaited<ReturnType<typeof pruefeLesequelle>> = { quelle: "jobs", sichtDa: false, hinweis: null };
  try {
    const db = supabaseAdmin();
    [abgleich, lesen] = await Promise.all([ladeAbgleich(db), pruefeLesequelle(db)]);
  } catch (err) {
    abgleich = { stand: "fehler", hinweis: err instanceof Error ? err.message : String(err) };
  }

  return (
    <section className="card-pad mt-5 text-sm">
      <h2 className="font-semibold">Abgleich jobs ↔ matches</h2>
      <p className="mt-1 text-xs text-muted">
        Vorbereitung für mehrere Personen: Deine persönlichen Daten werden in die neue Tabelle matches gespiegelt.
        Bevor die Inbox daraus liest, müssen beide übereinstimmen.
      </p>

      {abgleich.stand === "nicht_eingerichtet" && (
        <p className="mt-3 text-muted">
          Noch nicht eingerichtet — <code>supabase/matches.sql</code> im SQL Editor ausführen. Bis dahin läuft alles wie gewohnt.
        </p>
      )}

      {abgleich.stand === "fehler" && <p className="mt-3 text-drop">Abgleich nicht lesbar: {abgleich.hinweis}</p>}

      {abgleich.stand === "ok" && (
        <p className="mt-3">
          <span className="font-semibold text-keep">✓ Identisch</span>{" "}
          <span className="text-muted">· {zahl.format(abgleich.gespiegelt)} Stellen gespiegelt, 0 Abweichungen</span>
        </p>
      )}

      {abgleich.stand === "abweichend" && (
        <>
          <p className="mt-3">
            <span className="font-semibold text-drop">{zahl.format(abgleich.abweichungen)} Abweichungen</span>{" "}
            <span className="text-muted">· {zahl.format(abgleich.gespiegelt)} Stellen gespiegelt</span>
          </p>
          <ul className="mt-3 space-y-1">
            {abgleich.beispiele.map((a) => (
              <li key={a.job_uuid} className="flex flex-wrap justify-between gap-x-6 border-t border-rule/60 py-1.5">
                <span>
                  {a.title ?? a.job_uuid}
                  {a.employer_name ? <span className="text-muted"> · {a.employer_name}</span> : null}
                </span>
                <span className="text-xs text-muted">
                  {a.art === "fehlt" ? "fehlt in matches" : a.felder.join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {abgleich.abweichungen > abgleich.beispiele.length && (
            <p className="mt-2 text-xs text-muted">… und {zahl.format(abgleich.abweichungen - abgleich.beispiele.length)} weitere.</p>
          )}
          <NachziehenKnopf />
        </>
      )}

      <div className="mt-6 border-t border-rule/60 pt-3">
        <p>
          <span className="font-semibold">Lesen aus:</span>{" "}
          {lesen.quelle === "jobs_sicht" ? (
            lesen.sichtDa ? (
              <span className="text-keep">matches (über jobs_sicht) ✓</span>
            ) : (
              <span className="text-drop">matches gewünscht, aber jobs_sicht fehlt — liest ersatzweise aus jobs</span>
            )
          ) : (
            <span className="text-muted">jobs (Standard)</span>
          )}
        </p>
        <p className="mt-1 text-xs text-muted">
          {lesen.quelle === "jobs_sicht"
            ? "Zurück: Variable LESEN_AUS in Vercel löschen und neu deployen."
            : lesen.sichtDa
              ? "Bereit zum Umschalten: in Vercel LESEN_AUS=matches setzen und neu deployen. Zurück jederzeit durch Löschen der Variable."
              : "Zum Umschalten zuerst supabase/lese-sicht.sql ausführen, dann in Vercel LESEN_AUS=matches setzen."}
          {lesen.hinweis ? ` (${lesen.hinweis})` : ""}
        </p>
      </div>
    </section>
  );
}
