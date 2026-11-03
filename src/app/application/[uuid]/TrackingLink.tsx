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
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <code className="select-all break-all rounded border border-rule bg-subtle px-2 py-1 font-mono text-[0.8125rem]">{text}</code>
      <button type="button" onClick={() => void kopieren()} className="btn-ghost btn-sm">
        {kopiert ? "kopiert" : "kopieren"}
      </button>
    </span>
  );
}
