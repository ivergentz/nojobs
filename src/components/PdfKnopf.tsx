"use client";

import { useState } from "react";
import Fortschritt from "./Fortschritt";

/**
 * Lädt ein PDF und zeigt dabei einen Fortschrittsbalken. Ersetzt den
 * einfachen Link: Der Download landet wie vorher als Datei mit demselben
 * Namen, nur sieht man jetzt, dass gearbeitet wird.
 */
export default function PdfKnopf({
  href,
  children,
  className,
  gesperrt = false,
  dauer = 6,
  text = "PDF wird gesetzt …",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  gesperrt?: boolean;
  dauer?: number;
  text?: string;
}) {
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFehler(body.error ?? `HTTP ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const name =
        /filename="?([^";]+)"?/i.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "Dokument.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setLaedt(false);
    }
  };

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => void laden()}
        disabled={gesperrt || laedt}
        className={`${className ?? ""} disabled:opacity-40`}
      >
        {children}
      </button>
      <Fortschritt aktiv={laedt} dauer={dauer} schritte={[{ ab: 0, text }]} hinweis="Download startet gleich." />
      {fehler && <span className="mt-2 text-xs text-drop">Fehler: {fehler}</span>}
    </span>
  );
}
