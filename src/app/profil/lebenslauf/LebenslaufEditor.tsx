"use client";

import { useMemo, useState, type ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import { ReiterInhalt, ReiterLeiste, useReiter, useReiterId } from "@/components/ui/Reiter";
import { zuordnen, type Bereich } from "@/lib/pruefung-zuordnen";

const REITER_KEYS = ["person", "erfahrung", "ausbildung", "kenntnisse", "foto"];

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
export type Pruefpunkt = { stufe: "rot" | "gelb" | "hinweis"; punkt: string; vorschlag: string; erledigt?: boolean; bereich?: string; eintrag?: number | null };

/** Einträge mit festem Schlüssel — damit ein Hinweis an „seiner“ Station bleibt, auch wenn sie verschoben wird. */
type MitKey<T> = T & { _k: string };

const STUFE: Record<string, { text: string; badge: string }> = {
  rot: { text: "Wichtig", badge: "badge-negative" },
  gelb: { text: "Verbessern", badge: "badge-warn" },
  hinweis: { text: "Hinweis", badge: "badge-neutral" },
};

let zaehler = 0;
const neuerKey = (p: string) => `${p}-neu-${++zaehler}`;
const leereStation = (): MitKey<Station> => ({ _k: neuerKey("s"), zeitraum: "", titel: "", arbeitgeber: "", ort: "", stichpunkte: [] });
const leereAusbildung = (): MitKey<Ausbildung> => ({ _k: neuerKey("a"), zeitraum: "", abschluss: "", einrichtung: "" });
const ohneKey = <T,>({ _k, ...rest }: MitKey<T>) => rest as T;

/**
 * Schritt 2.5 · Ausgelesenen Lebenslauf korrigieren und Prüfpunkte abhaken.
 * Jeder Prüfpunkt steht dort, wo man ihn ändert: im passenden Reiter, bei Stationen und
 * Abschlüssen direkt am Eintrag. Gespeichert wird genau wie vorher (Felder + erledigte Punkte).
 */
export default function LebenslaufEditor({ initial, pruefung, foto }: { initial: CvDaten; pruefung: Pruefpunkt[]; foto?: ReactNode }) {
  const [reiter, waehlen] = useReiter(REITER_KEYS, "person");
  const idBasis = useReiterId();
  const [person, setPerson] = useState(initial.person);
  const [kurzprofil, setKurzprofil] = useState(initial.kurzprofil);
  const [stationen, setStationen] = useState<MitKey<Station>[]>(() => initial.stationen.map((s, i) => ({ ...s, _k: `s${i}` })));
  const [ausbildung, setAusbildung] = useState<MitKey<Ausbildung>[]>(() => initial.ausbildung.map((a, i) => ({ ...a, _k: `a${i}` })));
  const [sprachen, setSprachen] = useState(initial.sprachen);
  const [kenntnisse, setKenntnisse] = useState(initial.kenntnisse.join(", "));
  const [erledigt, setErledigt] = useState<Set<number>>(new Set(pruefung.flatMap((p, i) => (p.erledigt ? [i] : []))));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  // Prüfpunkte einmal zuordnen — gegen den Stand beim Laden, an die Schlüssel der Einträge gebunden.
  const orte = useMemo(
    () =>
      pruefung.map((p) => {
        const z = zuordnen(p, initial);
        const key = z.eintrag === null ? null : z.bereich === "erfahrung" ? `s${z.eintrag}` : z.bereich === "ausbildung" ? `a${z.eintrag}` : null;
        return { bereich: z.bereich, key };
      }),
    [pruefung, initial]
  );
  // Ein Eintrag wurde gelöscht → dessen Hinweise oben im Reiter zeigen, nicht verlieren.
  const vorhanden = new Set([...stationen.map((s) => s._k), ...ausbildung.map((a) => a._k)]);
  const indizes = (bereich: Bereich, key: string | null = null) =>
    orte.flatMap((o, i) => (o.bereich === bereich && (key === null ? o.key === null || !vorhanden.has(o.key) : o.key === key) ? [i] : []));
  const offen = (bereich: Bereich) => orte.filter((o, i) => o.bereich === bereich && !erledigt.has(i)).length;

  const geaendert = () => {
    setDirty(true);
    setMeldung(null);
  };
  const umschalten = (i: number) => {
    setErledigt((alt) => {
      const neu = new Set(alt);
      if (neu.has(i)) neu.delete(i);
      else neu.add(i);
      return neu;
    });
    geaendert();
  };
  const verschieben = <T,>(liste: T[], i: number, um: number): T[] => {
    const ziel = i + um;
    if (ziel < 0 || ziel >= liste.length) return liste;
    const neu = [...liste];
    [neu[i], neu[ziel]] = [neu[ziel], neu[i]];
    return neu;
  };
  const setzeStation = (i: number, neu: Partial<Station>) => {
    setStationen((alt) => alt.map((s, j) => (j === i ? { ...s, ...neu } : s)));
    geaendert();
  };
  const setzeAusbildung = (i: number, neu: Partial<Ausbildung>) => {
    setAusbildung((alt) => alt.map((a, j) => (j === i ? { ...a, ...neu } : a)));
    geaendert();
  };
  const setzePerson = (neu: Partial<CvDaten["person"]>) => {
    setPerson((alt) => ({ ...alt, ...neu }));
    geaendert();
  };

  const speichern = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const daten: CvDaten = {
        person,
        kurzprofil,
        stationen: stationen.map((s) => ({ ...ohneKey(s), stichpunkte: s.stichpunkte.map((p) => p.trim()).filter(Boolean) })),
        ausbildung: ausbildung.map((a) => ohneKey(a)),
        kenntnisse: kenntnisse.split(/[,;\n]+/).map((k) => k.trim()).filter(Boolean),
        sprachen,
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
      const l = body.lebenslauf as CvDaten;
      setPerson(l.person);
      setKurzprofil(l.kurzprofil);
      // Bereinigte Fassung übernehmen, Schlüssel (und damit die Hinweise) behalten
      setStationen((alt) => (l.stationen ?? []).map((s, i) => ({ ...s, _k: alt[i]?._k ?? neuerKey("s") })));
      setAusbildung((alt) => (l.ausbildung ?? []).map((a, i) => ({ ...a, _k: alt[i]?._k ?? neuerKey("a") })));
      setSprachen(l.sprachen ?? []);
      setKenntnisse((l.kenntnisse ?? []).join(", "));
      setDirty(false);
      setMeldung({ text: "Gespeichert." });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  const hinweise = (liste: number[]) =>
    liste.length > 0 ? <Hinweise pruefung={pruefung} indizes={liste} erledigt={erledigt} umschalten={umschalten} /> : null;
  const allgemein = indizes("allgemein");

  return (
    <div className="space-y-6 text-sm">
      <section className="rounded-lg border border-brand/20 bg-brand-soft/40 p-4">
        <p className="font-medium">Wofür diese Fassung genutzt wird</p>
        <ul className="mt-1.5 space-y-1 text-ink/85">
          <li className="flex gap-2">
            <Icon name="file" size={15} className="mt-[2px] shrink-0 text-brand" />
            <span>
              <span className="font-medium">Deine Unterlagen:</span> Daraus entsteht dein Lebenslauf — für jede Stelle leicht zugeschnitten. Unten
              siehst du das Ergebnis als PDF.
            </span>
          </li>
          <li className="flex gap-2">
            <Icon name="search" size={15} className="mt-[2px] shrink-0 text-brand" />
            <span>
              <span className="font-medium">Dein Suchprofil:</span> Neue Suchprofil-Vorschläge nutzen diese Fassung. Ein bestehendes Suchprofil ändert sich
              dadurch nicht von allein — nach dem Speichern kannst du es aktualisieren.
            </span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-muted">Deine Originaldatei bleibt unverändert. Lädst du unter „Mein Profil“ eine neue Datei hoch, ersetzt sie diese Fassung.</p>
      </section>

      {pruefung.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">
            <span className="tnum">{erledigt.size}</span> von <span className="tnum">{pruefung.length}</span> Verbesserungen erledigt
          </span>
          <span className="text-muted">Die Hinweise stehen direkt an der Stelle, die du ändern solltest. Zahlen an den Reitern = noch offen.</span>
        </div>
      )}
      {allgemein.length > 0 && (
        <section className="card-pad">
          <h2 className="section-title">Betrifft den ganzen Lebenslauf</h2>
          {hinweise(allgemein)}
        </section>
      )}

      <ReiterLeiste
        label="Bereiche des Lebenslaufs"
        idBasis={idBasis}
        aktiv={reiter}
        onWahl={waehlen}
        eintraege={[
          { key: "person", label: "Person", zahl: offen("person") },
          { key: "erfahrung", label: "Erfahrung", zahl: offen("erfahrung") },
          { key: "ausbildung", label: "Ausbildung", zahl: offen("ausbildung") },
          { key: "kenntnisse", label: "Kenntnisse", zahl: offen("kenntnisse") },
          ...(foto ? [{ key: "foto", label: "Foto" }] : []),
        ]}
      />

      <ReiterInhalt idBasis={idBasis} key_="person" aktiv={reiter}>
        <section className="card-pad space-y-4">
          <h2 className="section-title">Person und Kurzprofil</h2>
          {hinweise(indizes("person"))}
          <div className="grid gap-4 sm:grid-cols-2">
            <Feld label="Name" wert={person.name} setze={(v) => setzePerson({ name: v })} />
            <Feld label="Wohnort" wert={person.ort} setze={(v) => setzePerson({ ort: v })} />
            <Feld
              label="Zeile unter dem Namen"
              hinweis="Steht in Lebenslauf und Anschreiben, z. B. deine Berufsbezeichnung."
              platzhalter={stationen[0]?.titel || "z. B. Erzieherin"}
              wert={person.titel ?? ""}
              setze={(v) => setzePerson({ titel: v })}
              breit
            />
          </div>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="field-label mb-1">Kontakt für deine Unterlagen</legend>
            <Feld label="E-Mail" typ="email" wert={person.email ?? ""} setze={(v) => setzePerson({ email: v })} />
            <Feld label="Telefon" typ="tel" platzhalter="z. B. 0170 1234567" wert={person.telefon ?? ""} setze={(v) => setzePerson({ telefon: v })} />
            <Feld label="LinkedIn (optional)" platzhalter="linkedin.com/in/dein-name" wert={person.linkedin ?? ""} setze={(v) => setzePerson({ linkedin: v })} />
            <Feld label="Xing (optional)" platzhalter="xing.com/profile/Dein_Name" wert={person.xing ?? ""} setze={(v) => setzePerson({ xing: v })} />
          </fieldset>
          <label className="block">
            <span className="field-label">Kurzprofil</span>
            <span className="field-hint">2–3 Sätze, was dich beruflich ausmacht.</span>
            <textarea
              className="field min-h-24 leading-relaxed"
              value={kurzprofil}
              onChange={(e) => {
                setKurzprofil(e.target.value);
                geaendert();
              }}
            />
          </label>
        </section>
      </ReiterInhalt>

      <ReiterInhalt idBasis={idBasis} key_="erfahrung" aktiv={reiter}>
        <section className="card-pad">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Berufserfahrung</h2>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setStationen((alt) => [leereStation(), ...alt]);
                geaendert();
              }}
            >
              <Icon name="plus" size={14} /> Station
            </button>
          </div>
          <p className="section-lead">Neueste zuerst. Ein Stichpunkt pro Zeile.</p>
          {indizes("erfahrung").length > 0 && <div className="mt-4">{hinweise(indizes("erfahrung"))}</div>}
          <ol className="mt-4 space-y-4">
            {stationen.map((s, i) => (
              <li key={s._k} className="rounded-lg border border-rule bg-paper/50 p-4">
                {hinweise(indizes("erfahrung", s._k)) && <div className="mb-3">{hinweise(indizes("erfahrung", s._k))}</div>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="field-label">Titel</span>
                    <input className="field" value={s.titel} onChange={(e) => setzeStation(i, { titel: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="field-label">Zeitraum</span>
                    <input className="field" placeholder="MM/JJJJ – MM/JJJJ" value={s.zeitraum} onChange={(e) => setzeStation(i, { zeitraum: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="field-label">Arbeitgeber</span>
                    <input className="field" value={s.arbeitgeber} onChange={(e) => setzeStation(i, { arbeitgeber: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="field-label">Ort</span>
                    <input className="field" value={s.ort} onChange={(e) => setzeStation(i, { ort: e.target.value })} />
                  </label>
                </div>
                <label className="mt-3 block">
                  <span className="field-label">Aufgaben und Erfolge</span>
                  <textarea className="field min-h-20 leading-relaxed" value={s.stichpunkte.join("\n")} onChange={(e) => setzeStation(i, { stichpunkte: e.target.value.split("\n") })} />
                </label>
                <Zeilenaktionen
                  nach_oben={i > 0 ? () => (setStationen((alt) => verschieben(alt, i, -1)), geaendert()) : undefined}
                  nach_unten={i < stationen.length - 1 ? () => (setStationen((alt) => verschieben(alt, i, 1)), geaendert()) : undefined}
                  entfernen={() => (setStationen((alt) => alt.filter((_, j) => j !== i)), geaendert())}
                  was="Station"
                />
              </li>
            ))}
          </ol>
        </section>
      </ReiterInhalt>

      <ReiterInhalt idBasis={idBasis} key_="ausbildung" aktiv={reiter}>
        <section className="card-pad">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Ausbildung</h2>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setAusbildung((alt) => [...alt, leereAusbildung()]);
                geaendert();
              }}
            >
              <Icon name="plus" size={14} /> Abschluss
            </button>
          </div>
          {indizes("ausbildung").length > 0 && <div className="mt-4">{hinweise(indizes("ausbildung"))}</div>}
          <ol className="mt-4 space-y-3">
            {ausbildung.map((a, i) => (
              <li key={a._k} className="rounded-lg border border-rule bg-paper/50 p-4">
                {hinweise(indizes("ausbildung", a._k)) && <div className="mb-3">{hinweise(indizes("ausbildung", a._k))}</div>}
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block sm:col-span-2">
                    <span className="field-label">Abschluss</span>
                    <input className="field" value={a.abschluss} onChange={(e) => setzeAusbildung(i, { abschluss: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="field-label">Zeitraum</span>
                    <input className="field" value={a.zeitraum} onChange={(e) => setzeAusbildung(i, { zeitraum: e.target.value })} />
                  </label>
                  <label className="block sm:col-span-3">
                    <span className="field-label">Einrichtung</span>
                    <input className="field" value={a.einrichtung} onChange={(e) => setzeAusbildung(i, { einrichtung: e.target.value })} />
                  </label>
                </div>
                <Zeilenaktionen
                  nach_oben={i > 0 ? () => (setAusbildung((alt) => verschieben(alt, i, -1)), geaendert()) : undefined}
                  nach_unten={i < ausbildung.length - 1 ? () => (setAusbildung((alt) => verschieben(alt, i, 1)), geaendert()) : undefined}
                  entfernen={() => (setAusbildung((alt) => alt.filter((_, j) => j !== i)), geaendert())}
                  was="Abschluss"
                />
              </li>
            ))}
          </ol>
        </section>
      </ReiterInhalt>

      <ReiterInhalt idBasis={idBasis} key_="kenntnisse" aktiv={reiter}>
        <section className="card-pad space-y-4">
          <h2 className="section-title">Kenntnisse und Sprachen</h2>
          {hinweise(indizes("kenntnisse"))}
          <label className="block">
            <span className="field-label">Kenntnisse</span>
            <span className="field-hint">Mit Komma getrennt, höchstens 15.</span>
            <textarea
              className="field min-h-16"
              value={kenntnisse}
              onChange={(e) => {
                setKenntnisse(e.target.value);
                geaendert();
              }}
            />
          </label>
          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="field-label">Sprachen</span>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setSprachen((alt) => [...alt, { sprache: "", niveau: "" }]);
                  geaendert();
                }}
              >
                <Icon name="plus" size={14} /> Sprache
              </button>
            </div>
            <ul className="mt-2 space-y-2">
              {sprachen.map((s, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="Sprache"
                    className="field mt-0 w-40"
                    placeholder="Sprache"
                    value={s.sprache}
                    onChange={(e) => (setSprachen((alt) => alt.map((x, j) => (j === i ? { ...x, sprache: e.target.value } : x))), geaendert())}
                  />
                  <input
                    aria-label="Niveau"
                    className="field mt-0 w-48"
                    placeholder="z. B. Muttersprache, B2"
                    value={s.niveau}
                    onChange={(e) => (setSprachen((alt) => alt.map((x, j) => (j === i ? { ...x, niveau: e.target.value } : x))), geaendert())}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-sm hover:text-drop"
                    aria-label="Sprache entfernen"
                    onClick={() => (setSprachen((alt) => alt.filter((_, j) => j !== i)), geaendert())}
                  >
                    <Icon name="x" size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </ReiterInhalt>

      {foto && (
        <ReiterInhalt idBasis={idBasis} key_="foto" aktiv={reiter}>
          {foto}
        </ReiterInhalt>
      )}

      <div className="card z-10 flex flex-wrap items-center gap-3 p-3 sm:sticky sm:bottom-3 sm:shadow-raised">
        <button type="button" onClick={() => void speichern()} disabled={busy || !dirty} className={dirty ? "btn-primary" : "btn-secondary"}>
          {busy ? "Speichert …" : dirty ? "Änderungen speichern" : (
            <>
              <Icon name="check" size={15} className="text-keep" /> gespeichert
            </>
          )}
        </button>
        {dirty ? (
          <span className="btn-ghost pointer-events-none opacity-45" title="Erst speichern">
            <Icon name="eye" size={15} /> Ergebnis ansehen
          </span>
        ) : (
          <a href="/api/layout?vorschau=cv" target="_blank" rel="noopener noreferrer" className="btn-ghost">
            <Icon name="eye" size={15} /> Ergebnis ansehen
          </a>
        )}
        {dirty && !busy && <span className="text-xs text-warn">Ungespeicherte Änderungen</span>}
        {meldung && (
          <span className={`text-sm ${meldung.fehler ? "text-drop" : "text-keep"}`} role={meldung.fehler ? "alert" : "status"}>
            {meldung.text}
            {!meldung.fehler && (
              <>
                {" "}
                <a href="/profil#suchprofil" className="link">
                  Suchprofil aktualisieren →
                </a>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

/** Prüfpunkte an Ort und Stelle — abhaken, sobald geändert. */
function Hinweise({ pruefung, indizes, erledigt, umschalten }: { pruefung: Pruefpunkt[]; indizes: number[]; erledigt: Set<number>; umschalten: (i: number) => void }) {
  return (
    <ul className="space-y-2" aria-label="Verbesserungsvorschläge">
      {indizes.map((i) => {
        const p = pruefung[i];
        const fertig = erledigt.has(i);
        return (
          <li key={i} className={`rounded-lg border px-3 py-2.5 ${fertig ? "border-rule bg-subtle/50" : p.stufe === "rot" ? "border-drop/30 bg-drop-soft/60" : "border-warn/30 bg-warn-soft/40"}`}>
            <label className="flex cursor-pointer gap-3">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={fertig} onChange={() => umschalten(i)} aria-label={`Erledigt: ${p.punkt}`} />
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
