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

/** Schritt 2.2: Suchprofil eines weiteren Profils bearbeiten und Bewertung anstoßen. */
export function SuchprofilBearbeiten({
  slug,
  name,
  profiltext,
  regeln,
  suchbegriffe,
}: {
  slug: string;
  name: string;
  profiltext: string | null;
  regeln: string | null;
  suchbegriffe: string[];
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState(profiltext ?? "");
  const [eigeneRegeln, setEigeneRegeln] = useState(regeln ?? "");
  const [begriffe, setBegriffe] = useState(suchbegriffe.join(", "));
  const [busy, setBusy] = useState<"" | "speichern" | "bewerten">("");
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  const speichern = async () => {
    setBusy("speichern");
    setMeldung(null);
    try {
      await senden("PATCH", { slug, profiltext: text, regeln: eigeneRegeln, suchbegriffe: begriffe });
      setMeldung({ text: "Gespeichert." });
      router.refresh();
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy("");
    }
  };

  const bewerten = async () => {
    setBusy("bewerten");
    setMeldung(null);
    let gesamt = 0;
    try {
      for (let lauf = 0; lauf < 6; lauf++) {
        const res = await fetch(`/api/evaluate?profil=${encodeURIComponent(slug)}&days=14`, {
          headers: { Authorization: `Bearer ${secret()}` },
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (body.hinweis) {
          setMeldung({ text: body.hinweis, fehler: true });
          return;
        }
        gesamt += body.evaluated ?? 0;
        setMeldung({ text: `${gesamt} Stellen bewertet, ${body.nochOffen ?? 0} offen …` });
        if (!body.nochOffen || !body.evaluated) break;
      }
      setMeldung({ text: `Fertig: ${gesamt} Stellen für ${name} bewertet. Profil oben wählen, um die Inbox zu sehen.` });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy("");
    }
  };

  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} className="text-xs text-muted underline underline-offset-4">
        Suchprofil
      </button>
    );
  }

  return (
    <div className="mt-3 w-full space-y-3 rounded border border-rule p-4">
      <label className="block">
        <span className="text-xs text-muted">Suchbegriffe (durch Komma getrennt) — nur Stellen mit einem dieser Wörter im Titel werden bewertet</span>
        <input
          value={begriffe}
          onChange={(e) => setBegriffe(e.target.value)}
          placeholder="z. B. Erzieherin, Kita, Pädagogische Fachkraft"
          className="mt-1 w-full rounded border border-rule bg-transparent px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Profiltext — wer sucht was, wo, ab welchem Gehalt, No-Gos</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="mt-1 w-full rounded border border-rule bg-transparent px-3 py-2" />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Eigene Bewertungsregeln (optional — leer = allgemeine Regeln)</span>
        <textarea value={eigeneRegeln} onChange={(e) => setEigeneRegeln(e.target.value)} rows={4} className="mt-1 w-full rounded border border-rule bg-transparent px-3 py-2" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void speichern()} disabled={busy !== ""} className="rounded border border-ink px-4 py-2 disabled:opacity-40">
          {busy === "speichern" ? "Speichert …" : "Speichern"}
        </button>
        <button type="button" onClick={() => void bewerten()} disabled={busy !== ""} className="rounded border border-keep px-4 py-2 text-keep disabled:opacity-40">
          {busy === "bewerten" ? "Bewertet …" : "Jetzt bewerten (letzte 14 Tage)"}
        </button>
        <button type="button" onClick={() => setOffen(false)} className="text-xs text-muted underline underline-offset-4">
          schließen
        </button>
      </div>
      {meldung && <p className={`text-xs ${meldung.fehler ? "text-drop" : "text-keep"}`}>{meldung.text}</p>}
    </div>
  );
}
