"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Steuerung für die Hintergrundläufe.
 *
 * Jeder Serverless-Aufruf arbeitet nur sein Zeitbudget ab und gibt dann auf.
 * Diese Seite ruft denselben Endpunkt in einer Schleife auf, bis er fertig
 * meldet — mit Abbruch, Fortschritt und Protokoll.
 */

type State = {
  aktiv: number;
  unbewertet: number;
  inbox: number;
  mustApply: number;
  ungelabelt: number;
  hamburg: number;
  remote: number;
  modell: string;
  ausfaelle24h: number;
  quellen: Record<string, number>;
  cursors: Array<{
    id: string;
    at_end: boolean | null;
    last_run_at: string | null;
    last_note: string | null;
  }>;
};

type LogEntry = { zeit: string; text: string; fehler?: boolean };

const MAX_RUNS = 30;

function wann(value: string | null): string {
  if (!value) return "noch nie";
  return new Date(value).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminClient() {
  const [secret, setSecret] = useState("");
  const [state, setState] = useState<State | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [days, setDays] = useState("7");
  const stop = useRef(false);

  useEffect(() => {
    try {
      setSecret(window.localStorage.getItem("ci-secret") ?? "");
    } catch {
      /* Speicher nicht verfügbar */
    }
  }, []);

  const saveSecret = (value: string) => {
    setSecret(value);
    try {
      window.localStorage.setItem("ci-secret", value);
    } catch {
      /* Speicher nicht verfügbar */
    }
  };

  const say = (text: string, fehler = false) =>
    setLog((prev) =>
      [{ zeit: new Date().toLocaleTimeString("de-DE"), text, fehler }, ...prev].slice(0, 40)
    );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const body = await res.json();
      if (res.ok) {
        setState(body as State);
        setStateError(null);
      } else {
        setStateError(body.error ?? `HTTP ${res.status}`);
      }
    } catch (error) {
      setStateError(error instanceof Error ? error.message : String(error));
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
        const text = await res.text();
        let body: any;
        try {
          body = JSON.parse(text);
        } catch {
          say(`${name}: keine JSON-Antwort (HTTP ${res.status}) — vermutlich Zeitlimit`, true);
          break;
        }

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

  /** Alle Importe nacheinander. Fällt einer aus, laufen die anderen trotzdem. */
  const importAlle = async () => {
    if (!secret) {
      say("Kein Secret eingetragen.", true);
      return;
    }
    await loop(
      "Karriereseiten",
      () => `/api/import-ats?secret=${encodeURIComponent(secret)}`,
      () => true,
      (body) =>
        `${body.gelesen ?? 0}/${body.firmen ?? 0} Firmen, ${body.passend ?? 0} passend, ${body.gespeichert ?? 0} neu` +
        (body.fehler?.length ? ` · ${body.fehler.length} Firmen ausgefallen (siehe Log)` : "")
    );
    await loop(
      "Google Jobs & Arbeitnow",
      () => `/api/import-sammel?secret=${encodeURIComponent(secret)}`,
      () => true,
      (body) =>
        `Google: ${body.googleStatus ?? "?"}, ${body.passend ?? 0} passend, ${body.doppelt ?? 0} doppelt, ${
          body.gespeichert ?? 0
        } neu` + (body.fehler?.length ? ` · ${body.fehler.length} Ausfälle (siehe Log)` : "")
    );
    await loop(
      "Arbeitsagentur",
      () => `/api/import-de?secret=${encodeURIComponent(secret)}`,
      (body) => body.done === true,
      (body) =>
        `${body.treffer ?? 0} Treffer, ${body.kandidaten ?? 0} in Hamburg/Remote, ` +
        `${body.gespeichert ?? 0} neu gespeichert, ${body.offen ?? 0} offen` +
        (body.suchfehler?.length ? ` · Suchfehler: ${body.suchfehler[0]}` : "")
    );
  };

  const daily = () =>
    loop(
      "Nachtlauf",
      () => `/api/daily?secret=${encodeURIComponent(secret)}`,
      () => true,
      (body) =>
        (body.ergebnisse ?? [])
          .map(
            (e: any) =>
              `${e.schritt}: ${e.fehler ? `Fehler (${e.fehler})` : e.done === false ? "offen" : "ok"}`
          )
          .join(" · ")
    );

  const evaluate = (scope: "all" | "labeled", withDays: boolean) =>
    loop(
      scope === "all" ? `Bewerten${withDays ? ` (${days} Tage)` : " (alles)"}` : "Bewerten (gelabelt)",
      () =>
        `/api/evaluate?secret=${encodeURIComponent(secret)}&scope=${scope}` +
        (withDays ? `&days=${encodeURIComponent(days)}` : ""),
      (body) => (body.evaluated ?? 0) === 0,
      (body) =>
        `${body.evaluated ?? 0} bewertet, ${body.failed ?? 0} Fehler, ${body.nochOffen ?? 0} offen` +
        (body.fehlerbeispiele?.length ? ` · ${body.fehlerbeispiele[0]}` : "")
    );

  const notify = (mode: "dry" | "test" | "full") =>
    loop(
      mode === "dry" ? "Telegram-Vorschau" : mode === "test" ? "Telegram-Test" : "Morgenlauf",
      () =>
        `/api/notify?secret=${encodeURIComponent(secret)}` +
        (mode === "dry" ? "&skipEval=1&dry=1" : mode === "test" ? "&test=1" : ""),
      () => true,
      (body) =>
        body.test
          ? "Testnachricht gesendet — prüf Telegram"
          : body.vorschau
            ? body.vorschau.replace(/<[^>]+>/g, "").slice(0, 300)
            : body.gesendet
              ? `${body.stellen} Stellen gesendet`
              : `nicht gesendet: ${body.grund ?? "?"}` +
                (body.bewertung?.evaluated !== undefined
                  ? ` · vorher ${body.bewertung.evaluated} bewertet`
                  : "")
    );

  const zahl = (value: number) => new Intl.NumberFormat("de-DE").format(value);
  const QUELLEN_LABEL: Record<string, string> = {
    de: "Arbeitsagentur",
    ats: "Karriereseiten",
    google: "Google Jobs",
    arbeitnow: "Arbeitnow",
  };

  const button = "rounded border px-4 py-2 text-sm disabled:opacity-40";

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
        Bleibt im Browser gespeichert und steht nicht in der Adressleiste.
      </p>

      {stateError && (
        <p className="mt-6 text-sm text-drop">Status nicht lesbar: {stateError}</p>
      )}

      {state && (
        <section className="mt-10 border-t border-rule pt-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { label: "in der Inbox", value: state.inbox },
              { label: "davon bewerben", value: state.mustApply },
              { label: "noch zu bewerten", value: state.unbewertet },
              { label: "aktiv gesamt", value: state.aktiv },
              { label: "Hamburg", value: state.hamburg },
              { label: "Remote", value: state.remote },
              { label: "ungelabelt", value: state.ungelabelt },
            ].map((entry) => (
              <div key={entry.label}>
                <p className="tnum text-2xl font-semibold leading-none">{zahl(entry.value)}</p>
                <p className="mt-1 text-xs text-muted">{entry.label}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-xs text-muted">Bewertungsmodell: {state.modell}</p>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {["ats", "google", "arbeitnow", "de"].map((id) => {
              const cursor = state.cursors.find((entry) => entry.id === id);
              const anzahl = state.quellen?.[id === "de" ? "ba" : id] ?? 0;
              return (
                <li key={id}>
                  <span className="text-ink">{QUELLEN_LABEL[id]}</span> · {zahl(anzahl)} aktiv · zuletzt{" "}
                  {wann(cursor?.last_run_at ?? null)}
                  {cursor?.last_note ? ` — ${cursor.last_note}` : ""}
                </li>
              );
            })}
          </ul>
          {state.ausfaelle24h > 0 && (
            <p className="mt-3 text-sm text-drop">
              {state.ausfaelle24h} Schnittstellen-Ausfälle in den letzten 24 Stunden —{" "}
              <a href="/log" className="underline underline-offset-4">
                Log ansehen
              </a>
            </p>
          )}
        </section>
      )}

      <section className="mt-10 border-t border-rule pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void importAlle()}
            disabled={Boolean(running)}
            className={`${button} border-ink`}
          >
            1 · Import
          </button>
          <button
            type="button"
            onClick={() => void evaluate("all", true)}
            disabled={Boolean(running)}
            className={`${button} border-keep text-keep`}
          >
            2 · Bewerten, letzte
          </button>
          <input
            value={days}
            onChange={(event) => setDays(event.target.value.replace(/\D/g, "") || "7")}
            className="w-14 rounded border border-rule bg-transparent px-2 py-2 text-center text-sm"
            aria-label="Tage"
          />
          <span className="text-sm text-muted">Tage</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void daily()}
            disabled={Boolean(running)}
            className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
          >
            Nachtlauf testen
          </button>
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
          <button
            type="button"
            onClick={() => void notify("dry")}
            disabled={Boolean(running)}
            className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
          >
            Telegram-Vorschau
          </button>
          <button
            type="button"
            onClick={() => void notify("test")}
            disabled={Boolean(running)}
            className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
          >
            Telegram-Test senden
          </button>
          <button
            type="button"
            onClick={() => void notify("full")}
            disabled={Boolean(running)}
            className="rounded px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
          >
            Morgenlauf testen
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
