"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Steuerung für die Hintergrundläufe.
 *
 * Jeder Serverless-Aufruf arbeitet nur sein Zeitbudget ab und gibt dann auf.
 * Bisher hieß das: URL im Browser aufrufen, Antwort lesen, neu laden, wieder
 * von vorn. Diese Seite macht dieselbe Schleife im Client — mit Abbruch,
 * Fortschritt und Protokoll.
 */

type State = {
  aktiv: number;
  unbewertet: number;
  unbewertet4Tage: number;
  inbox: number;
  blockiert: number;
  ungelabelt: number;
  nav: number;
  se: number;
  modell: string;
  cursors: Array<{
    id: string;
    at_end: boolean | null;
    last_item_date: string | null;
    last_run_at: string | null;
    last_note: string | null;
  }>;
};

type LogEntry = { zeit: string; text: string; fehler?: boolean };

const MAX_RUNS = 60;

export default function AdminClient() {
  const [secret, setSecret] = useState("");
  const [state, setState] = useState<State | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [days, setDays] = useState("4");
  const stop = useRef(false);

  useEffect(() => {
    setSecret(window.localStorage.getItem("ci-secret") ?? "");
  }, []);

  const saveSecret = (value: string) => {
    setSecret(value);
    window.localStorage.setItem("ci-secret", value);
  };

  const say = (text: string, fehler = false) =>
    setLog((prev) =>
      [{ zeit: new Date().toLocaleTimeString("de-DE"), text, fehler }, ...prev].slice(0, 40)
    );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) setState(body as State);
    } catch {
      /* stiller Fehlschlag, der nächste Durchlauf versucht es erneut */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Ruft einen Endpunkt so lange auf, bis er fertig meldet oder nichts mehr tut. */
  const loop = async (
    name: string,
    build: () => string,
    fertig: (body: any) => boolean,
    zeile: (body: any) => string
  ) => {
    if (!secret) {
      say("Kein Secret eingetragen.", true);
      return;
    }

    stop.current = false;
    setRunning(name);
    say(`${name}: gestartet`);

    for (let run = 1; run <= MAX_RUNS; run += 1) {
      if (stop.current) {
        say(`${name}: abgebrochen`);
        break;
      }

      try {
        const res = await fetch(build(), { cache: "no-store" });
        const body = await res.json();

        if (!res.ok || body.ok === false) {
          say(`${name}: ${body.error ?? `HTTP ${res.status}`}`, true);
          break;
        }

        say(`${name} · Lauf ${run} — ${zeile(body)}`);
        await refresh();

        if (fertig(body)) {
          say(`${name}: fertig`);
          break;
        }
      } catch (error) {
        say(`${name}: ${error instanceof Error ? error.message : String(error)}`, true);
        break;
      }
    }

    setRunning(null);
    await refresh();
  };

  const importNav = () =>
    loop(
      "Import Norwegen",
      () => `/api/import?secret=${encodeURIComponent(secret)}`,
      (body) => body.done === true,
      (body) =>
        `${body.thisRun?.items ?? 0} gelesen, ${body.thisRun?.kept ?? 0} gespeichert, Stand ${
          body.feedPosition?.slice(0, 16) ?? "?"
        }`
    );

  const importSe = () =>
    loop(
      "Import Schweden",
      () => `/api/import-se?secret=${encodeURIComponent(secret)}`,
      (body) => body.done === true,
      (body) =>
        `${body.gelesen ?? 0} gelesen, ${body.gespeichert ?? 0} gespeichert, Stand ${
          body.naechsterStart?.slice(0, 16) ?? "?"
        }`
    );

  const importDe = () =>
    loop(
      "Import Deutschland",
      () => `/api/import-de?secret=${encodeURIComponent(secret)}`,
      (body) => body.done === true,
      (body) =>
        `${body.fortschritt ?? "?"} Begriffe, ${body.treffer ?? 0} Treffer, ${
          body.gespeichert ?? 0
        } gespeichert`
    );

  const evaluate = (scope: "all" | "labeled", withDays: boolean) =>
    loop(
      scope === "all" ? `Bewerten${withDays ? ` (${days} Tage)` : " (alles)"}` : "Bewerten (gelabelt)",
      () =>
        `/api/evaluate?secret=${encodeURIComponent(secret)}&scope=${scope}` +
        (withDays ? `&days=${encodeURIComponent(days)}` : ""),
      (body) => (body.evaluated ?? 0) === 0,
      (body) =>
        `${body.evaluated ?? 0} bewertet, ${body.failed ?? 0} Fehler, ${
          body.nochOffen ?? 0
        } offen`
    );

  const zahl = (value: number) => new Intl.NumberFormat("de-DE").format(value);

  return (
    <div className="mt-8">
      <label className="block text-sm">
        <span className="text-muted">Secret</span>
        <input
          type="password"
          value={secret}
          onChange={(event) => saveSecret(event.target.value)}
          placeholder="IMPORT_SECRET"
          className="mt-2 w-full rounded border border-rule bg-transparent px-3 py-2 text-sm"
        />
      </label>
      <p className="mt-2 text-xs text-muted">
        Bleibt im Browser gespeichert und steht nicht mehr in der Adressleiste.
      </p>

      {state && (
        <section className="mt-10 border-t border-rule pt-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: "in der Inbox", value: state.inbox },
              { label: "noch zu bewerten", value: state.unbewertet },
              { label: "davon letzte 4 Tage", value: state.unbewertet4Tage },
              { label: "Sprache blockiert", value: state.blockiert },
              { label: "Stellen Norwegen", value: state.nav },
              { label: "Stellen Schweden", value: state.se },
              { label: "aktiv gesamt", value: state.aktiv },
              { label: "ungelabelt", value: state.ungelabelt },
            ].map((entry) => (
              <div key={entry.label}>
                <p className="tnum text-2xl font-semibold leading-none">{zahl(entry.value)}</p>
                <p className="mt-1 text-xs text-muted">{entry.label}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-muted">Bewertungsmodell: {state.modell}</p>

          <ul className="mt-4 space-y-1 text-xs text-muted">
            {state.cursors.map((cursor) => (
              <li key={cursor.id}>
                {cursor.id === "nav" ? "Norwegen" : cursor.id === "se" ? "Schweden" : "Deutschland"}: Stand{" "}
                {cursor.last_item_date?.slice(0, 16) ?? "—"} ·{" "}
                {cursor.at_end ? "aktuell" : "Rückstand"}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10 border-t border-rule pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void importNav()}
            disabled={Boolean(running)}
            className="rounded border border-ink px-4 py-2 text-sm disabled:opacity-40"
          >
            Import Norwegen
          </button>
          <button
            type="button"
            onClick={() => void importSe()}
            disabled={Boolean(running)}
            className="rounded border border-ink px-4 py-2 text-sm disabled:opacity-40"
          >
            Import Schweden
          </button>
          <button
            type="button"
            onClick={() => void importDe()}
            disabled={Boolean(running)}
            className="rounded border border-ink px-4 py-2 text-sm disabled:opacity-40"
          >
            Import Deutschland
          </button>
          <button
            type="button"
            onClick={() => void evaluate("all", true)}
            disabled={Boolean(running)}
            className="rounded border border-keep px-4 py-2 text-sm text-keep disabled:opacity-40"
          >
            Bewerten, letzte
          </button>
          <input
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/\D/g, "") || "4")}
            className="w-14 rounded border border-rule bg-transparent px-2 py-2 text-center text-sm"
            aria-label="Tage"
          />
          <span className="text-sm text-muted">Tage</span>

          <button
            type="button"
            onClick={() => void evaluate("all", false)}
            disabled={Boolean(running)}
            className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
          >
            alles bewerten
          </button>
          <button
            type="button"
            onClick={() => void evaluate("labeled", false)}
            disabled={Boolean(running)}
            className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
          >
            nur gelabelte
          </button>

          {running && (
            <button
              type="button"
              onClick={() => {
                stop.current = true;
              }}
              className="rounded border border-drop px-4 py-2 text-sm text-drop"
            >
              Stopp
            </button>
          )}
        </div>

        {running && (
          <p className="mt-4 text-sm">
            <span className="text-drop">läuft:</span> {running} — Seite offen lassen, die Schleife
            läuft im Browser.
          </p>
        )}
      </section>

      {log.length > 0 && (
        <section className="mt-10 border-t border-rule pt-8">
          <h2 className="text-sm font-semibold">Protokoll</h2>
          <ul className="mt-4 space-y-1 font-mono text-xs">
            {log.map((entry, index) => (
              <li key={index} className={entry.fehler ? "text-drop" : "text-muted"}>
                <span className="tnum">{entry.zeit}</span> {entry.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
