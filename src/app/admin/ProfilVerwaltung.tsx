"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Schritt 2.1: neues Profil anlegen, Profile aktivieren/deaktivieren. Nutzt das Secret von oben. */

function secret(): string {
  try {
    return window.localStorage.getItem("ci-secret") ?? "";
  } catch {
    return "";
  }
}

async function senden(methode: "POST" | "PATCH", body: Record<string, unknown>) {
  const res = await fetch("/api/profile", {
    method: methode,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret()}` },
    body: JSON.stringify(body),
  });
  const antwort = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(antwort.error ?? `HTTP ${res.status}`);
  return antwort;
}

export function NeuesProfilFormular() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  const anlegen = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const r = await senden("POST", { name, email });
      setMeldung({ text: `Profil „${name.trim()}“ angelegt (${r.slug}).` });
      setName("");
      setEmail("");
      router.refresh();
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="w-44 rounded border border-rule bg-transparent px-3 py-2"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail (für den Login später)"
          type="email"
          className="w-64 rounded border border-rule bg-transparent px-3 py-2"
        />
        <button
          type="button"
          onClick={() => void anlegen()}
          disabled={busy || name.trim().length < 2}
          className="rounded border border-ink px-4 py-2 disabled:opacity-40"
        >
          {busy ? "Legt an …" : "Profil anlegen"}
        </button>
      </div>
      {meldung && <p className={`mt-2 text-xs ${meldung.fehler ? "text-drop" : "text-keep"}`}>{meldung.text}</p>}
    </div>
  );
}

export function AktivSchalter({ slug, aktiv }: { slug: string; aktiv: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const umschalten = async () => {
    setBusy(true);
    setFehler(null);
    try {
      await senden("PATCH", { slug, aktiv: !aktiv });
      router.refresh();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={() => void umschalten()} disabled={busy} className="text-xs text-muted underline underline-offset-4 disabled:opacity-40">
        {aktiv ? "deaktivieren" : "aktivieren"}
      </button>
      {fehler && <span className="text-xs text-drop">{fehler}</span>}
    </span>
  );
}
