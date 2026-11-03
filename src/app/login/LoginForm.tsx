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

  const feld = "field";
  return (
    <div className="mt-6 text-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void senden({ email });
        }}
      >
        <label className="block">
          <span className="field-label">E-Mail-Adresse</span>
          <input type="email" required autoComplete="email" className={feld} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" disabled={busy} className="btn-primary mt-4 w-full py-2.5">
          {busy && !notzugang ? "Wird gesendet …" : "Anmelde-Link senden"}
        </button>
      </form>
      {antwort && (
        <p className={`mt-4 ${antwort.fehler ? "alert-error" : "alert-success"}`} role={antwort.fehler ? "alert" : "status"}>
          {antwort.text}
        </p>
      )}

      <div className="mt-8 border-t border-rule/60 pt-3 text-right">
        {!notzugang ? (
          <button type="button" onClick={() => setNotzugang(true)} className="link-quiet text-2xs text-muted/70">
            Betreiber-Zugang
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void senden({ schluessel });
            }}
          >
            <label className="block">
              <span className="field-hint mt-0 text-left">Nur für den Betreiber: Zugangsschlüssel</span>
              <input type="password" autoComplete="current-password" className={feld} value={schluessel} onChange={(e) => setSchluessel(e.target.value)} />
            </label>
            <button type="submit" disabled={busy || !schluessel} className="btn-secondary mt-2">
              Mit Schlüssel anmelden
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
