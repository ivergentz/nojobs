import { supabaseAdmin } from "@/lib/supabase";
import { aufraeumen, loeschenAn, type Aufbewahrung } from "@/lib/aufbewahrung";

const zahl = new Intl.NumberFormat("de-DE");

/**
 * Schritt 1.5: Was würde die Aufbewahrungsregel heute Nacht löschen?
 * Diese Anzeige zählt nur (aufraeumen mit loeschen = false) — sie löscht nie.
 */
export default async function AufbewahrungUebersicht() {
  let v: Aufbewahrung;
  try {
    v = await aufraeumen(supabaseAdmin(), false);
  } catch (err) {
    v = { stand: "fehler", hinweis: err instanceof Error ? err.message : String(err) };
  }
  const an = loeschenAn();

  return (
    <section className="card-pad mt-5 text-sm">
      <h2 className="font-semibold">Aufbewahrung</h2>
      <p className="mt-1 text-xs text-muted">
        Für immer behalten: jede Stelle, die du angefasst hast (Label, Status, Notiz, Entwurf, Vorbereitung, Tracking).
        Gelöscht werden unangetastete Stellen nach 60 Tagen und aussortierte Anzeigen nach 90 Tagen.
      </p>

      {v.stand === "nicht_eingerichtet" && (
        <p className="mt-3 text-muted">
          Noch nicht eingerichtet — <code>supabase/aufbewahrung.sql</code> im SQL Editor ausführen. Bis dahin wird nichts gelöscht.
        </p>
      )}
      {v.stand === "fehler" && <p className="mt-3 text-drop">Vorschau nicht lesbar: {v.hinweis}</p>}

      {v.stand === "ok" && (
        <>
          <ul className="mt-3 space-y-1">
            <li className="flex justify-between gap-6 border-t border-rule/60 py-1.5">
              <span>Unangetastete Stellen, älter als 60 Tage</span>
              <span className="tnum">{zahl.format(v.stellen)}</span>
            </li>
            <li className="flex justify-between gap-6 border-t border-rule/60 py-1.5">
              <span>Aussortierte Anzeigen, älter als 90 Tage</span>
              <span className="tnum">{zahl.format(v.aussortiert)}</span>
            </li>
            <li className="flex justify-between gap-6 border-t border-rule/60 py-1.5 text-muted">
              <span>Bleiben erhalten</span>
              <span className="tnum">{zahl.format(v.behalten)}</span>
            </li>
          </ul>
          {v.hinweis && <p className="mt-2 text-xs text-muted">{v.hinweis}</p>}
        </>
      )}

      <p className="mt-4">
        <span className="font-semibold">Löschen:</span>{" "}
        {an ? (
          <span className="text-drop">an — jede Nacht beim Aufräumen, höchstens 5.000 Stellen pro Nacht</span>
        ) : (
          <span className="text-muted">aus — nur Vorschau</span>
        )}
      </p>
      <p className="mt-1 text-xs text-muted">
        {an
          ? "Ausschalten: Variable AUFRAEUMEN_LOESCHEN in Vercel löschen und neu deployen."
          : "Einschalten: in Vercel AUFRAEUMEN_LOESCHEN=an setzen und neu deployen. Gelöschtes lässt sich nicht wiederherstellen."}
      </p>
    </section>
  );
}
