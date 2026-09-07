import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type WeeklyRow = { week_start: string; candidates: number };
type OccupationRow = { occupation_level1: string | null; jobs: number };
type ReasonRow = { drop_reason: string; drops: number };
type SampleRow = { title: string | null; employer_name: string | null; drop_reason: string };
type CursorRow = {
  pages_done: number;
  items_seen: number;
  at_end: boolean;
  last_run_at: string | null;
  last_note: string | null;
  last_item_date: string | null;
};

const nf = new Intl.NumberFormat("de-DE");

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1 bg-rule/60">
      <span className="block h-1 bg-ink/70" style={{ width: `${width}%` }} />
    </span>
  );
}

export default async function StatsPage() {
  const db = supabaseAdmin();

  const [cursor, weekly, occupations, reasons, samples, totals] = await Promise.all([
    db.from("import_cursor").select("*").eq("id", "nav").maybeSingle(),
    db.from("v_weekly_candidates").select("*").order("week_start", { ascending: false }).limit(8),
    db.from("v_occupation_distribution").select("*").order("jobs", { ascending: false }).limit(25),
    db.from("v_drop_reasons").select("*").order("drops", { ascending: false }).limit(15),
    db.from("v_drop_samples").select("*").limit(40),
    db.from("jobs").select("uuid", { count: "exact", head: true }).eq("status", "ACTIVE"),
  ]);

  const cursorRow = (cursor.data ?? null) as CursorRow | null;
  const weeklyRows = (weekly.data ?? []) as WeeklyRow[];
  const occupationRows = (occupations.data ?? []) as OccupationRow[];
  const reasonRows = (reasons.data ?? []) as ReasonRow[];
  const sampleRows = (samples.data ?? []) as SampleRow[];
  const activeJobs = totals.count ?? 0;

  const completedWeeks = weeklyRows.slice(1);
  const average =
    completedWeeks.length > 0
      ? Math.round(
          completedWeeks.reduce((sum, row) => sum + Number(row.candidates), 0) /
            completedWeeks.length
        )
      : null;

  const maxWeek = Math.max(1, ...weeklyRows.map((row) => Number(row.candidates)));
  const occupationTotal = occupationRows.reduce((sum, row) => sum + Number(row.jobs), 0);
  const withoutCategory = occupationRows.find((row) => !row.occupation_level1);
  const categoryCoverage =
    occupationTotal > 0
      ? Math.round(((occupationTotal - Number(withoutCategory?.jobs ?? 0)) / occupationTotal) * 100)
      : 0;
  const maxReason = Math.max(1, ...reasonRows.map((row) => Number(row.drops)));

  const running = cursorRow && !cursorRow.at_end;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="border-b border-rule pb-10">
        <p className="text-sm text-muted">Career Inbox · Validierungslauf</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Wie viel bleibt vom norwegischen Stellenmarkt übrig?
        </h1>
      </header>

      {/* Die eine Zahl, wegen der diese Seite existiert. */}
      <section className="border-b border-rule py-12">
        <div className="flex items-baseline gap-4">
          <span className="tnum text-7xl font-semibold leading-none">
            {average === null ? "—" : nf.format(average)}
          </span>
          <span className="max-w-[16rem] text-sm leading-snug text-muted">
            Kandidaten pro abgeschlossener Woche, nach beiden Filterstufen
          </span>
        </div>

        {average !== null && (
          <p className="mt-6 max-w-xl text-sm leading-relaxed">
            {average >= 15
              ? "Über der Schwelle von 15. Eine tägliche Inbox trägt sich, Sprint 1 kann so gebaut werden."
              : average >= 5
                ? "Unter 15. Für eine tägliche Inbox zu dünn — plane einen Montagsdigest, oder hol Quelle 2 nach vorn."
                : "Zu wenig für ein eigenes Produkt aus dieser Quelle allein. Prüfe erst das Drop-Log unten, bevor du den Markt dafür verantwortlich machst."}
          </p>
        )}

        <div className="mt-10 space-y-3">
          {weeklyRows.length === 0 && (
            <p className="text-sm text-muted">
              Noch keine Daten. Starte den Import über <code>/api/import?secret=…</code>.
            </p>
          )}
          {weeklyRows.map((row, index) => (
            <div key={row.week_start} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-4">
              <span className="tnum text-sm text-muted">
                {new Date(row.week_start).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </span>
              <Bar value={Number(row.candidates)} max={maxWeek} />
              <span className="tnum text-right text-sm">
                {nf.format(Number(row.candidates))}
                {index === 0 && <span className="text-muted"> *</span>}
              </span>
            </div>
          ))}
          {weeklyRows.length > 0 && (
            <p className="pt-2 text-xs text-muted">* laufende Woche, noch unvollständig</p>
          )}
        </div>
      </section>

      {/* Frage 2: taugt das Berufscode-Feld als Filtergrundlage? */}
      <section className="border-b border-rule py-12">
        <h2 className="text-lg font-semibold tracking-tight">Berufskategorien</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          {categoryCoverage}&nbsp;% der gespeicherten Anzeigen haben eine Kategorie. Unter etwa
          80&nbsp;% trägt das Feld keinen Ausschlussfilter — dann bleibt es beim Titelfilter plus
          LLM. Trage passende Werte in <code>OCCUPATION_EXCLUDE</code> ein, exakt so geschrieben wie
          hier.
        </p>

        <table className="mt-8 w-full text-sm">
          <tbody>
            {occupationRows.map((row) => (
              <tr key={row.occupation_level1 ?? "leer"} className="border-t border-rule/60">
                <td className="py-2 pr-4">
                  {row.occupation_level1 ?? <span className="text-muted">ohne Kategorie</span>}
                </td>
                <td className="tnum w-20 py-2 text-right">{nf.format(Number(row.jobs))}</td>
              </tr>
            ))}
            {occupationRows.length === 0 && (
              <tr>
                <td className="py-2 text-muted">Noch keine Anzeigen gespeichert.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Der Teil, den man sonst nie sieht. */}
      <section className="border-b border-rule py-12">
        <h2 className="text-lg font-semibold tracking-tight">Was der Filter aussortiert hat</h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Der gefährliche Fehler ist nicht ein falscher Treffer, sondern eine passende Stelle, die
          hier landet und nie in der Inbox auftaucht. Die Stichprobe unten ist zum Gegenlesen da.
        </p>

        <div className="mt-8 space-y-3">
          {reasonRows.map((row) => (
            <div key={row.drop_reason} className="grid grid-cols-[12rem_1fr_5rem] items-center gap-4">
              <span className="truncate text-sm text-drop">{row.drop_reason}</span>
              <Bar value={Number(row.drops)} max={maxReason} />
              <span className="tnum text-right text-sm">{nf.format(Number(row.drops))}</span>
            </div>
          ))}
        </div>

        {sampleRows.length > 0 && (
          <>
            <h3 className="mt-10 text-sm font-semibold">Stichprobe verworfener Titel</h3>
            <ul className="mt-4 space-y-1.5 text-sm">
              {sampleRows.map((row, index) => (
                <li key={index} className="flex justify-between gap-6 border-t border-rule/60 py-1.5">
                  <span className="truncate">{row.title ?? "ohne Titel"}</span>
                  <span className="shrink-0 text-muted">{row.employer_name ?? "—"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="py-12 text-sm">
        <h2 className="text-lg font-semibold tracking-tight">Importlauf</h2>
        <dl className="mt-6 space-y-2">
          <div className="flex justify-between border-t border-rule/60 py-2">
            <dt className="text-muted">Aktive Stellen gespeichert</dt>
            <dd className="tnum">{nf.format(activeJobs)}</dd>
          </div>
          <div className="flex justify-between border-t border-rule/60 py-2">
            <dt className="text-muted">Feed-Einträge gelesen</dt>
            <dd className="tnum">{nf.format(cursorRow?.items_seen ?? 0)}</dd>
          </div>
          <div className="flex justify-between border-t border-rule/60 py-2">
            <dt className="text-muted">Seiten verarbeitet</dt>
            <dd className="tnum">{nf.format(cursorRow?.pages_done ?? 0)}</dd>
          </div>
          <div className="flex justify-between border-t border-rule/60 py-2">
            <dt className="text-muted">Feed steht bei</dt>
            <dd className="tnum">{formatDate(cursorRow?.last_item_date ?? null)}</dd>
          </div>
          <div className="flex justify-between border-t border-rule/60 py-2">
            <dt className="text-muted">Letzter Lauf</dt>
            <dd className="tnum">{formatDate(cursorRow?.last_run_at ?? null)}</dd>
          </div>
          <div className="flex justify-between border-t border-rule/60 py-2">
            <dt className="text-muted">Status</dt>
            <dd className={running ? "text-drop" : "text-keep"}>
              {cursorRow ? (running ? "Backfill läuft noch" : "Feed vollständig gelesen") : "nicht gestartet"}
            </dd>
          </div>
        </dl>

        {running && (
          <p className="mt-6 max-w-xl leading-relaxed text-muted">
            Ruf <code>/api/import?secret=…</code> erneut auf. Jeder Aufruf verarbeitet rund 45
            Sekunden und macht dort weiter, wo der letzte aufgehört hat. Liegt „Feed steht bei"
            weit in der Vergangenheit, hat der Einstiegspunkt nicht gegriffen — dann mit{" "}
            <code>&amp;reset=purge</code> neu starten.
          </p>
        )}

        {cursorRow?.last_note && (
          <p className="mt-4 max-w-xl leading-relaxed text-muted">{cursorRow.last_note}</p>
        )}
      </section>
    </main>
  );
}
