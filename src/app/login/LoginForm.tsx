"use client";

import { useState } from "react";

export default function LoginForm({ weiter }: { weiter: string }) {
  const [email, setEmail] = useState("");
  const [schluessel, setSchluessel] = useState("");
  const [notzugang, setNotzugang] = useState(false);
  const [busy, setBusy] = useState(false);
  const [antwort, setAntwort] = useState<{ text: string; fehler?: boolean } | null>(null);

  const senden = async (daten: Record<string, string>) => {
    setBusy(true);
    setAntwort(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...daten, weiter }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setAntwort({ text: body.error ?? `HTTP ${res.status}`, fehler: true });
      if (daten.schluessel) {
        window.location.href = body.weiter ?? "/inbox";
        return;
      }
      setAntwort({ text: body.hinweis ?? "E-Mail ist unterwegs." });
    } catch (err) {
      setAntwort({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  const feld = "mt-1 w-full rounded border border-rule bg-transparent px-3 py-2";
  return (
    <div className="mt-8 text-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void senden({ email });
        }}
      >
        <label className="block">
          <span className="font-semibold">E-Mail-Adresse</span>
          <input type="email" required autoComplete="email" className={feld} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="mt-4 w-full rounded bg-ink px-4 py-2 text-paper disabled:opacity-40">
          {busy && !notzugang ? "Wird gesendet …" : "Anmelde-Link senden"}
        </button>
      </form>
      {antwort && <p className={`mt-4 leading-relaxed ${antwort.fehler ? "text-drop" : ""}`}>{antwort.text}</p>}

      <div className="mt-12 border-t border-rule pt-4">
        {!notzugang ? (
          <button type="button" onClick={() => setNotzugang(true)} className="text-xs text-muted underline underline-offset-4">
            Notzugang für den Admin
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void senden({ schluessel });
            }}
          >
            <label className="block">
              <span className="text-xs text-muted">Schlüssel aus der Steuerung (IMPORT_SECRET)</span>
              <input type="password" autoComplete="current-password" className={feld} value={schluessel} onChange={(e) => setSchluessel(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || !schluessel} className="mt-2 rounded border border-ink px-4 py-2 disabled:opacity-40">
              Mit Schlüssel anmelden
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
