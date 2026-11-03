"use client";

import { useEffect, useId, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { EmptyState } from "@/components/ui/Bausteine";
import type { FruehereBewerbung } from "@/lib/firma";
import type { BesuchsSumme } from "@/lib/tracking";
import type { Grund } from "@/lib/gruende";

export type AblageGruende = { passtNicht: Grund[]; passtAber: Grund[] };
type Ablage = { gruende: string[]; notiz: string };

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
    <div className="mt-4 rounded border border-rule bg-subtle/50 px-3 py-3 text-sm">
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
          className="field mt-0"
        />
        <button type="button" onClick={() => void speichern()} disabled={text.trim() === gespeichert.trim()} className="btn-secondary shrink-0">
          Speichern
        </button>
      </div>
      {stand === "speichert" && <p className="mt-1.5 text-xs text-muted">Wird gespeichert …</p>}
      {stand === "ok" && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-keep">
          <Icon name="check" size={13} /> Gespeichert — fließt ab dem nächsten Bewertungslauf ein.
        </p>
      )}
      {stand && stand !== "ok" && stand !== "speichert" && <p className="mt-1.5 text-xs text-drop">{stand}</p>}
    </div>
  );
}

const SPUR_TEXT: Record<string, string> = { ki: "KI & Automation", upgrade: "Career Upgrade" };

const STATUS_TEXT: Record<string, string> = {
  beworben: "beworben",
  interview: "im Interview",
  absage: "Absage erhalten",
};

function Warnung({ frueher }: { frueher: FruehereBewerbung[] }) {
  if (!frueher.length) return null;
  const gleiche = frueher.find((f) => f.gleicheStelle);
  return (
    <div className="mt-4 flex gap-2.5 rounded border border-warn/25 bg-warn-soft px-3 py-2.5 text-sm">
      <Icon name="alert" size={16} className="mt-0.5 text-warn" />
      <div>
        <p className="font-medium">
          {gleiche ? "Auf diese Stelle hast du dich schon beworben" : "Achtung – bereits eine Bewerbung bei diesem Unternehmen"}
        </p>
        <ul className="mt-0.5 space-y-0.5 text-muted">
          {frueher.map((f) => (
            <li key={f.uuid}>
              {f.title} — {STATUS_TEXT[f.status] ?? f.status}
              {f.datum ? ` am ${datum(f.datum)}` : ""}
            </li>
          ))}
        </ul>
      </div>
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

export default function InboxClient({
  jobs,
  mitUnterlagen = true,
  suchHinweis = !mitUnterlagen,
  ablageGruende,
}: {
  jobs: InboxJob[];
  mitUnterlagen?: boolean;
  /** Leere Liste „Neu“: auf die Suche unter „Mein Profil“ hinweisen (weitere Profile). */
  suchHinweis?: boolean;
  ablageGruende?: AblageGruende;
}) {
  const [state, setState] = useState<Record<string, string>>({});
  // Stelle, für die gerade der Grund fürs Ablegen abgefragt wird
  const [ablegen, setAblegen] = useState<string | null>(null);
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

  const setStatus = async (uuid: string, status: string, ablage?: Ablage) => {
    const previous = state[uuid];
    setState((prev) => ({ ...prev, [uuid]: status }));
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ablage ? { uuid, status, ablage } : { uuid, status }),
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
        const body = await res.json().catch(() => ({}));
        setFailed(body.warnung ?? null);
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
    <div>
      {/* Suche */}
      <div className="relative">
        <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={sucheRef}
          type="search"
          value={suche}
          onChange={(event) => setSuche(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setSuche("");
          }}
          placeholder="Firma oder Stelle suchen …"
          aria-label="Bewerbungen durchsuchen"
          className="field mt-0 py-2.5 pl-9 pr-16"
        />
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-rule bg-subtle px-1.5 text-2xs text-muted sm:block">
          /
        </kbd>
      </div>
      {sucht && (
        <p className="tnum mt-2 text-xs text-muted" aria-live="polite">
          {imReiter.length} Treffer in allen Reitern
        </p>
      )}

      {/* Status: Neu → Bewerbungs-Workflow */}
      <nav aria-label="Status" className="tabs mt-4">
        {REITER.map((r, i) => {
          const aktiv = !sucht && r.key === reiter;
          const n = anzahl(r.key);
          return (
            <span key={r.key} className="flex shrink-0 items-center">
              {i === 2 && <span aria-hidden className="mx-1 h-4 w-px bg-rule" />}
              <button
                type="button"
                onClick={() => {
                  setSuche("");
                  waehlen(r.key);
                }}
                aria-current={aktiv ? "page" : undefined}
                className={`tab ${aktiv ? "tab-active" : ""}`}
              >
                {r.label}
                <span className={`tnum rounded-full px-1.5 text-2xs ${aktiv ? "bg-brand-soft text-brand-strong" : "text-muted"}`}>{n}</span>
              </button>
            </span>
          );
        })}
      </nav>

      {hatUpgrade && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm" role="group" aria-label="Suchrichtung">
          {([
            ["alle", "Alle", null],
            ["ki", "KI & Automation", "sparkles"],
            ["upgrade", "Career Upgrade", "trendingUp"],
          ] as const).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSpurFilter(key)}
              aria-pressed={spurFilter === key}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition ${
                spurFilter === key ? "border-brand bg-brand text-white" : "border-rule bg-surface text-muted hover:border-ink/25 hover:text-ink"
              }`}
            >
              {icon && <Icon name={icon} size={14} />}
              {label}
              <span className="tnum text-xs opacity-75">
                {key === "alle" ? imReiter.length : imReiter.filter((job) => (job.spur ?? "ki") === key).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {failed && (
        <div className="alert-error mt-4" role="alert">
          <Icon name="circleX" size={18} className="mt-0.5 text-drop" />
          <span>Nicht gespeichert: {failed}</span>
        </div>
      )}

      {visible.length === 0 && (
        <div className="mt-6">
          <EmptyState icon={sucht ? "search" : "inbox"} titel={sucht ? `Nichts gefunden für „${suche.trim()}“.` : "Hier ist gerade nichts."}>
            {sucht
              ? "Gesucht wird in Firma, Titel und Ort — über alle Reiter."
              : suchHinweis && reiter === "neu"
                ? "Nichts Neues. Neue Stellen kommen jeden Morgen — oder unter „Mein Profil“ jetzt nach neuen Stellen suchen."
                : LEER[reiter]}
          </EmptyState>
        </div>
      )}

      <ul className="mt-5 space-y-4">
        {visible.map((job) => {
          const status = state[job.uuid] ?? job.status;
          const salary = salaryLine(job);
          const hot = job.fit === "must_apply";
          const seit = datum(job.published);
          const bewerbung = ["beworben", "interview", "absage"].includes(status);

          return (
            <li key={job.uuid} className={`card relative focus-within:z-10 has-[[aria-expanded=true]]:z-20 ${hot && status === "neu" ? "border-keep/30" : ""}`}>
              <article className="p-4 sm:p-5">
                {/* Ebene 1: Empfehlung, Titel, Firma, Gehalt */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {hot ? (
                      <span className="badge-positive">
                        <Icon name="flame" size={13} /> Bewerben
                      </span>
                    ) : (
                      <span className="badge-neutral">
                        <Icon name="eye" size={13} /> Anschauen
                      </span>
                    )}
                    {job.confidence === "low" && <span className="badge-warn">unsicher</span>}
                    {job.spur === "upgrade" && (
                      <span className="badge-brand">
                        <Icon name="trendingUp" size={13} /> {SPUR_TEXT.upgrade}
                      </span>
                    )}
                    {sucht && <span className="badge-neutral border-ink/20 text-ink">{REITER.find((r) => r.key === status)?.label ?? status}</span>}
                  </div>
                  <span className="text-xs text-muted">
                    {job.quelle}
                    {seit ? <span className="tnum"> · seit {seit}</span> : null}
                  </span>
                </div>

                <h2 className="mt-3 text-[1.0625rem] font-semibold leading-snug tracking-tight">{job.title}</h2>
                <p className="mt-0.5 text-sm text-ink/80">{job.employer}</p>

                {/* Ebene 2: Rahmenbedingungen */}
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="mapPin" size={14} />
                    {job.place}
                    {job.homeoffice ? ` · ${job.homeoffice}` : ""}
                  </span>
                  {job.due && (
                    <span className="inline-flex items-center gap-1.5">
                      <Icon name="calendar" size={14} /> Frist {job.due}
                    </span>
                  )}
                  {salary && (
                    <span className="inline-flex items-center gap-1.5 font-medium text-keep">
                      <Icon name="euro" size={14} /> {salary}
                    </span>
                  )}
                </div>

                {(status === "neu" || status === "interessant") && <Warnung frueher={job.frueher} />}

                {status === "absage" && <AbsageGrund uuid={job.uuid} initial={job.absageNotiz} />}

                {bewerbung && (
                  <p className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${job.besuche ? "bg-keep-soft font-medium text-keep" : "bg-subtle text-muted"}`}>
                    <Icon name="eye" size={13} />
                    {job.besuche
                      ? `Seite ${job.besuche.anzahl}× geöffnet · zuletzt ${datum(job.besuche.zuletzt)}${job.besuche.cv ? " · Lebenslauf angesehen" : ""}`
                      : "Seite noch nicht geöffnet"}
                  </p>
                )}

                {/* Ebene 3: Warum passt die Stelle? */}
                {job.summary && <p className="mt-3 text-sm leading-relaxed text-ink/90">{job.summary}</p>}

                {(job.pros.length > 0 || job.cons.length > 0) && (
                  <details className="disclosure mt-3" open={hot && status === "neu"}>
                    <summary>
                      <Icon name="chevronRight" size={14} className="chevron" />
                      Was passt, was nicht
                      <span className="font-normal text-muted">
                        · {job.pros.length} + / {job.cons.length} −
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                      <ul className="space-y-1.5" aria-label="Spricht dafür">
                        {job.pros.map((entry, index) => (
                          <li key={index} className="flex gap-2">
                            <Icon name="plus" size={14} className="mt-[3px] text-keep" />
                            <span>{entry}</span>
                          </li>
                        ))}
                      </ul>
                      <ul className="space-y-1.5" aria-label="Spricht dagegen">
                        {job.cons.map((entry, index) => (
                          <li key={index} className="flex gap-2 text-ink/80">
                            <Icon name="minus" size={14} className="mt-[3px] text-drop" />
                            <span>{entry}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                )}
              </article>

              {ablegen === job.uuid && ablageGruende && (
                <AblageDialog
                  gruende={ablageGruende}
                  onAbbrechen={() => setAblegen(null)}
                  onAblegen={(ablage) => {
                    setAblegen(null);
                    void setStatus(job.uuid, "abgelegt", ablage);
                  }}
                />
              )}

              {/* Ebene 4: Aktionen */}
              <div className="flex flex-wrap items-center gap-2 rounded-b-lg border-t border-rule bg-subtle/40 px-4 py-3 sm:px-5">
                {job.url && (
                  // Öffnet nur die Anzeige. Vorher setzte der Klick automatisch
                  // "beworben" — auch wenn man sich die Stelle nur ansehen wollte.
                  <a href={job.url} target="_blank" rel="noopener noreferrer" className={hot || !mitUnterlagen ? "btn-primary" : "btn-secondary"}>
                    Anzeige öffnen
                    <Icon name="external" size={14} />
                  </a>
                )}
                {mitUnterlagen && (
                  <>
                    <a href={`/application/${encodeURIComponent(job.uuid)}?von=${encodeURIComponent(status)}`} className="btn-secondary">
                      <Icon name="file" size={15} />
                      Unterlagen
                    </a>
                    {["beworben", "interview"].includes(status) && (
                      <a href={`/application/${encodeURIComponent(job.uuid)}?von=${encodeURIComponent(status)}#vorbereitung`} className="btn-secondary">
                        <Icon name="interview" size={15} />
                        Vorbereitung
                      </a>
                    )}
                  </>
                )}
                <span className="ml-auto">
                  <StatusMenue
                    status={status}
                    onWahl={(key) => {
                      // Ablegen: erst nach dem Grund fragen (fließt ins Lernen ein)
                      if (key === "abgelegt" && ablageGruende && status !== "abgelegt") setAblegen(job.uuid);
                      else void setStatus(job.uuid, key);
                    }}
                  />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Warum ablegen? Zwei Gruppen, die sich ausschließen:
 *   „Passt nicht“ → nojobs lernt, solche Stellen seltener vorzuschlagen.
 *   „Passt, aber …“ → äußerer Grund; zählt nicht gegen die Stelle.
 * Alles optional — ohne Grund zählt Ablegen wie bisher als „passt nicht“.
 */
function AblageDialog({ gruende, onAblegen, onAbbrechen }: { gruende: AblageGruende; onAblegen: (a: Ablage) => void; onAbbrechen: () => void }) {
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [notiz, setNotiz] = useState("");
  const id = useId();
  const wurzel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    wurzel.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  const istAber = (key: string) => gruende.passtAber.some((g) => g.key === key);
  const umschalten = (key: string) =>
    setGewaehlt((alt) =>
      alt.includes(key)
        ? alt.filter((k) => k !== key)
        : [...alt.filter((k) => istAber(k) === istAber(key)), key] // andere Gruppe abwählen
    );
  const aber = gewaehlt.some(istAber);
  const nicht = gewaehlt.length > 0 && !aber;
  const chip = (g: Grund) => {
    const an = gewaehlt.includes(g.key);
    return (
      <button
        key={g.key}
        type="button"
        aria-pressed={an}
        onClick={() => umschalten(g.key)}
        className={`rounded-full border px-3 py-1.5 text-left text-sm transition ${
          an ? (istAber(g.key) ? "border-keep bg-keep-soft font-medium text-keep" : "border-drop/60 bg-drop/10 font-medium text-drop") : "border-rule bg-surface text-ink hover:border-ink/30"
        }`}
      >
        {an && <Icon name="check" size={13} className="-ml-0.5 mr-1 inline" />}
        {g.label}
      </button>
    );
  };
  return (
    <div
      ref={wurzel}
      role="group"
      aria-labelledby={`${id}-t`}
      onKeyDown={(e) => e.key === "Escape" && onAbbrechen()}
      className="border-t border-rule bg-subtle/60 px-4 py-4 sm:px-5"
    >
      <p id={`${id}-t`} className="font-semibold">Warum ablegen?</p>
      <p className="mt-0.5 text-sm text-muted">Optional — hilft nojobs, dir bessere Stellen vorzuschlagen.</p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Passt nicht</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {gruende.passtNicht.map(chip)}
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">Passt eigentlich, aber …</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {gruende.passtAber.map(chip)}
      </div>
      <label className="mt-3 block">
        <span className="sr-only">Notiz</span>
        <input className="field" maxLength={300} placeholder="Notiz (optional)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
      </label>
      <p className="mt-2 text-xs text-muted" aria-live="polite">
        {aber
          ? "Zählt nicht gegen die Stelle — nojobs schlägt solche Stellen weiter vor."
          : nicht
            ? "nojobs schlägt Stellen mit diesem Grund künftig seltener vor."
            : "Ohne Grund zählt Ablegen als „passt nicht“."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => onAblegen({ gruende: gewaehlt, notiz: notiz.trim() })}>
          <Icon name="archive" size={15} /> Ablegen
        </button>
        <button type="button" className="btn-ghost" onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </div>
  );
}

/** Nächster sinnvoller Schritt je Status — wird als eigener Knopf hervorgehoben. */
const NAECHSTER: Record<string, string> = { neu: "interessant", interessant: "beworben", beworben: "interview" };

/**
 * Statussteuerung: der wichtigste nächste Schritt als Knopf, alle Status (inkl. „zurück zu Neu“)
 * im Menü. Sendet genau dieselben Werte wie vorher.
 */
function StatusMenue({ status, onWahl }: { status: string; onWahl: (key: string) => void }) {
  const [offen, setOffen] = useState(false);
  const wurzel = useRef<HTMLDivElement>(null);
  const menueId = useId();
  const naechster = STATUS.find((s) => s.key === NAECHSTER[status]);
  const aktuell = REITER.find((r) => r.key === status)?.label ?? status;

  useEffect(() => {
    if (!offen) return;
    const zu = (e: MouseEvent) => {
      if (wurzel.current && !wurzel.current.contains(e.target as Node)) setOffen(false);
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOffen(false);
    };
    document.addEventListener("mousedown", zu);
    document.addEventListener("keydown", taste);
    // Fokus auf den ersten Eintrag, damit das Menü per Tastatur bedienbar ist
    wurzel.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", zu);
      document.removeEventListener("keydown", taste);
    };
  }, [offen]);

  const pfeile = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const eintraege = Array.from(wurzel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const i = eintraege.indexOf(document.activeElement as HTMLButtonElement);
    eintraege[(i + (e.key === "ArrowDown" ? 1 : -1) + eintraege.length) % eintraege.length]?.focus();
  };

  const waehle = (key: string) => {
    setOffen(false);
    onWahl(key);
  };

  return (
    <div ref={wurzel} className="relative flex items-center gap-2">
      {naechster && (
        <button type="button" onClick={() => onWahl(naechster.key)} className="btn-secondary">
          {naechster.key === "interessant" ? <Icon name="bookmark" size={15} /> : naechster.key === "beworben" ? <Icon name="send" size={15} /> : <Icon name="interview" size={15} />}
          {naechster.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => setOffen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={menueId}
        className="btn-ghost border border-transparent"
      >
        <span className="text-muted">Status:</span> <span className="font-medium text-ink">{aktuell}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {offen && (
        <div
          id={menueId}
          role="menu"
          aria-label="Status ändern"
          onKeyDown={pfeile}
          className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-rule bg-surface p-1 shadow-raised"
        >
          {STATUS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="menuitemradio"
              aria-checked={status === entry.key}
              onClick={() => waehle(entry.key)}
              className={`flex w-full items-center justify-between rounded px-2.5 py-2 text-left text-sm transition hover:bg-subtle focus:bg-subtle focus:outline-none ${
                status === entry.key ? "font-medium text-brand-strong" : "text-ink"
              }`}
            >
              {entry.label}
              {status === entry.key && <Icon name="check" size={14} className="text-brand" />}
            </button>
          ))}
          {status !== "neu" && (
            <>
              <div className="my-1 h-px bg-rule" />
              <button
                type="button"
                role="menuitemradio"
                aria-checked={false}
                onClick={() => waehle("neu")}
                className="flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-muted transition hover:bg-subtle hover:text-ink focus:bg-subtle focus:outline-none"
              >
                <Icon name="undo" size={14} />
                zurück zu „Neu“
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
