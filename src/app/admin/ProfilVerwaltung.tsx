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

async function senden(methode: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
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
          className="field mt-0 w-44"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-Mail (für den Login später)"
          type="email"
          className="field mt-0 w-64"
        />
        <button
          type="button"
          onClick={() => void anlegen()}
          disabled={busy || name.trim().length < 2}
          className="btn-secondary"
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
      <button type="button" onClick={() => void umschalten()} disabled={busy} className="link-quiet text-xs disabled:opacity-40">
        {aktiv ? "deaktivieren" : "aktivieren"}
      </button>
      {fehler && <span className="text-xs text-drop">{fehler}</span>}
    </span>
  );
}

/**
 * Profil löschen — mit allem: Lebenslauf, Foto, Suchprofil, Urteile, Unterlagen, Telegram, Anmeldung.
 * Zur Sicherheit muss der Name eingetippt werden. Nicht rückgängig zu machen.
 */
export function LoeschenKnopf({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [eingabe, setEingabe] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const loeschen = async () => {
    setBusy(true);
    setFehler(null);
    try {
      await senden("DELETE", { slug, bestaetigung: eingabe });
      setOffen(false);
      router.refresh();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  if (!offen)
    return (
      <button type="button" onClick={() => setOffen(true)} className="link-quiet text-xs hover:text-drop">
        löschen
      </button>
    );
  return (
    <div className="mt-2 w-full rounded-lg border border-drop/30 bg-drop-soft/60 p-3 text-sm text-ink" role="group" aria-label={`${name} löschen`}>
      <p className="font-medium text-drop">{name} endgültig löschen?</p>
      <p className="mt-1 text-muted">
        Gelöscht werden Lebenslauf (Datei und ausgelesene Fassung), Foto, Suchprofil, alle Urteile und Status, Unterlagen, Gesprächsvorbereitungen,
        Telegram-Verbindung und der Zugang. Das lässt sich nicht rückgängig machen.
      </p>
      <label className="mt-2 block">
        <span className="text-xs text-muted">Zur Bestätigung den Namen eintippen: „{name}“</span>
        <input className="field mt-1 w-64" value={eingabe} onChange={(e) => setEingabe(e.target.value)} aria-label="Name zur Bestätigung" />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void loeschen()}
          disabled={busy || eingabe.trim() !== name.trim()}
          className="btn-sm inline-flex items-center gap-1.5 rounded bg-drop px-3 py-1.5 font-medium text-white disabled:opacity-40"
        >
          {busy ? "Löscht …" : "Endgültig löschen"}
        </button>
        <button type="button" onClick={() => (setOffen(false), setEingabe(""), setFehler(null))} className="btn-ghost btn-sm">
          Abbrechen
        </button>
      </div>
      {fehler && <p className="mt-2 text-xs text-drop">{fehler}</p>}
    </div>
  );
}

/** Schritt 2.3: Einladung per E-Mail — fehlt die Adresse, wird sie dabei hinterlegt. */
export function EinladenKnopf({ slug, email, aktiv }: { slug: string; email: string | null; aktiv: boolean }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [adresse, setAdresse] = useState(email ?? "");
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);
  if (!aktiv) return null;
  const einladen = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/einladung", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret()}` },
        body: JSON.stringify({ slug, email: adresse }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setMeldung({ text: `Einladung an ${body.an} gesendet.` });
      router.refresh();
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };
  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} className="link-quiet text-xs">
        einladen
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        type="email"
        value={adresse}
        onChange={(e) => setAdresse(e.target.value)}
        placeholder="E-Mail-Adresse"
        className="field mt-0 w-56 py-1 text-xs"
      />
      <button type="button" onClick={() => void einladen()} disabled={busy || !adresse} className="btn-primary btn-sm">
        {busy ? "Sendet …" : "Einladung senden"}
      </button>
      {meldung && <span className={`text-xs ${meldung.fehler ? "text-drop" : "text-keep"}`}>{meldung.text}</span>}
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
  ort,
  umkreis,
}: {
  slug: string;
  name: string;
  profiltext: string | null;
  regeln: string | null;
  suchbegriffe: string[];
  ort: string | null;
  umkreis: number;
}) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const [text, setText] = useState(profiltext ?? "");
  const [eigeneRegeln, setEigeneRegeln] = useState(regeln ?? "");
  const [begriffe, setBegriffe] = useState(suchbegriffe.join(", "));
  const [suchOrt, setSuchOrt] = useState(ort ?? "");
  const [km, setKm] = useState(umkreis);
  const [busy, setBusy] = useState<"" | "speichern" | "bewerten">("");
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);

  const speichern = async () => {
    setBusy("speichern");
    setMeldung(null);
    try {
      await senden("PATCH", { slug, profiltext: text, regeln: eigeneRegeln, suchbegriffe: begriffe, ort: suchOrt, umkreis: km });
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
      // 1. Stellen für dieses Profil bei der Arbeitsagentur suchen (Schritt 2.7)
      let geholt = 0;
      for (let lauf = 0; lauf < 4; lauf++) {
        const res = await fetch(`/api/import-profile?profil=${encodeURIComponent(slug)}&tage=14`, {
          headers: { Authorization: `Bearer ${secret()}` },
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (body.hinweis) {
          setMeldung({ text: body.hinweis, fehler: true });
          return;
        }
        geholt += body.gespeichert ?? 0;
        setMeldung({ text: `${geholt} neue Stellen für ${name} gefunden …` });
        if (body.done) break;
      }
      // 2. Bewerten
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
      setMeldung({ text: `Fertig: ${geholt} neue Stellen gefunden, ${gesamt} bewertet. Profil oben wählen, um die Inbox zu sehen.` });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy("");
    }
  };

  if (!offen) {
    return (
      <button type="button" onClick={() => setOffen(true)} className="link-quiet text-xs">
        Suchprofil
      </button>
    );
  }

  return (
    <div className="card-quiet mt-3 w-full space-y-3">
      <label className="block">
        <span className="text-xs text-muted">Suchbegriffe (durch Komma getrennt) — damit sucht der Nachtlauf bei der Arbeitsagentur; bewertet werden nur passende Stellen</span>
        <input
          value={begriffe}
          onChange={(e) => setBegriffe(e.target.value)}
          placeholder="z. B. Erzieherin, Kita, Pädagogische Fachkraft"
          className="field"
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <label className="block">
          <span className="text-xs text-muted">Ort oder PLZ</span>
          <input value={suchOrt} onChange={(e) => setSuchOrt(e.target.value)} placeholder="z. B. Hamburg oder 20357" className="field w-56" />
        </label>
        <label className="block">
          <span className="text-xs text-muted">Umkreis</span>
          <select value={km} onChange={(e) => setKm(Number(e.target.value))} className="field w-auto">
            {[10, 25, 50, 100, 200].map((k) => (
              <option key={k} value={k}>
                {k} km
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-muted">Profiltext — wer sucht was, wo, ab welchem Gehalt, No-Gos</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="field" />
      </label>
      <label className="block">
        <span className="text-xs text-muted">Eigene Bewertungsregeln (optional — leer = allgemeine Regeln)</span>
        <textarea value={eigeneRegeln} onChange={(e) => setEigeneRegeln(e.target.value)} rows={4} className="field" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void speichern()} disabled={busy !== ""} className="btn-secondary">
          {busy === "speichern" ? "Speichert …" : "Speichern"}
        </button>
        <button type="button" onClick={() => void bewerten()} disabled={busy !== ""} className="btn-primary">
          {busy === "bewerten" ? "Sucht und bewertet …" : "Stellen suchen und bewerten (14 Tage)"}
        </button>
        <button type="button" onClick={() => setOffen(false)} className="link-quiet text-xs">
          schließen
        </button>
      </div>
      {meldung && <p className={`text-xs ${meldung.fehler ? "text-drop" : "text-keep"}`}>{meldung.text}</p>}
    </div>
  );
}
