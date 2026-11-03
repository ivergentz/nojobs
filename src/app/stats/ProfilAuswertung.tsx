import type { Auswertung } from "@/lib/auswertung";

const nf = new Intl.NumberFormat("de-DE");

function Bar({ value, max }: { value: number; max: number }) {
  const width = max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-subtle">
      <span className="block h-1.5 rounded-full bg-brand/70" style={{ width: `${width}%` }} />
    </span>
  );
}

function Kachel({ zahl, text, betont }: { zahl: number; text: string; betont?: boolean }) {
  return (
    <div className="rounded-lg border border-rule bg-paper/60 p-3">
      <p className={`tnum text-2xl font-semibold leading-none ${betont ? "text-brand-strong" : ""}`}>{nf.format(zahl)}</p>
      <p className="mt-1.5 text-xs leading-snug text-muted">{text}</p>
    </div>
  );
}

/** Detail für ein Profil: Kennzahlen, Verlauf je Woche, Suchbegriffe. */
export default function ProfilAuswertung({
  name,
  auswertung: a,
  begriffe,
}: {
  name: string;
  auswertung: Auswertung;
  begriffe: Array<{ begriff: string; jobs: number }>;
}) {
  const maxWoche = Math.max(1, ...a.wochen.map((w) => w.anzahl));
  const maxBegriff = Math.max(1, ...begriffe.map((b) => b.jobs));
  return (
    <>
      <section className="card-pad mt-5">
        <h2 className="section-title">Was bei {name} angekommen ist</h2>
        <p className="section-lead">Letzte 8 Wochen, laufende Woche eingeschlossen.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kachel zahl={a.bewertet} text="Stellen bewertet" />
          <Kachel zahl={a.bewerben} text="davon „Bewerben“" betont />
          <Kachel zahl={a.anschauen} text="davon „Anschauen“" />
          <Kachel zahl={a.ignorieren} text="davon aussortiert" />
        </div>
        <h3 className="mt-6 text-sm font-semibold">Was {name} damit gemacht hat</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kachel zahl={a.gelabelt} text="Stellen eingeschätzt (gelabelt)" />
          <Kachel zahl={a.gemerkt} text="gemerkt" />
          <Kachel zahl={a.unterlagen} text="Unterlagen erstellt" />
          <Kachel zahl={a.beworben} text="als beworben markiert" betont />
        </div>
        {a.bewertet > 0 && a.gelabelt === 0 && a.gemerkt === 0 && a.beworben === 0 && (
          <p className="alert-info mt-4">Es kommen Stellen an, aber noch keine Reaktion — vielleicht kurz nachfragen, ob alles klappt.</p>
        )}
        {a.abgeschnitten && <p className="mt-3 text-xs text-muted">Sehr viele Einträge — die Zahlen sind eine Untergrenze.</p>}
      </section>

      <section className="card-pad mt-5">
        <h2 className="section-title">Bewertete Stellen pro Woche</h2>
        <div className="mt-5 space-y-3">
          {a.wochen.map((w, i) => (
            <div key={w.start} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-4">
              <span className="tnum text-sm text-muted">
                {new Date(w.start).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
              </span>
              <Bar value={w.anzahl} max={maxWoche} />
              <span className="tnum text-right text-sm">
                {nf.format(w.anzahl)}
                {i === 0 && <span className="text-muted"> *</span>}
              </span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted">* laufende Woche, noch unvollständig</p>
        </div>
      </section>

      {begriffe.length > 0 && (
        <section className="card-pad mt-5">
          <h2 className="section-title">Suchbegriffe</h2>
          <p className="section-lead">Aktive Stellen, deren Titel den Begriff enthält. Liefert ein Begriff fast nichts, lohnt ein Blick ins Suchprofil.</p>
          <div className="mt-5 space-y-3">
            {begriffe.map((b) => (
              <div key={b.begriff} className="grid grid-cols-[10rem_1fr_4rem] items-center gap-4">
                <span className="truncate text-sm">{b.begriff}</span>
                <Bar value={b.jobs} max={maxBegriff} />
                <span className="tnum text-right text-sm">{nf.format(b.jobs)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
