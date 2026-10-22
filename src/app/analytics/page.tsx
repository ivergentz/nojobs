import { supabaseAdmin } from "@/lib/supabase";
import { dauerText, TRACKING_DOMAIN, type Besuch } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Analytics: Wer hat deine Bewerbung geöffnet?
 *
 * Grundlage sind die persönlichen Links (iverbohnes.de/<kürzel>) in Lebenslauf
 * und Anschreiben. Bots und Link-Prüfer werden mitgezählt, aber getrennt
 * gezeigt — sie zählen nicht als "geöffnet".
 */

type Bewerbung = {
  uuid: string;
  ref: string;
  ref_at: string | null;
  title: string | null;
  employer_name: string | null;
  app_status: string | null;
  app_status_at: string | null;
};

const STATUS_TEXT: Record<string, string> = {
  neu: "Entwurf",
  interessant: "Vorgemerkt",
  beworben: "Beworben",
  interview: "Interview",
  absage: "Absage",
  abgelegt: "Abgelegt",
};

const SEITE_TEXT: Record<string, string> = { start: "Start", cv: "Lebenslauf" };

function zeit(value: string) {
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
}

function tag(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" })
    : "—";
}

function spanne(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} Tage`;
}

export default async function AnalyticsPage() {
  const db = supabaseAdmin();
  const seit90 = new Date(Date.now() - 90 * 864e5).toISOString();

  const [jobsQuery, besucheQuery] = await Promise.all([
    db
      .from("jobs")
      .select("uuid,ref,ref_at,title,employer_name,app_status,app_status_at")
      .not("ref", "is", null)
      .order("ref_at", { ascending: false, nullsFirst: false })
      .limit(300),
    db.from("besuche").select("*").gte("created_at", seit90).order("created_at", { ascending: false }).limit(2000),
  ]);

  const fehler = jobsQuery.error ?? besucheQuery.error;
  const bewerbungen = (jobsQuery.data ?? []) as Bewerbung[];
  const alle = (besucheQuery.data ?? []) as Besuch[];
  const echte = alle.filter((b) => !b.bot);
  const jobNach = new Map(bewerbungen.map((b) => [b.uuid, b]));

  // Je Bewerbung zusammenfassen
  const jeJob = new Map<string, { anzahl: number; zuletzt: string; erster: string; seiten: Set<string>; sekunden: number }>();
  for (const b of echte) {
    if (!b.job_uuid) continue;
    const e = jeJob.get(b.job_uuid) ?? { anzahl: 0, zuletzt: b.created_at, erster: b.created_at, seiten: new Set(), sekunden: 0 };
    e.anzahl += 1;
    if (b.created_at > e.zuletzt) e.zuletzt = b.created_at;
    if (b.created_at < e.erster) e.erster = b.created_at;
    (b.seiten ?? []).forEach((s) => e.seiten.add(s));
    e.sekunden += b.sekunden ?? 0;
    jeJob.set(b.job_uuid, e);
  }

  // Kennzahlen: nur echte Bewerbungen (Status beworben oder weiter)
  const verschickt = bewerbungen.filter((b) => ["beworben", "interview", "absage"].includes(b.app_status ?? ""));
  const geoeffnet = verschickt.filter((b) => jeJob.has(b.uuid));
  const quote = verschickt.length ? Math.round((geoeffnet.length / verschickt.length) * 100) : null;
  const seit30 = Date.now() - 30 * 864e5;
  const besuche30 = echte.filter((b) => new Date(b.created_at).getTime() >= seit30).length;
  const wartezeiten = geoeffnet
    .map((b) => {
      const start = b.ref_at ?? b.app_status_at;
      const erster = jeJob.get(b.uuid)?.erster;
      return start && erster ? new Date(erster).getTime() - new Date(start).getTime() : null;
    })
    .filter((v): v is number => v !== null && v > 0)
    .sort((a, b) => a - b);
  const median = wartezeiten.length ? wartezeiten[Math.floor(wartezeiten.length / 2)] : null;

  // Tabelle: zuerst geöffnete (neueste oben), dann ungeöffnete
  const zeilen = [...bewerbungen].sort((a, b) => {
    const za = jeJob.get(a.uuid)?.zuletzt ?? "";
    const zb = jeJob.get(b.uuid)?.zuletzt ?? "";
    if (za !== zb) return zb.localeCompare(za);
    return (b.ref_at ?? "").localeCompare(a.ref_at ?? "");
  });

  const kennzahlen: Array<{ label: string; wert: string; hinweis?: string }> = [
    { label: "Bewerbungen mit Link", wert: String(verschickt.length), hinweis: "Status Beworben oder weiter" },
    {
      label: "davon geöffnet",
      wert: quote === null ? "—" : `${geoeffnet.length} · ${quote} %`,
    },
    { label: "Besuche, 30 Tage", wert: String(besuche30) },
    { label: "Zeit bis zum 1. Aufruf", wert: median === null ? "—" : spanne(median), hinweis: "Median, ab Entwurf" },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-rule pb-6">
        <p className="text-sm text-muted">Career Inbox · Analytics</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Wer hat deine Bewerbung geöffnet?</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Jede Bewerbung enthält einen eigenen Link ({TRACKING_DOMAIN}/firma). Gezählt wird, wenn jemand
          ihn öffnet. „Nicht geöffnet“ heißt nicht „nicht gelesen“ — wer nur das PDF liest, taucht hier nicht auf.
        </p>
      </header>

      {fehler && (
        <p className="mt-8 text-sm text-drop">
          Daten nicht lesbar: {fehler.message}. Wurde supabase/besuche.sql im Supabase SQL Editor ausgeführt?
        </p>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        {kennzahlen.map((k) => (
          <div key={k.label} className="border-t-2 border-ink pt-2">
            <dt className="text-xs text-muted">{k.label}</dt>
            <dd className="tnum mt-1 text-2xl font-semibold tracking-tight">{k.wert}</dd>
            {k.hinweis && <dd className="mt-0.5 text-xs text-muted">{k.hinweis}</dd>}
          </div>
        ))}
      </dl>

      <section className="mt-12">
        <h2 className="text-sm font-semibold">Bewerbungen</h2>
        {zeilen.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Noch keine Links vergeben. Ein Link entsteht, sobald du auf der Unterlagen-Seite einen Entwurf
            erzeugst.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-rule">
                  <th className="py-2 pr-4 font-normal">Firma · Stelle</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  <th className="py-2 pr-4 text-right font-normal">Aufrufe</th>
                  <th className="py-2 pr-4 font-normal">Zuletzt</th>
                  <th className="py-2 font-normal">Angesehen</th>
                </tr>
              </thead>
              <tbody>
                {zeilen.map((b) => {
                  const e = jeJob.get(b.uuid);
                  return (
                    <tr key={b.uuid} className="border-b border-rule/60 align-top">
                      <td className="py-2.5 pr-4">
                        <a href={`/application/${encodeURIComponent(b.uuid)}`} className="font-medium hover:underline">
                          {b.employer_name ?? "—"}
                        </a>
                        <div className="text-xs text-muted">{b.title}</div>
                        <div className="font-mono text-xs text-muted">/{b.ref}</div>
                      </td>
                      <td className="py-2.5 pr-4 text-muted">
                        {STATUS_TEXT[b.app_status ?? ""] ?? b.app_status}
                        <div className="text-xs">{tag(b.app_status_at)}</div>
                      </td>
                      <td className={`tnum py-2.5 pr-4 text-right ${e ? "font-semibold text-keep" : "text-muted"}`}>
                        {e ? e.anzahl : "0"}
                      </td>
                      <td className="tnum py-2.5 pr-4 text-muted">{e ? tag(e.zuletzt) : "—"}</td>
                      <td className="py-2.5 text-xs text-muted">
                        {e
                          ? [
                              Array.from(e.seiten)
                                .map((s) => SEITE_TEXT[s] ?? s)
                                .join(", "),
                              dauerText(e.sekunden),
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-sm font-semibold">Letzte Besuche</h2>
        {alle.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Noch keine.</p>
        ) : (
          <ul className="mt-4 text-sm">
            {alle.slice(0, 40).map((b) => {
              const job = b.job_uuid ? jobNach.get(b.job_uuid) : undefined;
              return (
                <li
                  key={b.sitzung}
                  className={`flex flex-wrap justify-between gap-x-6 border-t border-rule/60 py-1.5 ${b.bot ? "text-muted/70" : ""}`}
                >
                  <span>
                    {job?.employer_name ?? b.ref}
                    <span className="text-muted">
                      {" "}
                      · {(b.seiten ?? []).map((s) => SEITE_TEXT[s] ?? s).join(", ")}
                      {dauerText(b.sekunden) ? ` · ${dauerText(b.sekunden)}` : ""}
                    </span>
                    {b.bot && <span className="ml-2 text-xs">automatisch (Link-Prüfer)</span>}
                  </span>
                  <span className="tnum text-xs text-muted">
                    {zeit(b.created_at)} · {b.geraet ?? "?"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
