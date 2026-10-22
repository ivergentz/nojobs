"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GRUENDE_ANSCHAUEN, GRUENDE_IGNORE } from "@/lib/gruende";

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

const BUTTONS: Array<{ verdict: Verdict; label: string; key: string; tone: string }> = [
  { verdict: "must_apply", label: "🔥 Bewerben", key: "1", tone: "border-keep text-keep" },
  { verdict: "worth_reading", label: "👍 Anschauen", key: "2", tone: "border-ink text-ink" },
  { verdict: "ignore", label: "👎 Ignorieren", key: "3", tone: "border-drop text-drop" },
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
}: {
  jobs: LabelJob[];
  alreadyDone: number;
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
  const auswahl = pending === "ignore" ? GRUENDE_IGNORE : pending === "worth_reading" ? GRUENDE_ANSCHAUEN : [];

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
      <p className="mt-12 text-sm leading-relaxed">
        Nichts mehr offen. {alreadyDone} Stellen sind beurteilt.
      </p>
    );
  }

  if (!job) {
    return (
      <div className="mt-12">
        <p className="text-lg font-semibold">Durch.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {alreadyDone + history.length} Urteile liegen jetzt in der Datenbank. Damit lässt sich das
          Prompt gegen echte Daten prüfen statt gegen eine Vermutung.
        </p>
      </div>
    );
  }

  const long = job.description.length > PREVIEW_LENGTH;
  const shown = expanded ? job.description : job.description.slice(0, PREVIEW_LENGTH);
  const salary = formatSalary(job);

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between text-sm text-muted">
        <span className="tnum">
          {index + 1} von {jobs.length}
        </span>
        <span>{job.category}</span>
      </div>

      <article className="mt-6">
        <h2 className="text-lg font-semibold leading-snug">{job.title}</h2>
        <p className="mt-1 text-sm text-muted">
          {job.employer} · {job.place}
          {job.homeoffice ? ` · ${job.homeoffice}` : ""}
          {job.extent ? ` · ${job.extent}` : ""}
        </p>
        {job.due && <p className="mt-1 text-sm text-muted">Frist: {job.due}</p>}

        <p className="mt-3 text-sm">
          {salary ? (
            <span className="text-keep">{salary}</span>
          ) : (
            <span className="text-muted">Kein Gehalt angegeben</span>
          )}
        </p>

        <p className="mt-6 whitespace-pre-line text-sm leading-relaxed">
          {shown}
          {long && !expanded && "…"}
        </p>

        {long && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 text-sm underline underline-offset-4"
          >
            Ganze Beschreibung
          </button>
        )}

        {job.url && (
          <p className="mt-6 text-sm">
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Anzeige öffnen
            </a>
          </p>
        )}
      </article>

      <div className="sticky bottom-0 mt-10 border-t border-rule bg-paper py-5">
        {pending ? (
          <div>
            <p className="text-sm font-semibold">
              {pending === "ignore" ? "👎 Ignoriert — warum?" : "👍 Anschauen — warum nicht Bewerben?"}
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
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      an ? "border-ink bg-ink text-paper" : "border-rule text-ink hover:border-ink"
                    }`}
                  >
                    <span className={`mr-1.5 text-xs ${an ? "text-paper/70" : "text-muted"}`}>{i + 1}</span>
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
              className="mt-3 w-full rounded border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void abschliessen(true)}
                className="rounded border border-ink px-4 py-2 text-sm"
              >
                Weiter <span className="ml-1 text-xs text-muted">Enter</span>
              </button>
              <button
                type="button"
                onClick={() => void abschliessen(false)}
                className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4"
              >
                Ohne Grund <span className="text-xs">Esc</span>
              </button>
              <button
                type="button"
                onClick={() => void undo()}
                className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4"
              >
                Urteil ändern
              </button>
            </div>
          </div>
        ) : (
        <div className="flex flex-wrap gap-3">
          {BUTTONS.map((button) => (
            <button
              key={button.verdict}
              type="button"
              onClick={() => void decide(button.verdict)}
              className={`rounded border px-4 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${button.tone}`}
            >
              {button.label}
              <span className="ml-2 text-xs text-muted">{button.key}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => void undo()}
            disabled={history.length === 0}
            className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40 disabled:no-underline"
          >
            Zurück
          </button>
        </div>
        )}

        {failed && <p className="mt-3 text-sm text-drop">Fehler: {failed}</p>}
      </div>
    </div>
  );
}
