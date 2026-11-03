import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Eintrag = {
  id: number;
  created_at: string;
  quelle: string;
  detail: string | null;
  meldung: string;
};

function wann(value: string) {
  return new Date(value).toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
}

/**
 * Quellen-Log: welche Schnittstelle ist wann ausgefallen?
 *
 * Fällt eine Quelle aus, laufen die anderen weiter — hier sieht man, was
 * fehlte. Häufen sich Einträge bei einer Firma oder Quelle, ist sie
 * vermutlich dauerhaft kaputt (Bewerbersystem gewechselt, Schlüssel
 * abgelaufen) und gehört in firmen.json abgeschaltet oder repariert.
 */
export default async function LogPage() {
  const db = supabaseAdmin();
  const seit = new Date(Date.now() - 7 * 864e5).toISOString();

  const [{ data, error }, { data: woche }, { data: laeufe }] = await Promise.all([
    db.from("quellen_log").select("*").order("created_at", { ascending: false }).limit(200),
    db.from("quellen_log").select("quelle,detail").gte("created_at", seit).limit(2000),
    db.from("import_cursor").select("id,at_end,last_run_at,last_note").in("id", ["nachtlauf", "morgenlauf"]),
  ]);

  const eintraege = (data ?? []) as Eintrag[];

  // Häufung der letzten 7 Tage je Quelle + Detail
  const zaehler = new Map<string, number>();
  for (const row of (woche ?? []) as Array<{ quelle: string; detail: string | null }>) {
    const key = row.detail ? `${row.quelle} · ${row.detail}` : row.quelle;
    zaehler.set(key, (zaehler.get(key) ?? 0) + 1);
  }
  const haeufung = Array.from(zaehler.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <main className="page">
      <header className="mb-2">
        <p className="eyebrow">Quellen-Log</p>
        <h1 className="page-title mt-1.5">Ausgefallene Schnittstellen</h1>
        <p className="page-lead">
          Fällt eine Quelle aus, laufen die anderen weiter. Hier steht, was gefehlt hat. Taucht
          dieselbe Quelle an mehreren Tagen hintereinander auf, ist sie vermutlich dauerhaft kaputt.
        </p>
      </header>

      <section className="card-pad mt-6 text-sm">
        <h2 className="section-title text-base">Letzte Läufe</h2>
        <ul className="mt-3 space-y-1">
          {[
            ["nachtlauf", "🌙 Nachtlauf (Import)"],
            ["morgenlauf", "☀️ Morgenlauf (Bewertung + Telegram)"],
          ].map(([id, label]) => {
            const lauf = (laeufe ?? []).find((entry) => entry.id === id) as
              | { at_end: boolean | null; last_run_at: string | null; last_note: string | null }
              | undefined;
            return (
              <li key={id} className="flex flex-wrap justify-between gap-x-6 border-t border-rule/60 py-1.5">
                <span>{label}</span>
                <span className={`text-right ${lauf && !lauf.at_end ? "text-drop" : "text-muted"}`}>
                  {lauf?.last_run_at ? wann(lauf.last_run_at) : "noch nicht protokolliert"}
                  {lauf?.last_note ? ` — ${lauf.last_note}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">
          Erfolgreiche Läufe stehen nur hier. Fehlt beim Nachtlauf das heutige Datum, wurde er nicht gestartet.
        </p>
      </section>

      {error && (
        <p className="alert-error mt-6">
          Log nicht lesbar: {error.message}. Wurde das SQL-Skript für die Tabelle quellen_log
          ausgeführt?
        </p>
      )}

      {!error && eintraege.length === 0 && (
        <p className="alert-success mt-6">Keine Ausfälle protokolliert. Alle Quellen liefern.</p>
      )}

      {haeufung.length > 0 && (
        <section className="card-pad mt-5">
          <h2 className="section-title text-base">Letzte 7 Tage</h2>
          <ul className="mt-4 space-y-1 text-sm">
            {haeufung.map(([key, anzahl]) => (
              <li key={key} className="flex justify-between gap-6 border-t border-rule/60 py-1.5">
                <span>{key}</span>
                <span className={`tnum ${anzahl >= 3 ? "font-semibold text-drop" : "text-muted"}`}>
                  {anzahl}×
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Rot ab 3 Ausfällen in 7 Tagen.</p>
        </section>
      )}

      {eintraege.length > 0 && (
        <section className="card-pad mt-5">
          <h2 className="section-title text-base">Einträge</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {eintraege.map((eintrag) => (
              <li key={eintrag.id} className="border-t border-rule/60 pt-3">
                <div className="flex flex-wrap justify-between gap-x-6 text-xs text-muted">
                  <span>
                    <span className="font-semibold text-ink">{eintrag.quelle}</span>
                    {eintrag.detail ? ` · ${eintrag.detail}` : ""}
                  </span>
                  <span className="tnum">{wann(eintrag.created_at)}</span>
                </div>
                <p className="mt-1 break-words font-mono text-xs text-drop">{eintrag.meldung}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
