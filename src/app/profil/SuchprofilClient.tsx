"use client";

import Link from "next/link";
import { useState } from "react";
import Fortschritt from "@/components/Fortschritt";

/**
 * Schritt 2.6 · Fragebogen → Vorschlag → Suchprofil bestätigen.
 * Typen hier bewusst lokal (Client) — die Prüfung passiert auf dem Server (lib/suchprofil.ts).
 */
export type Antworten = {
  richtungen: string[];
  eigeneRichtung: string;
  anders: string;
  ebene: "gleich" | "hoch" | "zurueck" | "egal";
  ort: string;
  umkreis: number;
  arbeitsort: Array<"vor-ort" | "hybrid" | "remote">;
  reisen: "nein" | "gelegentlich" | "ja";
  umfang: "vollzeit" | "teilzeit" | "beides";
  stunden: string;
  gehalt: string;
  gehaltEinheit: "monat" | "jahr";
  nogos: string[];
  nogosText: string;
  englisch: "ja" | "etwas" | "nein";
};

export type Vorschlag = { suchbegriffe: string[]; profiltext: string; kriterien: string; ort: string; umkreis: number };

export type SuchprofilStand = { antworten: Antworten | null; vorschlag: Vorschlag | null; bestaetigt_at: string | null };

const NOGOS = [
  { key: "zeitarbeit", label: "Zeitarbeit / Personaldienstleister" },
  { key: "konzern", label: "Großkonzern" },
  { key: "startup", label: "Startup" },
  { key: "oeffentlich", label: "Öffentlicher Dienst" },
  { key: "kirchlich", label: "Kirchlicher Träger" },
  { key: "befristet", label: "Befristete Stelle" },
];

const leer = (ort: string): Antworten => ({
  richtungen: [],
  eigeneRichtung: "",
  anders: "",
  ebene: "gleich",
  ort,
  umkreis: 25,
  arbeitsort: ["vor-ort", "hybrid"],
  reisen: "gelegentlich",
  umfang: "beides",
  stunden: "",
  gehalt: "",
  gehaltEinheit: "monat",
  nogos: [],
  nogosText: "",
  englisch: "etwas",
});

const feld = "mt-1 w-full rounded border border-rule bg-transparent px-3 py-2";

function Auswahl<T extends string>({
  name,
  wert,
  optionen,
  setze,
}: {
  name: string;
  wert: T;
  optionen: Array<[T, string]>;
  setze: (w: T) => void;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
      {optionen.map(([w, text]) => (
        <label key={w} className="inline-flex items-center gap-1.5">
          <input type="radio" name={name} checked={wert === w} onChange={() => setze(w)} />
          {text}
        </label>
      ))}
    </div>
  );
}

const datum = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function SuchprofilClient({
  richtungen,
  ortAusLebenslauf,
  initial,
}: {
  richtungen: string[];
  ortAusLebenslauf: string;
  initial: SuchprofilStand;
}) {
  const [a, setA] = useState<Antworten>(initial.antworten ?? leer(ortAusLebenslauf));
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(initial.vorschlag);
  const [begriffe, setBegriffe] = useState((initial.vorschlag?.suchbegriffe ?? []).join(", "));
  const [bestaetigt, setBestaetigt] = useState<string | null>(initial.bestaetigt_at);
  const [busy, setBusy] = useState<"vorschlag" | "bestaetigen" | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const setze = <K extends keyof Antworten>(k: K, v: Antworten[K]) => setA((alt) => ({ ...alt, [k]: v }));
  const umschalten = <K extends "richtungen" | "arbeitsort" | "nogos">(k: K, w: string) =>
    setA((alt) => {
      const liste = alt[k] as string[];
      return { ...alt, [k]: liste.includes(w) ? liste.filter((x) => x !== w) : [...liste, w] };
    });
  const setzeV = <K extends keyof Vorschlag>(k: K, w: Vorschlag[K]) => setVorschlag((alt) => (alt ? { ...alt, [k]: w } : alt));

  // Richtungen aus dem aktuellen Lebenslauf plus früher gewählte, die dort nicht mehr stehen
  const angebot = [...richtungen, ...a.richtungen.filter((r) => !richtungen.includes(r))];

  const senden = async (aktion: "vorschlag" | "bestaetigen") => {
    setBusy(aktion);
    setFehler(null);
    try {
      const payload =
        aktion === "vorschlag"
          ? { aktion, antworten: a }
          : { aktion, vorschlag: { ...vorschlag, suchbegriffe: begriffe.split(/[,;\n]+/) } };
      const res = await fetch("/api/suchprofil", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFehler(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setVorschlag(body.vorschlag);
      setBegriffe((body.vorschlag?.suchbegriffe ?? []).join(", "));
      setBestaetigt(aktion === "bestaetigen" ? body.bestaetigt_at : null);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <section>
        <h2 className="font-semibold">Was suchst du?</h2>
        <p className="mt-1 text-muted">Der Lebenslauf zeigt, was du gemacht hast — hier geht es darum, was als Nächstes kommen soll. Dauert 3–5 Minuten.</p>

        <div className="mt-4 space-y-5">
          <fieldset>
            <legend className="font-semibold">Richtung</legend>
            {angebot.length > 0 && (
              <div className="mt-1 space-y-1">
                {angebot.map((r) => (
                  <label key={r} className="flex items-center gap-2">
                    <input type="checkbox" checked={a.richtungen.includes(r)} onChange={() => umschalten("richtungen", r)} />
                    {r}
                  </label>
                ))}
              </div>
            )}
            <input
              className={feld}
              placeholder={angebot.length ? "Oder eine eigene Richtung, auch ein Quereinstieg" : "Welche Richtung? Auch ein Quereinstieg"}
              value={a.eigeneRichtung}
              onChange={(e) => setze("eigeneRichtung", e.target.value)}
            />
          </fieldset>

          <label className="block">
            <span className="font-semibold">Was soll anders werden als im letzten Job?</span>
            <span className="block text-muted">Die wichtigste Frage — Gehalt, Verantwortung, Arbeitszeit, Team, Sinn, Ruhe …</span>
            <textarea className={`${feld} min-h-20`} value={a.anders} onChange={(e) => setze("anders", e.target.value)} />
          </label>

          <fieldset>
            <legend className="font-semibold">Ebene</legend>
            <Auswahl
              name="ebene"
              wert={a.ebene}
              setze={(w) => setze("ebene", w)}
              optionen={[["gleich", "Gleiche Stufe"], ["hoch", "Ein Schritt hoch"], ["zurueck", "Auch ein Schritt zurück okay"], ["egal", "Egal"]]}
            />
          </fieldset>

          <fieldset>
            <legend className="font-semibold">Wo?</legend>
            <div className="mt-1 flex flex-wrap gap-3">
              <input className={`${feld} mt-0 max-w-56`} placeholder="Ort oder PLZ" value={a.ort} onChange={(e) => setze("ort", e.target.value)} />
              <select className={`${feld} mt-0 w-auto`} value={a.umkreis} onChange={(e) => setze("umkreis", Number(e.target.value))}>
                {[10, 25, 50, 100, 200].map((km) => (
                  <option key={km} value={km}>
                    {km} km Umkreis
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {([["vor-ort", "Vor Ort"], ["hybrid", "Hybrid"], ["remote", "Remote"]] as const).map(([w, text]) => (
                <label key={w} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={a.arbeitsort.includes(w)} onChange={() => umschalten("arbeitsort", w)} />
                  {text}
                </label>
              ))}
            </div>
            <p className="mt-2 text-muted">Reisen</p>
            <Auswahl
              name="reisen"
              wert={a.reisen}
              setze={(w) => setze("reisen", w)}
              optionen={[["nein", "Nein"], ["gelegentlich", "Gelegentlich"], ["ja", "Auch viel"]]}
            />
          </fieldset>

          <fieldset>
            <legend className="font-semibold">Umfang</legend>
            <Auswahl
              name="umfang"
              wert={a.umfang}
              setze={(w) => setze("umfang", w)}
              optionen={[["vollzeit", "Vollzeit"], ["teilzeit", "Teilzeit"], ["beides", "Beides"]]}
            />
            {a.umfang !== "vollzeit" && (
              <input className={`${feld} max-w-xs`} placeholder="Stunden pro Woche, z. B. 25–30" value={a.stunden} onChange={(e) => setze("stunden", e.target.value)} />
            )}
          </fieldset>

          <fieldset>
            <legend className="font-semibold">
              Gehalt <span className="font-normal text-muted">(optional, Untergrenze brutto)</span>
            </legend>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <input className={`${feld} mt-0 max-w-40`} inputMode="numeric" placeholder="z. B. 3.400" value={a.gehalt} onChange={(e) => setze("gehalt", e.target.value)} />
              <Auswahl
                name="gehaltEinheit"
                wert={a.gehaltEinheit}
                setze={(w) => setze("gehaltEinheit", w)}
                optionen={[["monat", "€ im Monat"], ["jahr", "€ im Jahr"]]}
              />
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold">No-Gos</legend>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {NOGOS.map((n) => (
                <label key={n.key} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={a.nogos.includes(n.key)} onChange={() => umschalten("nogos", n.key)} />
                  {n.label}
                </label>
              ))}
            </div>
            <input className={feld} placeholder="Weitere No-Gos: Branchen, Firmen, Schichtdienst …" value={a.nogosText} onChange={(e) => setze("nogosText", e.target.value)} />
          </fieldset>

          <fieldset>
            <legend className="font-semibold">Englisch im Job</legend>
            <Auswahl
              name="englisch"
              wert={a.englisch}
              setze={(w) => setze("englisch", w)}
              optionen={[["ja", "Kein Problem"], ["etwas", "Etwas ist okay"], ["nein", "Lieber nicht"]]}
            />
          </fieldset>
        </div>

        <button
          type="button"
          onClick={() => void senden("vorschlag")}
          disabled={busy !== null}
          className="mt-6 rounded border border-ink px-4 py-2 disabled:opacity-40"
        >
          {vorschlag ? "Neuen Vorschlag erstellen" : "Suchprofil vorschlagen"}
        </button>
        <Fortschritt
          aktiv={busy === "vorschlag"}
          dauer={25}
          schritte={[
            { ab: 0, text: "Antworten werden gespeichert …" },
            { ab: 2, text: "Suchbegriffe werden gewählt …" },
            { ab: 10, text: "Profiltext wird formuliert …" },
            { ab: 18, text: "Bewertungsregeln werden formuliert …" },
          ]}
          hinweis="Seite bitte offen lassen — das dauert etwa 20 Sekunden."
        />
        {fehler && busy === null && !vorschlag && <p className="mt-3 text-drop">{fehler}</p>}
      </section>

      {vorschlag && (
        <section>
          <h2 className="font-semibold">Dein Suchprofil</h2>
          <p className="mt-1 text-muted">
            Danach suchen und bewerten wir jede Nacht. Lies es durch, ändere, was nicht stimmt, und übernimm es.
          </p>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="font-semibold">Suchbegriffe</span>
              <span className="block text-muted">Mit Komma getrennt. Kurze Wörter finden mehr: „Erzieher“ findet auch „Erzieherin“.</span>
              <textarea className={`${feld} min-h-16`} value={begriffe} onChange={(e) => setBegriffe(e.target.value)} />
            </label>
            <div>
              <span className="font-semibold">Ort und Umkreis</span>
              <div className="mt-1 flex flex-wrap gap-3">
                <input className={`${feld} mt-0 max-w-56`} value={vorschlag.ort} onChange={(e) => setzeV("ort", e.target.value)} />
                <select className={`${feld} mt-0 w-auto`} value={vorschlag.umkreis} onChange={(e) => setzeV("umkreis", Number(e.target.value))}>
                  {[10, 25, 50, 100, 200].map((km) => (
                    <option key={km} value={km}>
                      {km} km Umkreis
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="block">
              <span className="font-semibold">Profiltext</span>
              <span className="block text-muted">So beschreiben wir dich gegenüber der Bewertung.</span>
              <textarea className={`${feld} min-h-56 font-mono text-xs leading-relaxed`} value={vorschlag.profiltext} onChange={(e) => setzeV("profiltext", e.target.value)} />
            </label>
            <label className="block">
              <span className="font-semibold">Bewertungsregeln</span>
              <span className="block text-muted">Wann eine Stelle „Bewerben“, „Anschauen“ oder „Ignorieren“ ist.</span>
              <textarea className={`${feld} min-h-48 font-mono text-xs leading-relaxed`} value={vorschlag.kriterien} onChange={(e) => setzeV("kriterien", e.target.value)} />
            </label>
          </div>
          <button
            type="button"
            onClick={() => void senden("bestaetigen")}
            disabled={busy !== null}
            className="mt-4 rounded bg-ink px-4 py-2 text-paper disabled:opacity-40"
          >
            {bestaetigt ? "Änderungen übernehmen" : "Suchprofil übernehmen"}
          </button>
          {fehler && busy === null && <p className="mt-3 text-drop">{fehler}</p>}
          {bestaetigt && (
            <div className="mt-4 rounded border border-rule p-4">
              <p className="font-semibold">✓ Übernommen am {datum(bestaetigt)}</p>
              <p className="mt-1 text-muted">
                Ab jetzt sucht der Nachtlauf mit diesen Begriffen und bewertet neue Stellen danach. Nächster Schritt: unter{" "}
                <Link href="/label" className="underline underline-offset-4">
                  Labeln
                </Link>{" "}
                20–30 Stellen beurteilen — daraus lernt die Bewertung, was dir wirklich wichtig ist.
              </p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
