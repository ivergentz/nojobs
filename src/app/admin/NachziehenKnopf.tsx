"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Zieht Abweichungen nach (kopiert betroffene Stellen erneut aus jobs nach matches). */
export default function NachziehenKnopf() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);

  const los = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/abgleich", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMeldung(`Fehler: ${body.error ?? res.status}`);
        return;
      }
      setMeldung(`${body.nachgezogen} Stellen nachgezogen.`);
      router.refresh();
    } catch (err) {
      setMeldung(`Fehler: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void los()} disabled={busy} className="btn-secondary btn-sm">
        {busy ? "Zieht nach …" : "Abweichungen nachziehen"}
      </button>
      {meldung && <span className="text-muted">{meldung}</span>}
    </div>
  );
}
