"use client";

import { useState } from "react";

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
    <section className="mt-14 border-t border-rule pt-8">
      <h2 className="text-lg font-semibold tracking-tight">Fragen im Bewerbungsformular</h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
        Frage aus dem Formular einfügen, gern mit dem Hinweistext darunter (z. B. „1–2 sentences
        are enough“). Die Antwort passt zur Ausschreibung, zu deinem Lebenslauf und zum Anschreiben.
      </p>

      {fragen.length > 0 && (
        <ul className="mt-6 space-y-6">
          {fragen.map((f, index) => (
            <li key={index}>
              <p className="whitespace-pre-line text-sm font-medium">{f.frage}</p>
              <textarea
                value={f.antwort}
                onChange={(event) => andern(index, event.target.value)}
                rows={Math.max(3, Math.ceil(f.antwort.length / 90))}
                className="mt-2 w-full rounded border border-rule bg-transparent px-3 py-2 text-sm leading-relaxed"
              />
              <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted">
                <span className={f.limit && f.antwort.length > f.limit ? "text-drop" : ""}>
                  {f.antwort.length}
                  {f.limit ? ` / ${f.limit}` : ""} Zeichen
                </span>
                <button type="button" onClick={() => void kopieren(index)} className="underline underline-offset-4">
                  {kopiert === index ? "kopiert ✓" : "kopieren"}
                </button>
                <button type="button" onClick={() => loeschen(index)} className="underline underline-offset-4">
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
          className="mt-4 rounded border border-ink px-4 py-2 text-sm disabled:opacity-40"
        >
          Änderungen sichern
        </button>
      )}

      <div className="mt-8">
        <label className="block">
          <span className="text-sm text-muted">Neue Frage</span>
          <textarea
            value={neu}
            onChange={(event) => setNeu(event.target.value)}
            rows={4}
            placeholder="What motivates you to apply, and why does this role feel like a great fit from your perspective?"
            className="mt-2 w-full rounded border border-rule bg-transparent px-3 py-2 text-sm"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            value={limit}
            onChange={(event) => setLimit(event.target.value.replace(/\D/g, ""))}
            placeholder="Zeichenlimit (optional)"
            className="w-48 rounded border border-rule bg-transparent px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void entwerfen()}
            disabled={busy || !neu.trim()}
            className="rounded border border-keep px-4 py-2 text-sm text-keep disabled:opacity-40"
          >
            {busy ? "wird entworfen …" : "Antwort entwerfen"}
          </button>
        </div>
      </div>

      {hinweis && <p className="mt-4 border-l-2 border-rule pl-3 text-sm text-muted">{hinweis}</p>}
      {failed && <p className="mt-4 text-sm text-drop">{failed}</p>}
    </section>
  );
}
