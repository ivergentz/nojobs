"use client";

import { useEffect, useRef, useState } from "react";
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
  /** Suchspur: "ki" (KI & Automation) oder "upgrade" (Career Upgrade). */
  spur: string | null;
  /** Grund, den die Firma bei der Absage genannt hat (fließt in die Bewertung ein). */
  absageNotiz: string | null;
};

/**
 * Feld für den Absagegrund. Nur wer etwas einträgt, speichert etwas — ein
 * leeres Feld bleibt folgenlos. Der Text fließt als Lernpunkt in die
 * Bewertung neuer Stellen ein.
 */
function AbsageGrund({ uuid, initial }: { uuid: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? "");
  const [gespeichert, setGespeichert] = useState(initial ?? "");
  const [stand, setStand] = useState<"" | "speichert" | "ok" | string>("");
  const laeuft = useRef(false);

  const speichern = async () => {
    // Blur und Klick feuern beide — nur einmal speichern.
    if (laeuft.current || text.trim() === gespeichert.trim()) return;
    laeuft.current = true;
    setStand("speichert");
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, absageNotiz: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStand(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setGespeichert(text);
      setStand("ok");
    } catch (error) {
      setStand(error instanceof Error ? error.message : String(error));
    } finally {
      laeuft.current = false;
    }
  };

  return (
    <div className="mt-4 rounded border border-rule px-3 py-2.5 text-sm">
      <label htmlFor={`absage-${uuid}`} className="text-xs text-muted">
        Hat die Firma einen Grund genannt? Optional — wird bei der Bewertung neuer Stellen beachtet.
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={`absage-${uuid}`}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setStand("");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") void speichern();
          }}
          onBlur={() => void speichern()}
          maxLength={500}
          placeholder="z. B. „andere hatten Produktverantwortung für KI-Bots im Livebetrieb“"
          className="w-full rounded border border-rule bg-paper px-2.5 py-1.5 outline-none focus:border-ink"
        />
        <button
          type="button"
          onClick={() => void speichern()}
          disabled={text.trim() === gespeichert.trim()}
          className="shrink-0 rounded border border-ink px-3 py-1.5 disabled:border-rule disabled:text-muted"
        >
          Speichern
        </button>
      </div>
      {stand === "ok" && <p className="mt-1 text-xs text-keep">Gespeichert — fließt ab dem nächsten Bewertungslauf ein.</p>}
      {stand && stand !== "ok" && stand !== "speichert" && <p className="mt-1 text-xs text-drop">{stand}</p>}
    </div>
  );
}

const SPUR_TEXT: Record<string, string> = { ki: "🤖 KI", upgrade: "⬆️ Career Upgrade" };

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
  const [spurFilter, setSpurFilter] = useState<"alle" | "ki" | "upgrade">("alle");
  const [suche, setSuche] = useState("");
  const sucheRef = useRef<HTMLInputElement>(null);

  // "/" springt ins Suchfeld (wie bei GitHub), Esc leert es.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (event.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        event.preventDefault();
        sucheRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
  // Suche: über ALLE Reiter, nach Firma, Titel und Ort. Umlaute und Groß-/Kleinschreibung egal.
  const norm = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss");
  const begriffe = norm(suche).split(/\s+/).filter(Boolean);
  const sucht = begriffe.length > 0;
  const trifft = (job: InboxJob) => {
    const text = norm(`${job.employer} ${job.title} ${job.place}`);
    return begriffe.every((wort) => text.includes(wort));
  };

  const imReiter = sucht ? jobs.filter(trifft) : jobs.filter((job) => statusVon(job) === reiter);
  const visible = imReiter.filter((job) => spurFilter === "alle" || (job.spur ?? "ki") === spurFilter);
  const hatUpgrade = imReiter.some((job) => job.spur === "upgrade");

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          ref={sucheRef}
          type="search"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSuche("");
          }}
          placeholder="Firma oder Stelle suchen … (Taste /)"
          aria-label="Bewerbungen durchsuchen"
          className="w-full rounded border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
        />
        {sucht && (
          <span className="tnum shrink-0 text-xs text-muted">
            {imReiter.length} Treffer in allen Reitern
          </span>
        )}
      </div>

      <nav
        aria-label="Status"
        className="-mx-6 flex gap-1 overflow-x-auto border-b border-rule px-6 text-sm"
      >
        {REITER.map((r) => {
          const aktiv = !sucht && r.key === reiter;
          const n = anzahl(r.key);
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                setSuche("");
                waehlen(r.key);
              }}
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

      {hatUpgrade && (
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {([
            ["alle", "Alle"],
            ["ki", "🤖 KI & Automation"],
            ["upgrade", "⬆️ Career Upgrade"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSpurFilter(key)}
              aria-pressed={spurFilter === key}
              className={`rounded-full border px-3 py-1 ${
                spurFilter === key ? "border-ink bg-ink text-paper" : "border-rule text-muted hover:text-ink"
              }`}
            >
              {label}
              <span className="tnum ml-1.5 text-xs opacity-70">
                {key === "alle" ? imReiter.length : imReiter.filter((job) => (job.spur ?? "ki") === key).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {failed && <p className="mt-4 text-sm text-drop">Nicht gespeichert: {failed}</p>}

      {visible.length === 0 && (
        <p className="mt-10 text-sm leading-relaxed">
          {sucht ? `Nichts gefunden für „${suche.trim()}“.` : LEER[reiter]}
        </p>
      )}

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
                  {job.spur === "upgrade" && (
                    <span className="ml-2 font-normal text-ink">· {SPUR_TEXT.upgrade}</span>
                  )}
                </span>
                <span className="text-right text-xs text-muted">
                  {sucht && (
                    <span className="mr-2 rounded border border-ink px-1.5 py-0.5 text-ink">
                      {REITER.find((r) => r.key === status)?.label ?? status}
                    </span>
                  )}
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

              {status === "absage" && <AbsageGrund uuid={job.uuid} initial={job.absageNotiz} />}

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
