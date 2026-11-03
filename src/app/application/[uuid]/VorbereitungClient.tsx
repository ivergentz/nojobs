"use client";

import { useState } from "react";
import type { Vorbereitung } from "@/lib/vorbereitung";
import Fortschritt from "@/components/Fortschritt";
import PdfKnopf from "@/components/PdfKnopf";

/**
 * Gesprächsvorbereitung auf der Unterlagen-Seite: ansehen, als PDF laden,
 * neu erzeugen. Entsteht automatisch beim Status "Beworben".
 */
export default function VorbereitungClient({ uuid, initial }: { uuid: string; initial: Vorbereitung | null }) {
  const [data, setData] = useState<Vorbereitung | null>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);

  const erzeugen = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch("/api/application/vorbereitung", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFailed(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(body as Vorbereitung);
      setOffen(true);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const wann = data?.erstellt
    ? new Date(data.erstellt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" })
    : null;

  return (
    <section id="vorbereitung" className="card-pad mt-6 scroll-mt-20">
      <h2 className="section-title">Gesprächsvorbereitung</h2>
      <p className="section-lead">
        {data
          ? `Erstellt ${wann ?? ""}${data.quellen?.length ? " mit Websuche" : ""} · höchstens zwei Seiten: Unternehmen, Rolle, dein Fit, Pitch, Beispiele, Fragen, Gehalt.`
          : "Entsteht automatisch, sobald du die Stelle auf „Beworben“ setzt — oder jetzt per Knopf (1–2 Minuten, inkl. Websuche zum Unternehmen)."}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        {data && (
          <PdfKnopf href={`/api/application/vorbereitung?uuid=${encodeURIComponent(uuid)}`} className="btn-secondary">
            PDF herunterladen
          </PdfKnopf>
        )}
        {data && (
          <button type="button" onClick={() => setOffen((v) => !v)} aria-expanded={offen} className="btn-ghost">
            {offen ? "Einklappen" : "Hier ansehen"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void erzeugen()}
          disabled={busy}
          className={data ? "btn-ghost" : "btn-primary"}
        >
          {busy ? "Recherchiert und schreibt …" : data ? "Neu erzeugen" : "Jetzt erzeugen"}
        </button>
      </div>

      <Fortschritt
        aktiv={busy}
        dauer={90}
        schritte={[
          { ab: 0, text: "Websuche zum Unternehmen …" },
          { ab: 35, text: "Quellen werden ausgewertet …" },
          { ab: 50, text: "Briefing wird geschrieben …" },
          { ab: 110, text: "Fast fertig …" },
        ]}
        hinweis="Seite bitte offen lassen — inklusive Websuche dauert das 1–2 Minuten."
      />

      {failed && <p className="mt-3 text-sm text-drop">Fehler: {failed}</p>}

      {data && offen && (
        <div className="mt-6 grid gap-4 text-sm leading-relaxed">
          <Block titel="Unternehmen">
            <p>{data.unternehmen.kurz}</p>
            <Liste punkte={data.unternehmen.fakten} />
            {data.quellen && data.quellen.length > 0 ? (
              <p className="mt-2 text-xs text-muted">
                Quellen:{" "}
                {data.quellen.map((q, i) => (
                  <span key={q.url}>
                    {i > 0 ? " · " : ""}
                    <a href={q.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                      {q.title}
                    </a>
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted">Ohne Websuche erstellt — Unternehmensangaben bitte prüfen.</p>
            )}
          </Block>
          <Block titel="Die Rolle">
            <p className="font-medium">{data.rolle.kern}</p>
            <Liste punkte={data.rolle.aufgaben} />
            <p className="mt-2 text-xs font-semibold text-muted">Worauf es wirklich ankommt</p>
            <Liste punkte={data.rolle.worauf_es_ankommt} />
          </Block>
          <Block titel="Dein Fit">
            <ul className="space-y-1">
              {data.fit.staerken.map((st, i) => (
                <li key={i}>
                  <span className="font-semibold text-keep">+ {st.punkt}</span> <span className="text-ink/80">— {st.beleg}</span>
                </li>
              ))}
              {data.fit.luecken.map((l, i) => (
                <li key={`l${i}`}>
                  <span className="font-semibold text-drop">− {l.punkt}</span> <span className="text-ink/80">— {l.antwort}</span>
                </li>
              ))}
            </ul>
          </Block>
          <Block titel="Pitch (60 Sekunden)">
            <p>{data.pitch}</p>
          </Block>
          <Block titel="Deine Beispiele">
            <ul className="space-y-2">
              {data.beispiele.map((b, i) => (
                <li key={i}>
                  <span className="font-semibold">{b.titel}:</span> {b.situation} {b.vorgehen}{" "}
                  <span className="text-keep">{b.ergebnis}</span>
                </li>
              ))}
            </ul>
          </Block>
          <Block titel="Fragen an dich">
            <ul className="space-y-2">
              {data.fragen_an_dich.map((f, i) => (
                <li key={i}>
                  <span className="font-semibold">{f.frage}</span>
                  <br />
                  <span className="text-muted">{f.antwortskizze}</span>
                </li>
              ))}
            </ul>
          </Block>
          <Block titel="Deine Fragen">
            <Liste punkte={data.fragen_an_sie} />
          </Block>
          <Block titel="Gehalt">
            <p>{data.gehalt}</p>
          </Block>
        </div>
      )}
    </section>
  );
}

function Block({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rule bg-paper/60 p-4">
      <h3 className="eyebrow text-brand">{titel}</h3>
      <div className="mt-2 text-ink/90">{children}</div>
    </div>
  );
}

function Liste({ punkte }: { punkte: string[] }) {
  return (
    <ul className="mt-1 list-disc space-y-0.5 pl-5">
      {punkte.map((p, i) => (
        <li key={i}>{p}</li>
      ))}
    </ul>
  );
}
