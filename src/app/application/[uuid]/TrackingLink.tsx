"use client";

import { useState } from "react";

/** Persönlicher Bewerbungs-Link zum Kopieren — z. B. für das Website-Feld im Bewerbungsformular. */
export default function TrackingLink({ href, text }: { href: string; text: string }) {
  const [kopiert, setKopiert] = useState(false);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setKopiert(true);
      setTimeout(() => setKopiert(false), 1800);
    } catch {
      /* Zwischenablage gesperrt — Link ist ja markierbar */
    }
  };
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <code className="select-all font-mono text-sm">{text}</code>
      <button type="button" onClick={() => void kopieren()} className="text-xs text-muted underline underline-offset-4">
        {kopiert ? "kopiert" : "kopieren"}
      </button>
    </span>
  );
}
