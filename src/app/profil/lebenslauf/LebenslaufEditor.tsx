"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

type Station = { zeitraum: string; titel: string; arbeitgeber: string; ort: string; stichpunkte: string[] };
type Ausbildung = { zeitraum: string; abschluss: string; einrichtung: string };
type Sprache = { sprache: string; niveau: string };
export type CvDaten = {
  person: { name: string; ort: string; titel?: string; email?: string; telefon?: string; linkedin?: string; xing?: string };
  kurzprofil: string;
  stationen: Station[];
  ausbildung: Ausbildung[];
  kenntnisse: string[];
  sprachen: Sprache[];
  bearbeitet_at?: string | null;
};
export type Pruefpunkt = { stufe: "rot" | "gelb" | "hinweis"; punkt: string; vorschlag: string; erledigt?: boolean };

const STUFE: Record<string, { text: string; badge: string }> = {
  rot: { text: "Wichtig", badge: "badge-negative" },
  gelb: { text: "Verbessern", badge: "badge-warn" },
  hinweis: { text: "Hinweis", badge: "badge-neutral" },
};

const leereStation = (): Station => ({ zeitraum: "", titel: "", arbeitgeber: "", ort: "", stichpunkte: [] });
const leereAusbildung = (): Ausbildung => ({ zeitraum: "", abschluss: "", einrichtung: "" });

/** Schritt 2.5 · Ausgelesenen Lebenslauf korrigieren und Prüfpunkte abhaken. */
export default function LebenslaufEditor({ initial, pruefung: pruefungStart }: { initial: CvDaten; pruefung: Pruefpunkt[] }) {
  const [cv, setCv] = useState<CvDaten>(initial);
  const [erledigt, setErledigt] = useState<Set<number>>(new Set(pruefungStart.flatMap((p, i) => (p.erledigt ? [i] : []))));
  const [kenntnisse, setKenntnisse] = useState(initial.kenntnisse.join(", "));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  const aendern = (neu: Partial<CvDaten>) => {
    setCv((alt) => ({ ...alt, ...neu }));
    setDirty(true);
    setMeldung(null);
  };
  const person = (neu: Partial<CvDaten["person"]>) => aendern({ person: { ...cv.person, ...neu } });
  const station = (i: number, neu: Partial<Station>) => aendern({ stationen: cv.stationen.map((s, j) => (j === i ? { ...s, ...neu } : s)) });
  const ausbildung = (i: number, neu: Partial<Ausbildung>) => aendern({ ausbildung: cv.ausbildung.map((a, j) => (j === i ? { ...a, ...neu } : a)) });
  const sprache = (i: number, neu: Partial<Sprache>) => aendern({ sprachen: cv.sprachen.map((s, j) => (j === i ? { ...s, ...neu } : s)) });
  const verschieben = <T,>(liste: T[], i: number, um: number): T[] => {
    const ziel = i + um;
    if (ziel < 0 || ziel >= liste.length) return liste;
    const neu = [...liste];
    [neu[i], neu[ziel]] = [neu[ziel], neu[i]];
    return neu;
  };

  const speichern = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const daten = {
        ...cv,
        kenntnisse: kenntnisse.split(/[,;\n]+/).map((k) => k.trim()).filter(Boolean),
        stationen: cv.stationen.map((s) => ({ ...s, stichpunkte: s.stichpunkte.map((p) => p.trim()).filter(Boolean) })),
      };
      const res = await fetch("/api/lebenslauf", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lebenslauf: daten, erledigt: [...erledigt] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMeldung({ text: body.error ?? `HTTP ${res.status}`, fehler: true });
        return;
      }
      setCv(body.lebenslauf);
      setKenntnisse((body.lebenslauf.kenntnisse ?? []).join(", "));
      setDirty(false);
      setMeldung({ text: "Gespeichert. Der nächste Suchprofil-Vorschlag nutzt diese Fassung." });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 text-sm">
      {pruefungStart.length > 0 && (
        <section className="card-pad">
          <h2 className="section-title">Was sich verbessern lässt</h2>
          <p className="section-lead">Haken setzen, wenn du einen Punkt erledigt hast — unten im Lebenslauf direkt ändern.</p>
          <ul className="mt-4 divide-y divide-rule/70">
            {pruefungStart.map((p, i) => {
              const fertig = erledigt.has(i);
              return (
                <li key={i} className="py-3 first:pt-0 last:pb-0">
                  <label className="flex cursor-pointer gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 shrink-0"
                      checked={fertig}
                      onChange={() => {
                        setErledigt((alt) => {
                          const neu = new Set(alt);
                          if (neu.has(i)) neu.delete(i);
                          else neu.add(i);
                          return neu;
                        });
                        setDirty(true);
                      }}
                    />
                    <span className={`min-w-0 ${fertig ? "text-muted line-through decoration-muted/50" : ""}`}>
                      <span className={`${STUFE[p.stufe]?.badge ?? "badge-neutral"} mr-2 no-underline`}>{STUFE[p.stufe]?.text ?? p.stufe}</span>
                      {p.punkt}
                      {p.vorschlag && <span className="mt-0.5 block text-muted">→ {p.vorschlag}</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card-pad space-y-4">
        <h2 className="section-title">Person und Kurzprofil</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Feld label="Name" wert={cv.person.name} setze={(v) => person({ name: v })} />
          <Feld label="Wohnort" wert={cv.person.ort} setze={(v) => person({ ort: v })} />
          <Feld
            label="Zeile unter dem Namen"
            hinweis="Steht in Lebenslauf und Anschreiben, z. B. deine Berufsbezeichnung."
            platzhalter={cv.stationen[0]?.titel || "z. B. Erzieherin"}
            wert={cv.person.titel ?? ""}
            setze={(v) => person({ titel: v })}
            breit
          />
        </div>
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="field-label mb-1">Kontakt für deine Unterlagen</legend>
          <Feld label="E-Mail" typ="email" wert={cv.person.email ?? ""} setze={(v) => person({ email: v })} />
          <Feld label="Telefon" typ="tel" platzhalter="z. B. 0170 1234567" wert={cv.person.telefon ?? ""} setze={(v) => person({ telefon: v })} />
          <Feld label="LinkedIn (optional)" platzhalter="linkedin.com/in/dein-name" wert={cv.person.linkedin ?? ""} setze={(v) => person({ linkedin: v })} />
          <Feld label="Xing (optional)" platzhalter="xing.com/profile/Dein_Name" wert={cv.person.xing ?? ""} setze={(v) => person({ xing: v })} />
        </fieldset>
        <label className="block">
          <span className="field-label">Kurzprofil</span>
          <span className="field-hint">2–3 Sätze, was dich beruflich ausmacht.</span>
          <textarea className="field min-h-24 leading-relaxed" value={cv.kurzprofil} onChange={(e) => aendern({ kurzprofil: e.target.value })} />
        </label>
      </section>

      <section className="card-pad">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Berufserfahrung</h2>
          <button type="button" className="btn-secondary btn-sm" onClick={() => aendern({ stationen: [leereStation(), ...cv.stationen] })}>
            <Icon name="plus" size={14} /> Station
          </button>
        </div>
        <p className="section-lead">Neueste zuerst. Ein Stichpunkt pro Zeile.</p>
        <ol className="mt-4 space-y-4">
          {cv.stationen.map((s, i) => (
            <li key={i} className="rounded-lg border border-rule bg-paper/50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="field-label">Titel</span>
                  <input className="field" value={s.titel} onChange={(e) => station(i, { titel: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Zeitraum</span>
                  <input className="field" placeholder="MM/JJJJ – MM/JJJJ" value={s.zeitraum} onChange={(e) => station(i, { zeitraum: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Arbeitgeber</span>
                  <input className="field" value={s.arbeitgeber} onChange={(e) => station(i, { arbeitgeber: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Ort</span>
                  <input className="field" value={s.ort} onChange={(e) => station(i, { ort: e.target.value })} />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="field-label">Aufgaben und Erfolge</span>
                <textarea
                  className="field min-h-20 leading-relaxed"
                  value={s.stichpunkte.join("\n")}
                  onChange={(e) => station(i, { stichpunkte: e.target.value.split("\n") })}
                />
              </label>
              <Zeilenaktionen
                nach_oben={i > 0 ? () => aendern({ stationen: verschieben(cv.stationen, i, -1) }) : undefined}
                nach_unten={i < cv.stationen.length - 1 ? () => aendern({ stationen: verschieben(cv.stationen, i, 1) }) : undefined}
                entfernen={() => aendern({ stationen: cv.stationen.filter((_, j) => j !== i) })}
                was="Station"
              />
            </li>
          ))}
        </ol>
      </section>

      <section className="card-pad">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Ausbildung</h2>
          <button type="button" className="btn-secondary btn-sm" onClick={() => aendern({ ausbildung: [...cv.ausbildung, leereAusbildung()] })}>
            <Icon name="plus" size={14} /> Abschluss
          </button>
        </div>
        <ol className="mt-4 space-y-3">
          {cv.ausbildung.map((a, i) => (
            <li key={i} className="rounded-lg border border-rule bg-paper/50 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block sm:col-span-2">
                  <span className="field-label">Abschluss</span>
                  <input className="field" value={a.abschluss} onChange={(e) => ausbildung(i, { abschluss: e.target.value })} />
                </label>
                <label className="block">
                  <span className="field-label">Zeitraum</span>
                  <input className="field" value={a.zeitraum} onChange={(e) => ausbildung(i, { zeitraum: e.target.value })} />
                </label>
                <label className="block sm:col-span-3">
                  <span className="field-label">Einrichtung</span>
                  <input className="field" value={a.einrichtung} onChange={(e) => ausbildung(i, { einrichtung: e.target.value })} />
                </label>
              </div>
              <Zeilenaktionen
                nach_oben={i > 0 ? () => aendern({ ausbildung: verschieben(cv.ausbildung, i, -1) }) : undefined}
                nach_unten={i < cv.ausbildung.length - 1 ? () => aendern({ ausbildung: verschieben(cv.ausbildung, i, 1) }) : undefined}
                entfernen={() => aendern({ ausbildung: cv.ausbildung.filter((_, j) => j !== i) })}
                was="Abschluss"
              />
            </li>
          ))}
        </ol>
      </section>

      <section className="card-pad space-y-4">
        <h2 className="section-title">Kenntnisse und Sprachen</h2>
        <label className="block">
          <span className="field-label">Kenntnisse</span>
          <span className="field-hint">Mit Komma getrennt, höchstens 15.</span>
          <textarea
            className="field min-h-16"
            value={kenntnisse}
            onChange={(e) => {
              setKenntnisse(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="field-label">Sprachen</span>
            <button type="button" className="btn-ghost btn-sm" onClick={() => aendern({ sprachen: [...cv.sprachen, { sprache: "", niveau: "" }] })}>
              <Icon name="plus" size={14} /> Sprache
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {cv.sprachen.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <input aria-label="Sprache" className="field mt-0 w-40" placeholder="Sprache" value={s.sprache} onChange={(e) => sprache(i, { sprache: e.target.value })} />
                <input aria-label="Niveau" className="field mt-0 w-48" placeholder="z. B. Muttersprache, B2" value={s.niveau} onChange={(e) => sprache(i, { niveau: e.target.value })} />
                <button type="button" className="btn-ghost btn-sm hover:text-drop" aria-label="Sprache entfernen" onClick={() => aendern({ sprachen: cv.sprachen.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="card z-10 flex flex-wrap items-center gap-3 p-3 sm:sticky sm:bottom-3 sm:shadow-raised">
        <button type="button" onClick={() => void speichern()} disabled={busy || !dirty} className={dirty ? "btn-primary" : "btn-secondary"}>
          {busy ? "Speichert …" : dirty ? "Änderungen speichern" : (
            <>
              <Icon name="check" size={15} className="text-keep" /> gespeichert
            </>
          )}
        </button>
        {dirty && !busy && <span className="text-xs text-warn">Ungespeicherte Änderungen</span>}
        {meldung && <span className={`text-sm ${meldung.fehler ? "text-drop" : "text-keep"}`} role={meldung.fehler ? "alert" : "status"}>{meldung.text}</span>}
      </div>
    </div>
  );
}

function Zeilenaktionen({ nach_oben, nach_unten, entfernen, was }: { nach_oben?: () => void; nach_unten?: () => void; entfernen: () => void; was: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-rule/70 pt-3">
      <button type="button" className="btn-ghost btn-sm" onClick={nach_oben} disabled={!nach_oben} aria-label={`${was} nach oben`}>
        ↑ nach oben
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={nach_unten} disabled={!nach_unten} aria-label={`${was} nach unten`}>
        ↓ nach unten
      </button>
      <button type="button" className="btn-ghost btn-sm ml-auto hover:text-drop" onClick={entfernen}>
        <Icon name="x" size={14} /> {was} entfernen
      </button>
    </div>
  );
}

function Feld({ label, wert, setze, hinweis, platzhalter, typ = "text", breit }: { label: string; wert: string; setze: (v: string) => void; hinweis?: string; platzhalter?: string; typ?: string; breit?: boolean }) {
  return (
    <label className={`block ${breit ? "sm:col-span-2" : ""}`}>
      <span className="field-label">{label}</span>
      {hinweis && <span className="field-hint">{hinweis}</span>}
      <input className="field" type={typ} placeholder={platzhalter} value={wert} onChange={(e) => setze(e.target.value)} />
    </label>
  );
}
