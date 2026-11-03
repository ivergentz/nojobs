"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { AKZENTE, LAYOUTS, type AkzentId, type LayoutId } from "@/lib/pdf/layouts/typen";

export type LayoutStand = { layout: LayoutId; akzent: AkzentId; mitFoto: boolean };

const FARBNAME: Record<AkzentId, string> = { petrol: "Petrol", bordeaux: "Bordeaux", nachtblau: "Nachtblau", wald: "Wald", graphit: "Graphit" };

/** Phase 4.2 · Layout, Akzentfarbe und Foto für Lebenslauf und Anschreiben wählen; Vorschau mit den eigenen Daten. */
export default function LayoutClient({ initial, hatFoto }: { initial: LayoutStand; hatFoto: boolean }) {
  const [wahl, setWahl] = useState<LayoutStand>(initial);
  const [gespeichert, setGespeichert] = useState<LayoutStand>(initial);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  const layout = LAYOUTS.find((l) => l.id === wahl.layout) ?? LAYOUTS[0];
  const fotoMoeglich = layout.fotoMoeglich && hatFoto;
  const geaendert = wahl.layout !== gespeichert.layout || wahl.akzent !== gespeichert.akzent || wahl.mitFoto !== gespeichert.mitFoto;
  const vorschau = (art: "cv" | "brief") =>
    `/api/layout?vorschau=${art}&layout=${wahl.layout}&akzent=${wahl.akzent}&foto=${fotoMoeglich && wahl.mitFoto ? 1 : 0}`;
  const setze = (neu: Partial<LayoutStand>) => {
    setWahl((alt) => ({ ...alt, ...neu }));
    setMeldung(null);
  };

  const speichern = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/layout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(wahl) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const neu = { ...wahl, mitFoto: wahl.mitFoto };
      setGespeichert(neu);
      setMeldung({ text: "Gespeichert. Deine Unterlagen kommen künftig in diesem Layout." });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card-pad mt-6 text-sm" aria-labelledby="layout-titel">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-strong">
          <Icon name="file" size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="layout-titel" className="section-title">
            Aussehen deiner Unterlagen
          </h2>
          <p className="section-lead">Wähle, wie Lebenslauf und Anschreiben aussehen. Die Vorschau nutzt deinen eigenen Lebenslauf.</p>

          <fieldset className="mt-4">
            <legend className="field-label">Layout</legend>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {LAYOUTS.map((l) => {
                const aktiv = l.id === wahl.layout;
                return (
                  <label
                    key={l.id}
                    className={`group cursor-pointer rounded-lg border p-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60 ${
                      aktiv ? "border-brand bg-brand-soft/40 ring-1 ring-brand" : "border-rule hover:border-ink/30"
                    }`}
                  >
                    <input type="radio" name="layout" value={l.id} checked={aktiv} onChange={() => setze({ layout: l.id })} className="sr-only" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/layouts/${l.id}.jpg`} alt="" width={150} height={212} className="aspect-[1/1.414] w-full rounded border border-rule/70 bg-white object-cover object-top" />
                    <span className="mt-2 flex items-center gap-1 font-medium">
                      {aktiv && <Icon name="check" size={14} className="text-brand" />}
                      {l.name}
                    </span>
                    <span lang="de" className="mt-0.5 block hyphens-auto break-words text-xs leading-snug text-muted">{l.passtZu}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">{layout.charakter}.</p>
          </fieldset>

          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10">
            <fieldset>
              <legend className="field-label">Akzentfarbe</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(AKZENTE) as AkzentId[]).map((id) => {
                  const aktiv = id === wahl.akzent;
                  return (
                    <label key={id} title={FARBNAME[id]} className="cursor-pointer rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60 has-[:focus-visible]:ring-offset-2">
                      <input type="radio" name="akzent" value={id} checked={aktiv} onChange={() => setze({ akzent: id })} className="sr-only" />
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-full text-white ${aktiv ? "ring-2 ring-ink ring-offset-2" : ""}`}
                        style={{ backgroundColor: AKZENTE[id] }}
                      >
                        {aktiv && <Icon name="check" size={14} />}
                        <span className="sr-only">{FARBNAME[id]}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-muted">{FARBNAME[wahl.akzent]}</p>
            </fieldset>

            <fieldset>
              <legend className="field-label">Foto</legend>
              <label className={`mt-2 flex items-center gap-2 ${fotoMoeglich ? "cursor-pointer" : "text-muted"}`}>
                <input type="checkbox" className="h-4 w-4" checked={fotoMoeglich && wahl.mitFoto} disabled={!fotoMoeglich} onChange={(e) => setze({ mitFoto: e.target.checked })} />
                Foto in Lebenslauf und Anschreiben
              </label>
              <p className="mt-1 text-xs text-muted">
                {!layout.fotoMoeglich
                  ? "Dieses Layout ist bewusst ohne Foto — so lesen Bewerbersysteme es am zuverlässigsten."
                  : !hatFoto
                    ? "Noch kein Foto hochgeladen — unter „Lebenslauf bearbeiten“."
                    : "Für Bewerbungen ins Ausland lässt man es meist weg."}
              </p>
            </fieldset>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a href={vorschau("cv")} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <Icon name="eye" size={15} /> Vorschau Lebenslauf
            </a>
            <a href={vorschau("brief")} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <Icon name="eye" size={15} /> Vorschau Anschreiben
            </a>
            <button type="button" onClick={() => void speichern()} disabled={busy || !geaendert} className={geaendert ? "btn-primary" : "btn-ghost"}>
              {busy ? "Speichert …" : geaendert ? "Auswahl speichern" : (
                <>
                  <Icon name="check" size={15} className="text-keep" /> gespeichert
                </>
              )}
            </button>
          </div>
          {meldung && (
            <p className={`mt-3 ${meldung.fehler ? "alert-error" : "alert-success"}`} role={meldung.fehler ? "alert" : "status"}>
              {meldung.text}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">Das Anschreiben in der Vorschau ist ein Platzhalter — den echten Text schreibt nojobs für jede Stelle.</p>
        </div>
      </div>
    </section>
  );
}
