"use client";

import { useEffect, useState } from "react";

/**
 * Fortschrittsbalken für alles, was ein paar Sekunden bis Minuten dauert
 * (Claude schreibt, Websuche, PDF wird gesetzt).
 *
 * Der Server meldet keinen echten Fortschritt — der Balken läuft deshalb nach
 * einer Schätzung: schnell am Anfang, dann langsamer, und bleibt unter 95 %,
 * bis die Antwort wirklich da ist. Dazu die Schritt-Beschreibung und die
 * vergangene Zeit, damit niemand denkt, der Browser hänge.
 */
export type Schritt = { ab: number; text: string };

export function fortschrittBei(sekunden: number, dauer: number): number {
  if (sekunden <= 0) return 0;
  const tau = Math.max(dauer, 1) / 2.2;
  return Math.min(0.95, 1 - Math.exp(-sekunden / tau));
}

export function schrittBei(sekunden: number, schritte: Schritt[]): string {
  let text = schritte[0]?.text ?? "Wird erstellt …";
  for (const s of schritte) if (sekunden >= s.ab) text = s.text;
  return text;
}

function zeit(sekunden: number): string {
  const m = Math.floor(sekunden / 60);
  const s = Math.floor(sekunden % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")} min` : `${s} s`;
}

export default function Fortschritt({
  aktiv,
  dauer,
  schritte,
  hinweis,
}: {
  aktiv: boolean;
  /** geschätzte übliche Dauer in Sekunden */
  dauer: number;
  schritte: Schritt[];
  /** z. B. „Seite bitte offen lassen“ */
  hinweis?: string;
}) {
  const [start, setStart] = useState<number | null>(null);
  const [jetzt, setJetzt] = useState(0);

  useEffect(() => {
    if (!aktiv) {
      setStart(null);
      return;
    }
    const beginn = Date.now();
    setStart(beginn);
    setJetzt(beginn);
    const takt = setInterval(() => setJetzt(Date.now()), 250);
    return () => clearInterval(takt);
  }, [aktiv]);

  if (!aktiv || start === null) return null;

  const sekunden = Math.max(0, (jetzt - start) / 1000);
  const anteil = fortschrittBei(sekunden, dauer);
  const lang = sekunden > dauer * 1.6;

  return (
    <div className="mt-4 max-w-md" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span>{schrittBei(sekunden, schritte)}</span>
        <span className="tnum shrink-0 text-xs text-muted">
          {zeit(sekunden)} · meist ~{zeit(dauer)}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rule"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(anteil * 100)}
      >
        <div className="h-full rounded-full bg-keep transition-[width] duration-300 ease-out" style={{ width: `${anteil * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {lang ? "Dauert länger als üblich — läuft aber noch. " : ""}
        {hinweis ?? "Seite bitte offen lassen."}
      </p>
    </div>
  );
}
