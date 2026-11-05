"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Fortschritt from "@/components/Fortschritt";
import Icon from "@/components/ui/Icon";

const SCHRITTE = [
  { ab: 0, text: "Anzeige wird gelesen …" },
  { ab: 6, text: "Stelle wird angelegt …" },
  { ab: 10, text: "Passt sie zu dir? Wird bewertet …" },
  { ab: 30, text: "Fast fertig …" },
];

export default function StelleHinzufuegenClient() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [mitText, setMitText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);
  const textFeld = useRef<HTMLTextAreaElement>(null);

  const absenden = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/stelle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, text: mitText ? text : "" }) });
      const b = (await res.json().catch(() => ({}))) as { uuid?: string; error?: string; brauchtText?: boolean; vorhanden?: boolean };
      if (!res.ok || !b.uuid) {
        if (b.brauchtText) {
          setMitText(true);
          setTimeout(() => textFeld.current?.focus(), 50);
        }
        throw new Error(b.error ?? `HTTP ${res.status}`);
      }
      setMeldung({ text: b.vorhanden ? "Die Stelle gab es schon — sie öffnet sich gleich." : "Eingelesen und bewertet — die Stelle öffnet sich gleich." });
      router.push(`/application/${encodeURIComponent(b.uuid)}?von=interessant`);
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
      setBusy(false);
    }
  };

  const bereit = url.trim().length > 8 || (mitText && text.trim().length >= 200);

  return (
    <section className="card-pad mt-5 text-sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (bereit && !busy) void absenden();
        }}
      >
        <label className="block">
          <span className="field-label">Link zur Stellenanzeige</span>
          <input
            type="url"
            inputMode="url"
            className="field"
            placeholder="https://karriere.beispiel.de/stellen/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
        </label>

        {mitText ? (
          <label className="mt-4 block">
            <span className="field-label">Text der Anzeige</span>
            <span className="field-hint">Auf der Seite alles markieren (Strg/Cmd + A), kopieren und hier einfügen. Der Link bleibt als Bewerbungslink gespeichert.</span>
            <textarea ref={textFeld} className="field min-h-48 leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
          </label>
        ) : (
          <button type="button" className="mt-2 text-xs text-brand-strong underline underline-offset-2" onClick={() => setMitText(true)} disabled={busy}>
            Stattdessen den Text der Anzeige einfügen
          </button>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={!bereit || busy}>
            <Icon name="sparkles" size={15} /> {busy ? "wird eingelesen …" : "Einlesen und bewerten"}
          </button>
          {meldung && (
            <span className={meldung.fehler ? "text-drop" : "text-keep"} role={meldung.fehler ? "alert" : "status"}>
              {meldung.text}
            </span>
          )}
        </div>
        <Fortschritt aktiv={busy} dauer={30} schritte={SCHRITTE} hinweis="Seite bitte offen lassen." />
      </form>
    </section>
  );
}
