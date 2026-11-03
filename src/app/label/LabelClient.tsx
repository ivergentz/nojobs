"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GRUENDE_ANSCHAUEN, GRUENDE_IGNORE, type Grund } from "@/lib/gruende";
import Icon, { type IconName } from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Bausteine";

export type LabelJob = {
  uuid: string;
  title: string;
  employer: string;
  place: string;
  category: string;
  homeoffice: string | null;
  extent: string | null;
  due: string | null;
  url: string | null;
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryNote: string | null;
};

type Verdict = "must_apply" | "worth_reading" | "ignore";

const BUTTONS: Array<{ verdict: Verdict; label: string; key: string; tone: string; icon: IconName }> = [
  { verdict: "must_apply", label: "Bewerben", key: "1", tone: "border-keep/40 bg-keep-soft text-keep hover:border-keep", icon: "flame" },
  { verdict: "worth_reading", label: "Anschauen", key: "2", tone: "border-rule bg-surface text-ink hover:border-ink/40", icon: "eye" },
  { verdict: "ignore", label: "Ignorieren", key: "3", tone: "border-drop/30 bg-drop-soft text-drop hover:border-drop", icon: "ban" },
];

const PREVIEW_LENGTH = 900;

const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

function formatSalary(job: LabelJob): string | null {
  const { salaryMin, salaryMax, salaryNote } = job;
  if (salaryMin === null && salaryMax === null) return salaryNote;
  const low = salaryMin ?? (salaryMax as number);
  const high = salaryMax ?? (salaryMin as number);
  return low === high ? `${num.format(low)} €` : `${num.format(low)}–${num.format(high)} €`;
}

export default function LabelClient({
  jobs,
  alreadyDone,
  gruendeIgnore = GRUENDE_IGNORE,
  gruendeAnschauen = GRUENDE_ANSCHAUEN,
}: {
  jobs: LabelJob[];
  alreadyDone: number;
  /** Schritt 2.6: weitere Profile bekommen allgemeine Begründungen. Ohne Angabe: deine. */
  gruendeIgnore?: Grund[];
  gruendeAnschauen?: Grund[];
}) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  // Nach "Anschauen" oder "Ignorieren": kurz fragen, warum.
  const [pending, setPending] = useState<Verdict | null>(null);
  const [gruende, setGruende] = useState<string[]>([]);
  const [notiz, setNotiz] = useState("");
  const notizRef = useRef<HTMLInputElement>(null);

  const job = jobs[index];
  const auswahl = pending === "ignore" ? gruendeIgnore : pending === "worth_reading" ? gruendeAnschauen : [];

  const save = useCallback(async (uuid: string, verdict: Verdict | null, extra?: { gruende: string[]; notiz: string }) => {
    try {
      const res = await fetch("/api/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, label: verdict, ...(extra ?? {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFailed(body.error ?? `HTTP ${res.status}`);
        return false;
      }
      // Urteil gespeichert; die Begründung evtl. nicht (SQL fehlt) — dann Hinweis.
      const ok = await res.json().catch(() => ({}));
      setFailed(ok.warnung ?? null);
      return true;
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, []);

  const weiter = useCallback(() => {
    if (!job) return;
    setHistory((prev) => [...prev, job.uuid]);
    setExpanded(false);
    setPending(null);
    setGruende([]);
    setNotiz("");
    setIndex((prev) => prev + 1);
  }, [job]);

  const decide = useCallback(
    async (verdict: Verdict) => {
      if (!job) return;
      // Das Urteil wird sofort gespeichert — die Begründung ist ein Zusatz.
      const ok = await save(job.uuid, verdict);
      if (!ok) return;
      if (verdict === "must_apply") weiter();
      else setPending(verdict);
    },
    [job, save, weiter]
  );

  /** Begründung speichern (oder überspringen) und zur nächsten Stelle. */
  const abschliessen = useCallback(
    async (mitGrund: boolean) => {
      if (!job || !pending) return;
      if (mitGrund && (gruende.length > 0 || notiz.trim())) {
        const ok = await save(job.uuid, pending, { gruende, notiz });
        if (!ok) return;
      }
      weiter();
    },
    [job, pending, gruende, notiz, save, weiter]
  );

  const toggle = useCallback((key: string) => {
    setGruende((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }, []);

  const undo = useCallback(async () => {
    // Steht gerade die Begründungsfrage offen: Urteil dieser Stelle aufheben.
    if (pending && job) {
      const ok = await save(job.uuid, null);
      if (!ok) return;
      setPending(null);
      setGruende([]);
      setNotiz("");
      return;
    }
    const last = history[history.length - 1];
    if (!last) return;
    const ok = await save(last, null);
    if (!ok) return;
    setHistory((prev) => prev.slice(0, -1));
    setExpanded(false);
    setIndex((prev) => Math.max(0, prev - 1));
  }, [history, save, pending, job]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const imFeld = (event.target as HTMLElement | null)?.tagName === "INPUT";

      if (pending) {
        if (event.key === "Enter") {
          event.preventDefault();
          void abschliessen(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          void abschliessen(false);
        } else if (!imFeld && /^[1-9]$/.test(event.key)) {
          const grund = auswahl[Number(event.key) - 1];
          if (grund) {
            event.preventDefault();
            toggle(grund.key);
          }
        } else if (!imFeld && event.key === "n") {
          event.preventDefault();
          notizRef.current?.focus();
        } else if (!imFeld && event.key === "Backspace") {
          event.preventDefault();
          void undo();
        }
        return;
      }

      if (imFeld) return;
      const match = BUTTONS.find((button) => button.key === event.key);
      if (match) {
        event.preventDefault();
        void decide(match.verdict);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        void undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, undo, pending, abschliessen, auswahl, toggle]);

  if (jobs.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState icon="circleCheck" titel="Nichts mehr offen.">
          {alreadyDone} Stellen sind beurteilt.
        </EmptyState>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="mt-8">
        <EmptyState icon="circleCheck" titel="Durch.">
          {alreadyDone + history.length} Urteile liegen jetzt in der Datenbank. Damit lässt sich das Prompt gegen echte Daten prüfen statt
          gegen eine Vermutung.
        </EmptyState>
      </div>
    );
  }

  const long = job.description.length > PREVIEW_LENGTH;
  const shown = expanded ? job.description : job.description.slice(0, PREVIEW_LENGTH);
  const salary = formatSalary(job);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm text-muted">
        <span className="tnum font-medium text-ink">
          {index + 1} <span className="font-normal text-muted">von {jobs.length}</span>
        </span>
        <span className="badge-neutral">{job.category}</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-subtle" aria-hidden>
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(index / Math.max(jobs.length, 1)) * 100}%` }} />
      </div>

      <article className="card-pad mt-5">
        <h2 className="text-[1.0625rem] font-semibold leading-snug tracking-tight">{job.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {job.employer} · {job.place}
          {job.homeoffice ? ` · ${job.homeoffice}` : ""}
          {job.extent ? ` · ${job.extent}` : ""}
        </p>
        {job.due && <p className="mt-1 text-sm text-muted">Frist: {job.due}</p>}

        <p className="mt-3 text-sm">
          {salary ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-keep">
              <Icon name="euro" size={14} />
              {salary}
            </span>
          ) : (
            <span className="text-muted">Kein Gehalt angegeben</span>
          )}
        </p>

        <p className="mt-5 whitespace-pre-line border-t border-rule pt-5 text-sm leading-relaxed text-ink/90">
          {shown}
          {long && !expanded && "…"}
        </p>

        {long && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="link mt-3 text-sm"
          >
            Ganze Beschreibung
          </button>
        )}

        {job.url && (
          <p className="mt-5">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              Anzeige öffnen
              <Icon name="external" size={14} />
            </a>
          </p>
        )}
      </article>

      <div className="card sticky bottom-3 z-10 mt-5 p-4 shadow-raised">
        {pending ? (
          <div>
            <p className="text-sm font-semibold">
              {pending === "ignore" ? "Ignoriert — warum?" : "Anschauen — warum nicht Bewerben?"}
              <span className="ml-2 font-normal text-muted">Mehrfachauswahl, optional</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {auswahl.map((grund, i) => {
                const an = gruende.includes(grund.key);
                return (
                  <button
                    key={grund.key}
                    type="button"
                    onClick={() => toggle(grund.key)}
                    aria-pressed={an}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      an ? "border-brand bg-brand text-white" : "border-rule bg-surface text-ink hover:border-ink/40"
                    }`}
                  >
                    <span className={`mr-1.5 text-xs ${an ? "text-white/70" : "text-muted"}`}>{i + 1}</span>
                    {grund.label}
                  </button>
                );
              })}
            </div>
            <input
              ref={notizRef}
              value={notiz}
              onChange={(event) => setNotiz(event.target.value)}
              placeholder="Notiz (optional, Taste n) — z. B. „nur 2 Tage Homeoffice“"
              maxLength={300}
              className="field mt-3"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void abschliessen(true)}
                className="btn-primary"
              >
                Weiter <span className="text-xs text-white/70">Enter</span>
              </button>
              <button
                type="button"
                onClick={() => void abschliessen(false)}
                className="btn-ghost"
              >
                Ohne Grund <span className="text-xs">Esc</span>
              </button>
              <button
                type="button"
                onClick={() => void undo()}
                className="btn-ghost"
              >
                Urteil ändern
              </button>
            </div>
          </div>
        ) : (
        <div className="flex flex-wrap items-center gap-2">
          {BUTTONS.map((button) => (
            <button
              key={button.verdict}
              type="button"
              onClick={() => void decide(button.verdict)}
              className={`btn border ${button.tone}`}
            >
              <Icon name={button.icon} size={15} />
              {button.label}
              <kbd className="rounded border border-current/20 px-1 text-2xs opacity-60">{button.key}</kbd>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void undo()}
            disabled={history.length === 0}
            className="btn-ghost ml-auto"
          >
            Zurück
          </button>
        </div>
        )}

        {failed && <p className="mt-3 text-sm text-drop" role="alert">Fehler: {failed}</p>}
      </div>
    </div>
  );
}
