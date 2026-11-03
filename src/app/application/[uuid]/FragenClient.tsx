"use client";

import { useState } from "react";
import Fortschritt from "@/components/Fortschritt";

type Frage = { frage: string; antwort: string; limit?: number | null; erstellt?: string };

/**
 * Fragen aus dem Bewerbungsformular: Frage einfügen, Antwort entwerfen lassen,
 * anpassen, kopieren. Unabhängig vom Anschreiben — manche Formulare wollen nur
 * zwei Sätze statt eines Anschreibens.
 */
export default function FragenClient({ uuid, initial }: { uuid: string; initial: Frage[] }) {
  const [fragen, setFragen] = useState<Frage[]>(initial);
  const [neu, setNeu] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<number | null>(null);

  const call = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch("/api/application/frage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, ...payload }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFailed(body.error ?? `HTTP ${res.status}`);
        return null;
      }
      setFragen(body.fragen ?? []);
      setDirty(false);
      return body as { hinweis?: string };
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const entwerfen = async () => {
    const body = await call({
      aktion: "entwerfen",
      frage: neu,
      limit: limit ? Number(limit) : null,
    });
    if (body) {
      setNeu("");
      setLimit("");
      setHinweis(body.hinweis || null);
    }
  };

  const kopieren = async (index: number) => {
    try {
      await navigator.clipboard.writeText(fragen[index].antwort);
      setKopiert(index);
      setTimeout(() => setKopiert(null), 1500);
    } catch {
      setFailed("Kopieren nicht möglich — Text bitte markieren und kopieren.");
    }
  };

  const andern = (index: number, antwort: string) => {
    setFragen((prev) => prev.map((f, i) => (i === index ? { ...f, antwort } : f)));
    setDirty(true);
  };

  const loeschen = (index: number) => {
    setFragen((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  return (
    <section className="card-pad mt-10">
      <h2 className="section-title">Fragen im Bewerbungsformular</h2>
      <p className="section-lead max-w-lg">
        Frage aus dem Formular einfügen, gern mit dem Hinweistext darunter (z. B. „1–2 sentences
        are enough“). Die Antwort passt zur Ausschreibung, zu deinem Lebenslauf und zum Anschreiben.
      </p>

      {fragen.length > 0 && (
        <ul className="mt-6 space-y-5">
          {fragen.map((f, index) => (
            <li key={index} className="border-t border-rule pt-5 first:border-t-0 first:pt-0">
              <p className="whitespace-pre-line text-sm font-medium">{f.frage}</p>
              <textarea
                value={f.antwort}
                onChange={(event) => andern(index, event.target.value)}
                rows={Math.max(3, Math.ceil(f.antwort.length / 90))}
                className="field text-[0.9375rem] leading-relaxed"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span className={`tnum ${f.limit && f.antwort.length > f.limit ? "font-medium text-drop" : ""}`}>
                  {f.antwort.length}
                  {f.limit ? ` / ${f.limit}` : ""} Zeichen
                </span>
                <button type="button" onClick={() => void kopieren(index)} className="btn-ghost btn-sm">
                  {kopiert === index ? "kopiert ✓" : "kopieren"}
                </button>
                <button type="button" onClick={() => loeschen(index)} className="btn-ghost btn-sm hover:text-drop">
                  löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dirty && (
        <button
          type="button"
          onClick={() => void call({ aktion: "speichern", fragen })}
          disabled={busy}
          className="btn-primary mt-4"
        >
          Änderungen sichern
        </button>
      )}

      <div className="mt-6 rounded-lg border border-dashed border-rule bg-subtle/40 p-4">
        <label className="block">
          <span className="field-label">Neue Frage</span>
          <textarea
            value={neu}
            onChange={(event) => setNeu(event.target.value)}
            rows={4}
            placeholder="What motivates you to apply, and why does this role feel like a great fit from your perspective?"
            className="field"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            value={limit}
            onChange={(event) => setLimit(event.target.value.replace(/\D/g, ""))}
            placeholder="Zeichenlimit (optional)"
            aria-label="Zeichenlimit (optional)"
            className="field mt-0 w-48"
          />
          <button
            type="button"
            onClick={() => void entwerfen()}
            disabled={busy || !neu.trim()}
            className="btn-primary"
          >
            {busy ? "wird entworfen …" : "Antwort entwerfen"}
          </button>
        </div>
        <Fortschritt aktiv={busy && neu.trim() !== ""} dauer={15} schritte={[{ ab: 0, text: "Antwort wird entworfen …" }]} />
      </div>

      {hinweis && <p className="alert-info mt-4">{hinweis}</p>}
      {failed && <p className="mt-4 text-sm text-drop">{failed}</p>}
    </section>
  );
}
