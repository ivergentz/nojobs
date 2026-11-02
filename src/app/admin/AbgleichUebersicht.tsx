import { supabaseAdmin } from "@/lib/supabase";
import { ladeAbgleich, type Abgleich } from "@/lib/abgleich";
import NachziehenKnopf from "./NachziehenKnopf";

const zahl = new Intl.NumberFormat("de-DE");

/**
 * Schritt 1.3: Stimmen deine Daten in jobs und matches überein?
 * Nur Anzeige plus Knopf zum Nachziehen — an Inbox und Läufen ändert das nichts.
 */
export default async function AbgleichUebersicht() {
  let abgleich: Abgleich;
  try {
    abgleich = await ladeAbgleich(supabaseAdmin());
  } catch (err) {
    abgleich = { stand: "fehler", hinweis: err instanceof Error ? err.message : String(err) };
  }

  return (
    <section className="mt-12 border-t border-rule pt-8 text-sm">
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
    </section>
  );
}
