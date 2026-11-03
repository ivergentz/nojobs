"use client";

import { useState } from "react";
import Fortschritt from "@/components/Fortschritt";
import PdfKnopf from "@/components/PdfKnopf";
import Icon from "@/components/ui/Icon";
import { LAYOUTS, type LayoutId } from "@/lib/pdf/layouts/typen";
import type { ProfilEntwurf } from "@/lib/unterlagen-entwurf";

const SCHRITTE = [
  { ab: 0, text: "Anzeige und Lebenslauf werden gelesen …" },
  { ab: 8, text: "Anschreiben wird geschrieben …" },
  { ab: 25, text: "Lebenslauf wird auf die Stelle zugeschnitten …" },
  { ab: 40, text: "Fast fertig …" },
];
const layoutName = (id: string | null | undefined) => LAYOUTS.find((l) => l.id === id)?.name ?? id ?? "";

/**
 * Phase 4.3 · Unterlagen für weitere Profile: entwerfen lassen, bearbeiten, als PDF laden.
 * Grundlage ist der eigene Lebenslauf aus „Mein Profil“, im dort gewählten Layout —
 * für diese Stelle lässt sich ein anderes wählen (Vorschlag von nojobs).
 */
export default function ProfilUnterlagenClient({
  uuid,
  initial,
  standardLayout,
  stationen,
}: {
  uuid: string;
  initial: ProfilEntwurf | null;
  standardLayout: LayoutId;
  stationen: Array<{ titel: string; arbeitgeber: string; stichpunkte: string[] }>;
}) {
  const [e, setE] = useState<ProfilEntwurf | null>(initial);
  const [busy, setBusy] = useState<"erstellen" | "speichern" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  const api = async (aktion: "erstellen" | "speichern", entwurf?: ProfilEntwurf) => {
    setBusy(aktion);
    setMeldung(null);
    try {
      const res = await fetch("/api/unterlagen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uuid, aktion, entwurf }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setE(body.entwurf);
      setDirty(false);
      setMeldung({ text: aktion === "erstellen" ? "Entwurf erstellt — bitte lesen und bei Bedarf anpassen." : "Gespeichert. Die PDFs nutzen diese Fassung." });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(null);
    }
  };
  const setze = (neu: Partial<ProfilEntwurf>) => {
    setE((alt) => (alt ? { ...alt, ...neu } : alt));
    setDirty(true);
    setMeldung(null);
  };
  const setzeCv = (neu: Partial<ProfilEntwurf["cv"]>) => e && setze({ cv: { ...e.cv, ...neu } });

  const aktivesLayout = e?.layout ?? standardLayout;
  const pdf = (doc: "cv" | "brief") => `/api/unterlagen?uuid=${encodeURIComponent(uuid)}&doc=${doc}`;

  if (!e) {
    return (
      <section className="card-pad mt-6 text-sm">
        <h2 className="section-title">Anschreiben und Lebenslauf</h2>
        <p className="section-lead">
          nojobs schreibt ein Anschreiben passend zu dieser Anzeige und schärft deinen Lebenslauf darauf zu — nur aus dem, was in deinem Lebenslauf
          steht. Danach kannst du alles bearbeiten und als PDF laden.
        </p>
        <button type="button" className="btn-primary mt-4" disabled={busy !== null} onClick={() => void api("erstellen")}>
          <Icon name="sparkles" size={15} /> Unterlagen erstellen
        </button>
        <Fortschritt aktiv={busy === "erstellen"} dauer={45} schritte={SCHRITTE} hinweis="Seite bitte offen lassen — das dauert etwa eine halbe Minute." />
        {meldung && <p className={`mt-3 ${meldung.fehler ? "alert-error" : "alert-success"}`}>{meldung.text}</p>}
      </section>
    );
  }

  return (
    <div className="mt-6 space-y-6 text-sm">
      <section className="card-pad">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="section-title">Deine Unterlagen</h2>
            <p className="section-lead">
              Layout: <span className="font-medium text-ink">{layoutName(aktivesLayout)}</span>
              {e.layout ? " (für diese Stelle gewählt)" : " (aus Mein Profil)"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PdfKnopf href={pdf("brief")} className="btn-primary" gesperrt={dirty}>
              Anschreiben (PDF)
            </PdfKnopf>
            <PdfKnopf href={pdf("cv")} className="btn-secondary" gesperrt={dirty}>
              Lebenslauf (PDF)
            </PdfKnopf>
          </div>
        </div>
        {dirty && <p className="mt-2 text-xs text-warn">Erst speichern — die PDFs entstehen aus der gespeicherten Fassung.</p>}

        {e.layoutVorschlag && e.layoutVorschlag.id !== aktivesLayout && (
          <div className="alert-info mt-4 flex flex-wrap items-center justify-between gap-3">
            <span>
              <span className="font-medium">Vorschlag für diese Stelle: {layoutName(e.layoutVorschlag.id)}.</span> {e.layoutVorschlag.grund}
            </span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setze({ layout: e.layoutVorschlag!.id })}>
              Für diese Stelle verwenden
            </button>
          </div>
        )}
        <label className="mt-4 flex flex-wrap items-center gap-2">
          <span className="field-label mb-0">Layout für diese Stelle</span>
          <select className="field mt-0 w-auto" value={e.layout ?? ""} onChange={(ev) => setze({ layout: (ev.target.value || null) as LayoutId | null })}>
            <option value="">wie in Mein Profil ({layoutName(standardLayout)})</option>
            {LAYOUTS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        {e.hinweise.length > 0 && (
          <div className="mt-4 rounded-lg border border-rule bg-paper/60 p-3">
            <p className="font-medium">Hinweise von nojobs</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
              {e.hinweise.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card-pad space-y-4">
        <h2 className="section-title">Anschreiben</h2>
        <label className="block">
          <span className="field-label">Empfänger</span>
          <span className="field-hint">Eine Zeile pro Zeile der Anschrift.</span>
          <textarea className="field min-h-20" value={e.empfaenger.join("\n")} onChange={(ev) => setze({ empfaenger: ev.target.value.split("\n") })} />
        </label>
        <label className="block">
          <span className="field-label">Betreff</span>
          <input className="field" value={e.betreff} onChange={(ev) => setze({ betreff: ev.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Anrede</span>
          <input className="field" value={e.anrede} onChange={(ev) => setze({ anrede: ev.target.value })} />
        </label>
        {e.absaetze.map((a, i) => (
          <label key={i} className="block">
            <span className="field-label">Absatz {i + 1}</span>
            <textarea className="field min-h-28 leading-relaxed" value={a} onChange={(ev) => setze({ absaetze: e.absaetze.map((x, j) => (j === i ? ev.target.value : x)) })} />
          </label>
        ))}
        <label className="block">
          <span className="field-label">Schluss</span>
          <textarea className="field min-h-16" value={e.schluss} onChange={(ev) => setze({ schluss: ev.target.value })} />
        </label>
      </section>

      <section className="card-pad space-y-4">
        <h2 className="section-title">Lebenslauf für diese Stelle</h2>
        <p className="section-lead">Nur diese Teile werden für die Stelle angepasst. Alles andere kommt aus „Lebenslauf bearbeiten“.</p>
        <label className="block">
          <span className="field-label">Zeile unter dem Namen</span>
          <input className="field" value={e.cv.titel} onChange={(ev) => setzeCv({ titel: ev.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Kurzprofil</span>
          <textarea className="field min-h-24 leading-relaxed" value={e.cv.kurzprofil} onChange={(ev) => setzeCv({ kurzprofil: ev.target.value })} />
        </label>
        {e.cv.stichpunkte.map((s, i) => (
          <label key={s.station} className="block">
            <span className="field-label">
              Stichpunkte: {stationen[s.station]?.titel ?? `Station ${s.station + 1}`}
              {stationen[s.station]?.arbeitgeber ? ` · ${stationen[s.station].arbeitgeber}` : ""}
            </span>
            <span className="field-hint">Für diese Stelle geschärft. Ein Stichpunkt pro Zeile.</span>
            <textarea
              className="field min-h-20 leading-relaxed"
              value={s.stichpunkte.join("\n")}
              onChange={(ev) => setzeCv({ stichpunkte: e.cv.stichpunkte.map((x, j) => (j === i ? { ...x, stichpunkte: ev.target.value.split("\n") } : x)) })}
            />
          </label>
        ))}
      </section>

      <div className="card z-10 flex flex-wrap items-center gap-3 p-3 sm:sticky sm:bottom-3 sm:shadow-raised">
        <button type="button" className={dirty ? "btn-primary" : "btn-secondary"} disabled={!dirty || busy !== null} onClick={() => void api("speichern", e)}>
          {busy === "speichern" ? "Speichert …" : dirty ? "Änderungen speichern" : (
            <>
              <Icon name="check" size={15} className="text-keep" /> gespeichert
            </>
          )}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy !== null}
          onClick={() => {
            if (!dirty || window.confirm("Ungespeicherte Änderungen gehen verloren. Neu erstellen?")) void api("erstellen");
          }}
        >
          <Icon name="refresh" size={15} /> Neu erstellen
        </button>
        {meldung && (
          <span className={`text-sm ${meldung.fehler ? "text-drop" : "text-keep"}`} role={meldung.fehler ? "alert" : "status"}>
            {meldung.text}
          </span>
        )}
      </div>
      <Fortschritt aktiv={busy === "erstellen"} dauer={45} schritte={SCHRITTE} hinweis="Seite bitte offen lassen — das dauert etwa eine halbe Minute." />
    </div>
  );
}
