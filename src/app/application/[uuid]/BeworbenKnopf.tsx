"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";

/**
 * „Beworben“: setzt die Stelle auf beworben (dieselbe Statusänderung wie in der Inbox —
 * dabei entsteht im Hintergrund die Gesprächsvorbereitung) und führt zurück in den Reiter,
 * aus dem man kam (Vorgemerkt oder Neu).
 */
export default function BeworbenKnopf({ uuid, von }: { uuid: string; von: string | null }) {
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const zurueck = von === "interessant" ? "/inbox#interessant" : "/inbox";

  const beworben = async () => {
    setBusy(true);
    setFehler(null);
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, status: "beworben" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFehler(body.error ?? `HTTP ${res.status}`);
        return;
      }
      window.location.href = zurueck;
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => void beworben()} disabled={busy} className="btn-positive">
        <Icon name="send" size={15} />
        {busy ? "Wird gespeichert …" : "Beworben"}
      </button>
      {fehler && (
        <span className="mt-1.5 text-xs text-drop" role="alert">
          Nicht gespeichert: {fehler}
        </span>
      )}
    </span>
  );
}
