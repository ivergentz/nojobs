"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LabelJob = {
  uuid: string;
  title: string;
  employer: string;
  place: string;
  category: string;
  extent: string | null;
  due: string | null;
  url: string | null;
  description: string;
  titleDe: string | null;
  descriptionDe: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryNote: string | null;
  translated: boolean;
};

type Verdict = "must_apply" | "worth_reading" | "ignore";
type Fx = { rate: number; date: string } | null;

const BUTTONS: Array<{ verdict: Verdict; label: string; key: string; tone: string }> = [
  { verdict: "must_apply", label: "🔥 Bewerben", key: "1", tone: "border-keep text-keep" },
  { verdict: "worth_reading", label: "👍 Anschauen", key: "2", tone: "border-ink text-ink" },
  { verdict: "ignore", label: "👎 Ignorieren", key: "3", tone: "border-drop text-drop" },
];

const PREVIEW_LENGTH = 900;

const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

function formatSalary(job: LabelJob, fx: Fx): string | null {
  const { salaryMin, salaryMax, salaryNote } = job;
  if (salaryMin === null && salaryMax === null) return salaryNote;

  const low = salaryMin ?? (salaryMax as number);
  const high = salaryMax ?? (salaryMin as number);
  const range =
    low === high ? `${num.format(low)} NOK` : `${num.format(low)}–${num.format(high)} NOK`;

  if (!fx) return salaryNote ? `${range} · ${salaryNote}` : range;

  const eurLow = Math.round((low * fx.rate) / 1000) * 1000;
  const eurHigh = Math.round((high * fx.rate) / 1000) * 1000;
  const eur =
    eurLow === eurHigh
      ? `ca. ${num.format(eurLow)} €`
      : `ca. ${num.format(eurLow)}–${num.format(eurHigh)} €`;

  return salaryNote ? `${range} · ${eur} · ${salaryNote}` : `${range} · ${eur}`;
}

export default function LabelClient({
  jobs,
  alreadyDone,
  fx,
}: {
  jobs: LabelJob[];
  alreadyDone: number;
  fx: Fx;
}) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [german, setGerman] = useState(true);

  const [fresh, setFresh] = useState<Record<string, Partial<LabelJob>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const requested = useRef<Set<string>>(new Set());

  const base = jobs[index];
  const job = base ? { ...base, ...(fresh[base.uuid] ?? {}) } : undefined;

  const translate = useCallback(async (uuid: string) => {
    if (requested.current.has(uuid)) return;
    requested.current.add(uuid);
    setBusy(uuid);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFailed(body.error ?? `Übersetzung: HTTP ${res.status}`);
        requested.current.delete(uuid);
        return;
      }
      setFresh((prev) => ({
        ...prev,
        [uuid]: {
          titleDe: body.title_de,
          descriptionDe: body.description_de,
          salaryMin: body.salary_min_nok,
          salaryMax: body.salary_max_nok,
          salaryNote: body.salary_note,
          translated: true,
        },
      }));
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
      requested.current.delete(uuid);
    } finally {
      setBusy((current) => (current === uuid ? null : current));
    }
  }, []);

  // Aktuelle Anzeige übersetzen, die nächste im Hintergrund vorladen —
  // sonst wartet man bei jedem Klick auf das Modell.
  useEffect(() => {
    const current = jobs[index];
    if (current && !current.translated && !fresh[current.uuid]) {
      void translate(current.uuid);
    }
    const next = jobs[index + 1];
    if (next && !next.translated && !fresh[next.uuid]) {
      void translate(next.uuid);
    }
  }, [index, jobs, fresh, translate]);

  const save = useCallback(async (uuid: string, verdict: Verdict | null) => {
    try {
      const res = await fetch("/api/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, label: verdict }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFailed(body.error ?? `HTTP ${res.status}`);
        return false;
      }
      setFailed(null);
      return true;
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
      return false;
    }
  }, []);

  const decide = useCallback(
    async (verdict: Verdict) => {
      if (!job) return;
      const ok = await save(job.uuid, verdict);
      if (!ok) return;
      setHistory((prev) => [...prev, job.uuid]);
      setExpanded(false);
      setIndex((prev) => prev + 1);
    },
    [job, save]
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last) return;
    const ok = await save(last, null);
    if (!ok) return;
    setHistory((prev) => prev.slice(0, -1));
    setExpanded(false);
    setIndex((prev) => Math.max(0, prev - 1));
  }, [history, save]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const match = BUTTONS.find((button) => button.key === event.key);
      if (match) {
        event.preventDefault();
        void decide(match.verdict);
        return;
      }
      if (event.key.toLowerCase() === "o") {
        event.preventDefault();
        setGerman((prev) => !prev);
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        void undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, undo]);

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

  const translating = busy === job.uuid && !job.descriptionDe;
  const showGerman = german && Boolean(job.descriptionDe);
  const title = showGerman ? job.titleDe ?? job.title : job.title;
  const body = showGerman ? job.descriptionDe ?? job.description : job.description;
  const long = body.length > PREVIEW_LENGTH;
  const shown = expanded ? body : body.slice(0, PREVIEW_LENGTH);
  const salary = formatSalary(job, fx);

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between text-sm text-muted">
        <span className="tnum">
          {index + 1} von {jobs.length}
        </span>
        <span>{job.category}</span>
      </div>

      <article className="mt-6">
        <h2 className="text-lg font-semibold leading-snug">{title}</h2>
        <p className="mt-1 text-sm text-muted">
          {job.employer} · {job.place}
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

        <div className="mt-6 flex items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => setGerman((prev) => !prev)}
            disabled={!job.descriptionDe}
            className="underline underline-offset-4 disabled:no-underline disabled:opacity-40"
          >
            {showGerman ? "Original anzeigen" : "Übersetzung anzeigen"}
            <span className="ml-2 text-xs text-muted">O</span>
          </button>
          {translating && <span className="text-muted">wird übersetzt …</span>}
        </div>

        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed">
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
              Original bei NAV öffnen
            </a>
          </p>
        )}
      </article>

      <div className="sticky bottom-0 mt-10 border-t border-rule bg-paper py-5">
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

        {failed && <p className="mt-3 text-sm text-drop">Fehler: {failed}</p>}
        {fx && (
          <p className="mt-3 text-xs text-muted">
            Kurs {fx.rate.toFixed(4)} EUR/NOK, EZB-Referenz vom {fx.date}
          </p>
        )}
      </div>
    </div>
  );
}
