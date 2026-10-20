"use client";

import { useEffect, useState } from "react";
import type { FruehereBewerbung } from "@/lib/firma";
import type { BesuchsSumme } from "@/lib/tracking";

export type InboxJob = {
  uuid: string;
  title: string;
  employer: string;
  place: string;
  homeoffice: string | null;
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
  published: string | null;
  quelle: string;
  frueher: FruehereBewerbung[];
  besuche: BesuchsSumme | null;
};

const STATUS_TEXT: Record<string, string> = {
  beworben: "beworben",
  interview: "im Interview",
  absage: "Absage erhalten",
};

function Warnung({ frueher }: { frueher: FruehereBewerbung[] }) {
  if (!frueher.length) return null;
  const gleiche = frueher.find((f) => f.gleicheStelle);
  return (
    <div className="mt-4 rounded border border-drop/40 bg-drop/5 px-3 py-2 text-sm text-drop">
      <p className="font-semibold">
        {gleiche ? "⚠️ Auf diese Stelle hast du dich schon beworben" : "⚠️ Achtung – bereits eine Bewerbung bei diesem Unternehmen"}
      </p>
      <ul className="mt-1 space-y-0.5">
        {frueher.map((f) => (
          <li key={f.uuid}>
            {f.title} — {STATUS_TEXT[f.status] ?? f.status}
            {f.datum ? ` am ${datum(f.datum)}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

const STATUS: Array<{ key: string; label: string }> = [
  { key: "interessant", label: "Vormerken" },
  { key: "beworben", label: "Beworben" },
  { key: "interview", label: "Interview" },
  { key: "absage", label: "Absage" },
  { key: "abgelegt", label: "Ablegen" },
];

/** Reiter: jeder Status hat seine eigene Liste. */
const REITER: Array<{ key: string; label: string }> = [
  { key: "neu", label: "Neu" },
  { key: "interessant", label: "Vorgemerkt" },
  { key: "beworben", label: "Beworben" },
  { key: "interview", label: "Interview" },
  { key: "absage", label: "Absage" },
  { key: "abgelegt", label: "Abgelegt" },
];

const LEER: Record<string, string> = {
  neu: "Nichts Neues. Die Steuerung zeigt, ob Import und Bewertung gelaufen sind.",
  interessant: "Noch nichts vorgemerkt.",
  beworben: "Noch keine Bewerbung eingetragen.",
  interview: "Noch keine Interviews — kommt.",
  absage: "Keine Absagen eingetragen.",
  abgelegt: "Nichts abgelegt.",
};

function salaryLine(job: InboxJob): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return job.salaryNote;
  const low = job.salaryMin ?? (job.salaryMax as number);
  const high = job.salaryMax ?? (job.salaryMin as number);
  return low === high ? `${num.format(low)} €` : `${num.format(low)}–${num.format(high)} €`;
}

function datum(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

export default function InboxClient({ jobs }: { jobs: InboxJob[] }) {
  const [state, setState] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const [reiter, setReiter] = useState("neu");

  // Gewählten Reiter in der Adresse merken (#beworben), damit Neuladen ihn behält.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (REITER.some((r) => r.key === hash)) setReiter(hash);
  }, []);
  const waehlen = (key: string) => {
    setReiter(key);
    window.history.replaceState(null, "", key === "neu" ? window.location.pathname : `#${key}`);
  };

  const setStatus = async (uuid: string, status: string) => {
    const previous = state[uuid];
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
        // Anzeige zurückdrehen, sonst sieht es gespeichert aus, ist es aber nicht.
        setState((prev) => {
          const next = { ...prev };
          if (previous === undefined) delete next[uuid];
          else next[uuid] = previous;
          return next;
        });
      } else {
        setFailed(null);
      }
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    }
  };

  const statusVon = (job: InboxJob) => state[job.uuid] ?? job.status;
  const anzahl = (key: string) => jobs.filter((job) => statusVon(job) === key).length;
  const visible = jobs.filter((job) => statusVon(job) === reiter);

  return (
    <div className="mt-6">
      <nav
        aria-label="Status"
        className="-mx-6 flex gap-1 overflow-x-auto border-b border-rule px-6 text-sm"
      >
        {REITER.map((r) => {
          const aktiv = r.key === reiter;
          const n = anzahl(r.key);
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => waehlen(r.key)}
              aria-current={aktiv ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 ${
                aktiv ? "border-ink font-semibold" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {r.label}
              <span className="tnum ml-1.5 text-xs text-muted">{n}</span>
            </button>
          );
        })}
      </nav>

      {failed && <p className="mt-4 text-sm text-drop">Nicht gespeichert: {failed}</p>}

      {visible.length === 0 && <p className="mt-10 text-sm leading-relaxed">{LEER[reiter]}</p>}

      <ul>
        {visible.map((job) => {
          const status = state[job.uuid] ?? job.status;
          const salary = salaryLine(job);
          const hot = job.fit === "must_apply";
          const seit = datum(job.published);

          return (
            <li key={job.uuid} className="border-b border-rule py-8">
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className={hot ? "font-semibold text-keep" : "text-muted"}>
                  {hot ? "🔥 Bewerben" : "👍 Anschauen"}
                  {job.confidence === "low" && (
                    <span className="ml-2 font-normal text-muted">unsicher</span>
                  )}
                </span>
                <span className="text-right text-xs text-muted">
                  {job.quelle}
                  {seit ? <span className="tnum"> · seit {seit}</span> : null}
                </span>
              </div>

              <h2 className="mt-2 text-lg font-semibold leading-snug">{job.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {job.employer} · {job.place}
                {job.homeoffice ? ` · ${job.homeoffice}` : ""}
                {job.due ? ` · Frist ${job.due}` : ""}
              </p>
              {salary && <p className="mt-1 text-sm text-keep">{salary}</p>}

              {(status === "neu" || status === "interessant") && <Warnung frueher={job.frueher} />}

              {["beworben", "interview", "absage"].includes(status) && (
                <p className={`mt-3 text-sm ${job.besuche ? "font-semibold text-keep" : "text-muted"}`}>
                  {job.besuche
                    ? `👀 Seite ${job.besuche.anzahl}× geöffnet · zuletzt ${datum(job.besuche.zuletzt)}${
                        job.besuche.cv ? " · Lebenslauf angesehen" : ""
                      }`
                    : "Seite noch nicht geöffnet"}
                </p>
              )}

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
                  // Öffnet nur die Anzeige. Vorher setzte der Klick automatisch
                  // "beworben" — auch wenn man sich die Stelle nur ansehen wollte.
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-keep px-4 py-2 text-keep"
                  >
                    Anzeige öffnen
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
                <button
                  type="button"
                  onClick={() => void setStatus(job.uuid, "neu")}
                  className="mt-3 text-xs text-muted underline underline-offset-4"
                >
                  zurück zu „Neu“
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
