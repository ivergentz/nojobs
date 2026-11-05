"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";

/**
 * Selbst hinzugefügte Stelle: Bewertung deutlich zeigen. Passt sie laut nojobs nicht,
 * entscheidest du: trotzdem bewerben (zählt als dein Urteil „Bewerben“ und hilft der Kalibrierung) oder ablegen.
 */
export default function HinzugefuegtHinweis({ uuid, fit, summary, label }: { uuid: string; fit: string | null; summary: string | null; label: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const passt = fit === "must_apply" || fit === "worth_reading";
  const zuUnterlagen = () => document.getElementById("unterlagen")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const senden = async (pfad: string, body: Record<string, unknown>, danach: () => void) => {
    setBusy(true);
    setFehler(null);
    try {
      const res = await fetch(pfad, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      danach();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`mt-6 rounded-lg border p-4 text-sm ${passt ? "border-keep/30 bg-keep/5" : fit ? "border-warn/40 bg-warn/5" : "border-rule bg-paper/60"}`} data-hinzugefuegt>
      <p className="flex items-center gap-2 font-medium">
        <Icon name={passt ? "check" : "alert"} size={15} className={passt ? "text-keep" : "text-warn"} />
        {fit === "must_apply" ? "Von dir hinzugefügt · nojobs empfiehlt: Bewerben" : fit === "worth_reading" ? "Von dir hinzugefügt · nojobs empfiehlt: Anschauen" : fit ? "Von dir hinzugefügt · passt laut nojobs eher nicht" : "Von dir hinzugefügt · noch nicht bewertet"}
      </p>
      {summary && <p className="mt-1.5 leading-relaxed text-muted">{summary}</p>}
      {!fit && <p className="mt-1.5 text-muted">Die Bewertung folgt beim nächsten Morgenlauf — Unterlagen kannst du schon jetzt erstellen.</p>}
      {fit && !passt && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {label === "must_apply" ? (
            <span className="text-xs text-keep">Du hast entschieden: trotzdem bewerben.</span>
          ) : (
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void senden("/api/label", { uuid, label: "must_apply" }, () => { router.refresh(); zuUnterlagen(); })}>
              Trotzdem bewerben
            </button>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void senden("/api/status", { uuid, status: "abgelegt" }, () => router.push("/inbox#abgelegt"))}
          >
            Ablegen
          </button>
          <span className="text-xs text-muted">„Trotzdem bewerben“ zählt als dein Urteil — so lernt die Bewertung, wenn sie zu streng war.</span>
        </div>
      )}
      {fehler && <p className="mt-2 text-drop" role="alert">{fehler}</p>}
    </section>
  );
}
