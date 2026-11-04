"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PflegeStand } from "@/lib/suchpflege-laden";
import type { Vorschlag } from "@/lib/suchpflege";

const nf = new Intl.NumberFormat("de-DE");
const ART_NAME: Record<string, string> = { ba: "Arbeitsagentur", google: "Google Jobs", profil: "Suchbegriff", info: "ohne Begriff" };
const key = (v: Pick<Vorschlag, "art" | "aktion" | "begriff">) => `${v.art}:${v.aktion}:${v.begriff}`;
const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null);

function Profil({ s }: { s: PflegeStand }) {
  const router = useRouter();
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(s.vorschlaege.map(key)));
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  const senden = async (body: Record<string, unknown>) => {
    setBusy(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/suchpflege", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: s.slug, ...body }) });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.error ?? `HTTP ${res.status}`);
      setMeldung({ text: b.zurueckgesetzt ? "Zurückgesetzt — es gelten wieder die Listen aus dem Code." : `Gespeichert${b.angenommen ? ` · ${b.angenommen} Änderung(en) übernommen` : ""}. Gilt ab dem nächsten Nachtlauf.${b.hinweise?.length ? ` Hinweis: ${b.hinweise.join(" ")}` : ""}` });
      router.refresh();
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };
  const entscheiden = (alleAblehnen = false) => {
    const annehmen = alleAblehnen ? [] : s.vorschlaege.filter((v) => gewaehlt.has(key(v)));
    const ablehnen = s.vorschlaege.filter((v) => alleAblehnen || !gewaehlt.has(key(v)));
    void senden({ annehmen, ablehnen });
  };
  const zeigeVorschlag = s.vorschlaege.length > 0;
  const mit = s.leistung.filter((l) => l.art !== "info");
  const info = s.leistung.filter((l) => l.art === "info");

  return (
    <div className="mt-4 rounded-lg border border-rule p-3" data-profil={s.slug}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{s.name}</h3>
        <span className="text-xs text-muted">
          {s.entschiedenAm ? `zuletzt geprüft am ${datum(s.entschiedenAm)}` : "noch nie geprüft"}
          {s.faellig && zeigeVorschlag && <span className="ml-2 rounded bg-warn/15 px-1.5 py-0.5 font-medium text-warn">Vorschlag fällig</span>}
        </span>
      </div>
      {s.fehler && <p className="mt-2 text-drop">Nicht lesbar: {s.fehler}</p>}

      {zeigeVorschlag ? (
        <div className="mt-3">
          <p className="text-xs text-muted">Haken = übernehmen, ohne Haken = ablehnen (wird 90 Tage nicht erneut vorgeschlagen).</p>
          <ul className="mt-2 space-y-1.5">
            {s.vorschlaege.map((v) => (
              <li key={key(v)}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={gewaehlt.has(key(v))}
                    onChange={(e) => setGewaehlt((alt) => { const n = new Set(alt); if (e.target.checked) n.add(key(v)); else n.delete(key(v)); return n; })}
                  />
                  <span>
                    <span className={`font-medium ${v.aktion === "aus" ? "text-drop" : "text-keep"}`}>{v.aktion === "aus" ? "Abstellen" : "Hinzufügen"}:</span>{" "}
                    „{v.begriff}“ <span className="text-xs text-muted">· {ART_NAME[v.art]} · {v.grund}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => entscheiden(false)}>
              Auswahl bestätigen
            </button>
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => entscheiden(true)}>
              Alle ablehnen
            </button>
          </div>
        </div>
      ) : (
        !s.fehler && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="text-muted">Kein Änderungsvorschlag — die Suche passt so.</p>
            {s.faellig && (
              <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void senden({ annehmen: [], ablehnen: [] })}>
                Als geprüft markieren
              </button>
            )}
          </div>
        )
      )}
      {s.rolle === "admin" && s.eigeneAenderungen > 0 && (
        <p className="mt-2 text-xs text-muted">
          {s.eigeneAenderungen} bestätigte Änderung(en) gegenüber der Liste im Code.{" "}
          <button type="button" className="underline" disabled={busy} onClick={() => window.confirm("Alle bestätigten Änderungen deiner Suche verwerfen?") && void senden({ zuruecksetzen: true })}>
            Zurücksetzen
          </button>
        </p>
      )}
      {meldung && <p className={`mt-2 text-sm ${meldung.fehler ? "text-drop" : "text-keep"}`} role={meldung.fehler ? "alert" : "status"}>{meldung.text}</p>}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-medium text-brand-strong">Leistung der Suchbegriffe · letzte 60 Tage · {nf.format(s.zeilen)} Stellen</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 pr-2 font-medium">Begriff</th>
                <th className="py-1 pr-2 font-medium">Quelle</th>
                <th className="py-1 pr-2 text-right font-medium">Stellen</th>
                <th className="py-1 pr-2 text-right font-medium">bewertet</th>
                <th className="py-1 pr-2 text-right font-medium">Bewerben</th>
                <th className="py-1 pr-2 text-right font-medium">Anschauen</th>
                <th className="py-1 pr-2 text-right font-medium">gemerkt/beworben</th>
                <th className="py-1 text-right font-medium">Trefferquote</th>
              </tr>
            </thead>
            <tbody>
              {[...mit, ...info].map((l) => (
                <tr key={`${l.art}:${l.begriff}`} className={`border-t border-rule/60 ${l.art === "info" ? "text-muted" : ""}`}>
                  <td className="py-1 pr-2">{l.begriff}</td>
                  <td className="py-1 pr-2">{ART_NAME[l.art]}</td>
                  <td className="tnum py-1 pr-2 text-right">{nf.format(l.stellen)}</td>
                  <td className="tnum py-1 pr-2 text-right">{nf.format(l.bewertet)}</td>
                  <td className="tnum py-1 pr-2 text-right font-medium">{nf.format(l.bewerben)}</td>
                  <td className="tnum py-1 pr-2 text-right">{nf.format(l.anschauen)}</td>
                  <td className="tnum py-1 pr-2 text-right">{nf.format(l.gemerkt)}</td>
                  <td className="tnum py-1 text-right">{l.bewertet ? `${Math.round(((l.bewerben + l.anschauen) / l.bewertet) * 100)} %` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.rolle === "admin" && <p className="mt-1 text-[11px] text-muted">Google-Begriffe werden erst seit dieser Version mitgespeichert — ältere Google-Stellen stehen unter „Google (vor der Aufzeichnung)“.</p>}
        </div>
      </details>
    </div>
  );
}

export default function SuchpflegeClient({ staende, fehler }: { staende: PflegeStand[]; fehler: string | null }) {
  const offen = staende.filter((s) => s.faellig && s.vorschlaege.length > 0);
  return (
    <section className="card-pad mt-5 text-sm" id="suchpflege">
      <h2 className="font-semibold">Suchpflege</h2>
      <p className="mt-1 text-xs text-muted">
        Welche Suchbegriffe bringen Stellen, die „Bewerben“ oder „Anschauen“ werden? Einmal im Monat schlägt nojobs vor, Begriffe
        abzustellen oder hinzuzufügen. Geändert wird nur, was du bestätigst — gültig ab dem nächsten Nachtlauf.
      </p>
      {offen.length > 0 && (
        <p className="alert-info mt-3">
          <span className="font-medium">Monatlicher Vorschlag liegt bereit</span> für {offen.map((s) => s.name).join(", ")}.
        </p>
      )}
      {fehler && <p className="mt-3 text-drop">Suchpflege nicht lesbar: {fehler}</p>}
      {staende.map((s) => (
        <Profil key={s.slug} s={s} />
      ))}
    </section>
  );
}
