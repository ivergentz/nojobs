"use client";

import { useState } from "react";

export type InboxJob = {
  uuid: string;
  source: string;
  title: string;
  originalTitle: string | null;
  employer: string;
  place: string;
  fit: string;
  confidence: string;
  summary: string;
  pros: string[];
  cons: string[];
  due: string | null;
  url: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryNote: string | null;
  status: string;
};

type Fx = { rate: number; date: string } | null;

const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

const LAND: Record<string, string> = { nav: "Norwegen", jobstream: "Schweden" };

const STATUS: Array<{ key: string; label: string }> = [
  { key: "interessant", label: "Vormerken" },
  { key: "beworben", label: "Beworben" },
  { key: "interview", label: "Interview" },
  { key: "abgelegt", label: "Ablegen" },
];

function salaryLine(job: InboxJob, fx: Fx): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return job.salaryNote;

  // Gehaltsangaben stammen bislang nur aus norwegischen Anzeigen (NOK).
  if (job.source !== "nav") return job.salaryNote;

  const low = job.salaryMin ?? (job.salaryMax as number);
  const high = job.salaryMax ?? (job.salaryMin as number);
  const range =
    low === high ? `${num.format(low)} NOK` : `${num.format(low)}–${num.format(high)} NOK`;
  if (!fx) return range;

  const eurLow = Math.round((low * fx.rate) / 1000) * 1000;
  const eurHigh = Math.round((high * fx.rate) / 1000) * 1000;
  const eur =
    eurLow === eurHigh
      ? `ca. ${num.format(eurLow)} €`
      : `ca. ${num.format(eurLow)}–${num.format(eurHigh)} €`;
  return `${range} · ${eur}`;
}

export default function InboxClient({ jobs, fx }: { jobs: InboxJob[]; fx: Fx }) {
  const [state, setState] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);

  const setStatus = async (uuid: string, status: string) => {
    setState((prev) => ({ ...prev, [uuid]: status }));
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFailed(body.error ?? `HTTP ${res.status}`);
      } else {
        setFailed(null);
      }
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    }
  };

  const visible = jobs.filter((job) => (state[job.uuid] ?? job.status) !== "abgelegt");

  if (visible.length === 0) {
    return (
      <p className="mt-12 text-sm leading-relaxed">
        Nichts Neues. Das ist bei zwei bis fünf passenden Stellen pro Woche der Normalfall, kein
        Fehler.
      </p>
    );
  }

  return (
    <div className="mt-4">
      {failed && <p className="mt-4 text-sm text-drop">Nicht gespeichert: {failed}</p>}

      <ul>
        {visible.map((job) => {
          const status = state[job.uuid] ?? job.status;
          const salary = salaryLine(job, fx);
          const hot = job.fit === "must_apply";

          return (
            <li key={job.uuid} className="border-b border-rule py-8">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className={hot ? "font-semibold text-keep" : "text-muted"}>
                  {hot ? "🔥 Bewerben" : "👍 Anschauen"}
                  {job.confidence === "low" && (
                    <span className="ml-2 font-normal text-muted">unsicher</span>
                  )}
                </span>
                <span className="text-muted">{LAND[job.source] ?? job.source}</span>
              </div>

              <h2 className="mt-2 text-lg font-semibold leading-snug">{job.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {job.employer} · {job.place}
                {job.due ? ` · Frist ${job.due}` : ""}
              </p>
              {salary && <p className="mt-1 text-sm text-keep">{salary}</p>}

              {job.summary && <p className="mt-4 text-sm leading-relaxed">{job.summary}</p>}

              {(job.pros.length > 0 || job.cons.length > 0) && (
                <div className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                  <ul className="space-y-1">
                    {job.pros.map((entry, index) => (
                      <li key={index} className="text-keep">
                        + {entry}
                      </li>
                    ))}
                  </ul>
                  <ul className="space-y-1">
                    {job.cons.map((entry, index) => (
                      <li key={index} className="text-drop">
                        − {entry}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => void setStatus(job.uuid, "beworben")}
                    className="rounded border border-keep px-4 py-2 text-keep"
                  >
                    Zur Bewerbung
                  </a>
                )}
                <a
                  href={`/application/${encodeURIComponent(job.uuid)}`}
                  className="rounded border border-ink px-4 py-2 text-sm"
                >
                  Unterlagen
                </a>
                {STATUS.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => void setStatus(job.uuid, entry.key)}
                    className={`rounded px-3 py-2 underline underline-offset-4 ${
                      status === entry.key ? "font-semibold" : "text-muted"
                    }`}
                  >
                    {entry.label}
                  </button>
                ))}
              </div>

              {status !== "neu" && (
                <p className="mt-3 text-xs text-muted">Status: {status}</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
