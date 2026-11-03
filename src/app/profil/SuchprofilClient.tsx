"use client";

import Link from "next/link";
import { useState } from "react";
import Fortschritt from "@/components/Fortschritt";
import Icon from "@/components/ui/Icon";
import { Schritt } from "./LebenslaufClient";

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

const feld = "field";

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
    <div className="mt-2 flex flex-wrap gap-2">
      {optionen.map(([w, text]) => (
        <label key={w} className="choice">
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
  onStand,
}: {
  richtungen: string[];
  ortAusLebenslauf: string;
  initial: SuchprofilStand;
  /** Meldet einen neuen Stand (Vorschlag, Übernahme) an die Profilübersicht. */
  onStand?: (s: { vorschlag: Vorschlag | null; bestaetigt_at: string | null; antworten: boolean }) => void;
}) {
  const [a, setA] = useState<Antworten>(initial.antworten ?? leer(ortAusLebenslauf));
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(initial.vorschlag);
  const [begriffe, setBegriffe] = useState((initial.vorschlag?.suchbegriffe ?? []).join(", "));
  const [bestaetigt, setBestaetigt] = useState<string | null>(initial.bestaetigt_at);
  const [busy, setBusy] = useState<"vorschlag" | "bestaetigen" | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  // Schritt 2.8: Startlauf nach dem Übernehmen
  const [lauf, setLauf] = useState<Startlauf | null>(null);
  // Fragebogen: offen beim ersten Mal, danach als Zusammenfassung (Antworten bleiben im Formular erhalten)
  const [fragebogenOffen, setFragebogenOffen] = useState(!initial.vorschlag);

  const startlauf = async () => {
    const stand: Startlauf = { phase: "suchen", gefunden: 0, bewertet: 0, offen: 0, fehler: null };
    const zeige = () => setLauf({ ...stand });
    zeige();
    const schritt = async (name: "suchen" | "bewerten") => {
      const res = await fetch("/api/startlauf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schritt: name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      return body as { done?: boolean; gespeichert?: number; evaluated?: number; nochOffen?: number };
    };
    try {
      for (let runde = 0; runde < 4; runde++) {
        const r = await schritt("suchen");
        stand.gefunden += r.gespeichert ?? 0;
        zeige();
        if (r.done !== false) break;
      }
      stand.phase = "bewerten";
      zeige();
      for (let runde = 0; runde < 8; runde++) {
        const r = await schritt("bewerten");
        stand.bewertet += r.evaluated ?? 0;
        stand.offen = r.nochOffen ?? 0;
        zeige();
        if (!stand.offen || !r.evaluated) break;
      }
      stand.phase = "fertig";
    } catch (err) {
      stand.fehler = err instanceof Error ? err.message : String(err);
      stand.phase = "fertig";
    }
    zeige();
  };

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
      onStand?.({ vorschlag: body.vorschlag ?? null, bestaetigt_at: aktion === "bestaetigen" ? body.bestaetigt_at : null, antworten: true });
      if (aktion === "vorschlag") setFragebogenOffen(false);
      if (aktion === "bestaetigen") {
        setBusy(null);
        await startlauf();
      }
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const laeuft = lauf !== null && lauf.phase !== "fertig";

  return (
    <>
      <section className="card-pad">
        <div className="flex items-start gap-3">
          <Schritt nr={2} fertig={Boolean(vorschlag)} />
          <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="section-title">{fragebogenOffen ? "Was suchst du?" : "Deine Jobwünsche"}</h2>
          {!fragebogenOffen && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setFragebogenOffen(true)} disabled={busy !== null || laeuft}>
              Wünsche ändern
            </button>
          )}
        </div>
        {fragebogenOffen ? (
          <p className="section-lead">Der Lebenslauf zeigt, was du gemacht hast — hier geht es darum, was als Nächstes kommen soll. Dauert 3–5 Minuten.</p>
        ) : (
          <WuenscheZusammenfassung a={initial.antworten || a.richtungen.length || a.eigeneRichtung ? a : null} vorschlag={vorschlag} />
        )}

        <div className={`mt-5 space-y-6 ${fragebogenOffen ? "" : "hidden"}`}>
          <fieldset>
            <legend className="field-label">Richtung</legend>
            {angebot.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {angebot.map((r) => (
                  <label key={r} className="choice flex w-full sm:w-auto">
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
            <span className="field-label">Was soll anders werden als im letzten Job?</span>
            <span className="field-hint">Die wichtigste Frage — Gehalt, Verantwortung, Arbeitszeit, Team, Sinn, Ruhe …</span>
            <textarea className={`${feld} min-h-20`} value={a.anders} onChange={(e) => setze("anders", e.target.value)} />
          </label>

          <fieldset>
            <legend className="field-label">Ebene</legend>
            <Auswahl
              name="ebene"
              wert={a.ebene}
              setze={(w) => setze("ebene", w)}
              optionen={[["gleich", "Gleiche Stufe"], ["hoch", "Ein Schritt hoch"], ["zurueck", "Auch ein Schritt zurück okay"], ["egal", "Egal"]]}
            />
          </fieldset>

          <fieldset>
            <legend className="field-label">Wo?</legend>
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
            <div className="mt-3 flex flex-wrap gap-2">
              {([["vor-ort", "Vor Ort"], ["hybrid", "Hybrid"], ["remote", "Remote"]] as const).map(([w, text]) => (
                <label key={w} className="choice">
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
            <legend className="field-label">Umfang</legend>
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
            <legend className="field-label">
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
            <legend className="field-label">No-Gos</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {NOGOS.map((n) => (
                <label key={n.key} className="choice">
                  <input type="checkbox" checked={a.nogos.includes(n.key)} onChange={() => umschalten("nogos", n.key)} />
                  {n.label}
                </label>
              ))}
            </div>
            <input className={feld} placeholder="Weitere No-Gos: Branchen, Firmen, Schichtdienst …" value={a.nogosText} onChange={(e) => setze("nogosText", e.target.value)} />
          </fieldset>

          <fieldset>
            <legend className="field-label">Englisch im Job</legend>
            <Auswahl
              name="englisch"
              wert={a.englisch}
              setze={(w) => setze("englisch", w)}
              optionen={[["ja", "Kein Problem"], ["etwas", "Etwas ist okay"], ["nein", "Lieber nicht"]]}
            />
          </fieldset>
        </div>

        {fragebogenOffen && (
          <div className="mt-6 flex flex-wrap gap-2">
            <button type="button" onClick={() => void senden("vorschlag")} disabled={busy !== null || laeuft} className={vorschlag ? "btn-secondary" : "btn-primary"}>
              {vorschlag ? "Neuen Vorschlag erstellen" : "Suchprofil vorschlagen"}
            </button>
            {vorschlag && (
              <button type="button" className="btn-ghost" onClick={() => setFragebogenOffen(false)} disabled={busy !== null}>
                Abbrechen
              </button>
            )}
          </div>
        )}
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
        {fehler && busy === null && !vorschlag && <p className="alert-error mt-3">{fehler}</p>}
          </div>
        </div>
      </section>

      {vorschlag && (
        <section className="card-pad">
          <div className="flex items-start gap-3">
          <Schritt nr={3} fertig={Boolean(bestaetigt)} />
          <div className="min-w-0 flex-1">
          <h2 className="section-title">Dein Suchprofil</h2>
          <p className="section-lead">
            Danach sucht nojobs jede Nacht. Prüfe, wonach und wo gesucht wird — und übernimm es.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <span className="field-label">Gesucht wird nach</span>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {begriffe
                  .split(/[,;\n]+/)
                  .map((b) => b.trim())
                  .filter(Boolean)
                  .map((b) => (
                    <span key={b} className="badge-neutral font-normal">
                      {b}
                    </span>
                  ))}
              </p>
            </div>
            <div>
              <span className="field-label">Ort und Umkreis</span>
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
            <details className="disclosure rounded-lg border border-rule bg-paper/50 p-3">
              <summary>
                <Icon name="chevronRight" size={14} className="chevron" />
                Erweiterte Einstellungen
                <span className="font-normal text-muted">· Suchbegriffe, Profiltext, Bewertungsregeln</span>
              </summary>
              <div className="mt-3 space-y-4">
                <label className="block">
                  <span className="field-label">Suchbegriffe</span>
                  <span className="field-hint">Mit Komma getrennt. Kurze Wörter finden mehr: „Erzieher“ findet auch „Erzieherin“.</span>
                  <textarea className={`${feld} min-h-16`} value={begriffe} onChange={(e) => setBegriffe(e.target.value)} />
                </label>
                <label className="block">
                  <span className="field-label">Profiltext</span>
                  <span className="field-hint">So beschreibt nojobs dich, wenn es Stellen einschätzt.</span>
                  <textarea className={`${feld} min-h-56 font-mono text-xs leading-relaxed`} value={vorschlag.profiltext} onChange={(e) => setzeV("profiltext", e.target.value)} />
                </label>
                <label className="block">
                  <span className="field-label">Bewertungsregeln</span>
                  <span className="field-hint">Wann eine Stelle „Bewerben“, „Anschauen“ oder „Ignorieren“ ist.</span>
                  <textarea className={`${feld} min-h-48 font-mono text-xs leading-relaxed`} value={vorschlag.kriterien} onChange={(e) => setzeV("kriterien", e.target.value)} />
                </label>
              </div>
            </details>
          </div>
          <button
            type="button"
            onClick={() => void senden("bestaetigen")}
            disabled={busy !== null || laeuft}
            className="btn-primary mt-5"
          >
            {bestaetigt ? "Änderungen übernehmen" : "Suchprofil übernehmen"}
          </button>
          {fehler && busy === null && <p className="alert-error mt-3">{fehler}</p>}
          {bestaetigt && (
            <div className="mt-4 rounded-lg border border-keep/25 bg-keep-soft/60 p-4">
              <p className="flex items-center gap-1.5 font-medium text-keep">
                <Icon name="circleCheck" size={16} /> Übernommen am {datum(bestaetigt)}
              </p>
              {lauf && <StartlaufAnzeige lauf={lauf} />}
              {!laeuft && (
                <p className="mt-2 text-muted">
                  Ab jetzt sucht nojobs jede Nacht mit diesem Profil, neue passende Stellen erscheinen morgens unter{" "}
                  <Link href="/inbox" className="link">
                    Meine Jobs
                  </Link>
                  . Freiwillig: Unter{" "}
                  <Link href="/label" className="link">
                    Stellen beurteilen
                  </Link>{" "}
                  ein paar Stellen einschätzen — so werden die Vorschläge schneller treffsicher.
                </p>
              )}
              {!lauf && (
                <button type="button" onClick={() => void startlauf()} className="btn-secondary mt-3">
                  <Icon name="refresh" size={15} />
                  Jetzt nach neuen Stellen suchen
                </button>
              )}
            </div>
          )}
          </div>
          </div>
        </section>
      )}
    </>
  );
}

const EBENE: Record<string, string> = { gleich: "Gleiche Stufe", hoch: "Ein Schritt hoch", zurueck: "Auch ein Schritt zurück okay", egal: "Ebene egal" };
const ARBEITSORT: Record<string, string> = { "vor-ort": "vor Ort", hybrid: "hybrid", remote: "remote" };
const UMFANG: Record<string, string> = { vollzeit: "Vollzeit", teilzeit: "Teilzeit", beides: "Voll- oder Teilzeit" };

/** Lesbare Zusammenfassung der Antworten — nur was ausgefüllt ist. */
function WuenscheZusammenfassung({ a, vorschlag }: { a: Antworten | null; vorschlag: Vorschlag | null }) {
  if (!a) {
    return (
      <p className="mt-2 text-muted">
        {vorschlag ? `Suche in ${vorschlag.ort || "deiner Region"} (${vorschlag.umkreis} km). ` : ""}Mit „Wünsche ändern“ beantwortest du ein paar Fragen, und nojobs
        schlägt das Suchprofil neu vor.
      </p>
    );
  }
  const richtung = [...a.richtungen, a.eigeneRichtung.trim()].filter(Boolean).join(", ");
  const zeilen: Array<[string, string]> = [
    ["Richtung", richtung],
    ["Ebene", EBENE[a.ebene] ?? ""],
    ["Wo", [a.ort && `${a.ort} · ${a.umkreis} km`, a.arbeitsort.map((x) => ARBEITSORT[x]).join(", ")].filter(Boolean).join(" · ")],
    ["Umfang", [UMFANG[a.umfang], a.umfang !== "vollzeit" && a.stunden ? `${a.stunden} Std.` : ""].filter(Boolean).join(", ")],
    ["Gehalt", a.gehalt ? `ab ${a.gehalt} € ${a.gehaltEinheit === "jahr" ? "im Jahr" : "im Monat"}` : ""],
    ["No-Gos", [...a.nogos.map((k) => NOGOS.find((n) => n.key === k)?.label ?? k), a.nogosText.trim()].filter(Boolean).join(", ")],
    ["Anders werden soll", a.anders.trim()],
  ];
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-[9rem_1fr]">
      {zeilen
        .filter(([, w]) => w)
        .map(([k, w]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="min-w-0">{w}</dd>
          </div>
        ))}
    </dl>
  );
}

type Startlauf = { phase: "suchen" | "bewerten" | "fertig"; gefunden: number; bewertet: number; offen: number; fehler: string | null };

/** Fortschritt des Startlaufs: echte Zahlen statt geschätzter Zeit. */
function StartlaufAnzeige({ lauf }: { lauf: Startlauf }) {
  const anteil =
    lauf.phase === "suchen" ? 0.15 : lauf.phase === "bewerten" ? 0.2 + 0.8 * (lauf.bewertet / Math.max(lauf.bewertet + lauf.offen, 1)) : 1;
  const text =
    lauf.phase === "suchen"
      ? `Stellen der letzten 14 Tage werden gesucht …${lauf.gefunden ? ` ${lauf.gefunden} neue gefunden` : ""}`
      : lauf.phase === "bewerten"
        ? lauf.bewertet === 0 && lauf.offen === 0
          ? "Stellen werden bewertet …"
          : `${lauf.bewertet} Stellen bewertet${lauf.offen ? `, ${lauf.offen} offen` : ""} …`
        : lauf.fehler
          ? null
          : `Fertig: ${lauf.gefunden} neue Stellen gefunden, ${lauf.bewertet} bewertet.`;
  return (
    <div className="mt-3" aria-live="polite">
      {lauf.phase !== "fertig" && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.round(anteil * 100)}%` }} />
        </div>
      )}
      {text && <p className="mt-2">{text}</p>}
      {lauf.phase !== "fertig" && <p className="text-xs text-muted">Seite bitte offen lassen — das dauert ein bis drei Minuten.</p>}
      {lauf.fehler && (
        <p className="mt-2 text-drop">
          Abgebrochen: {lauf.fehler}. Kein Problem — der Nachtlauf holt das nach.
        </p>
      )}
      {lauf.phase === "fertig" && !lauf.fehler && (
        <Link href="/inbox" className="btn-primary mt-3">
          Zur Inbox
        </Link>
      )}
    </div>
  );
}
