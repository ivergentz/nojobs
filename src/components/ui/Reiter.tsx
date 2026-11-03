"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Icon from "./Icon";

export type ReiterEintrag = { key: string; label: string; fertig?: boolean; zahl?: number | null };

/**
 * Reiter mit gemerkter Auswahl in der Adresse (#key). Alle Bereiche bleiben geladen
 * (nur ausgeblendet) — Eingaben, laufende Vorgänge und Fortschritt gehen beim Wechseln nicht verloren.
 */
export function useReiter(keys: string[], standard: string) {
  const [aktiv, setAktiv] = useState(standard);
  useEffect(() => {
    const ausAdresse = () => {
      const hash = window.location.hash.replace("#", "");
      if (keys.includes(hash)) setAktiv(hash);
    };
    ausAdresse();
    // Links auf dieselbe Seite (#suchprofil), von Hand geänderte Adresse, Zurück/Vor über Hash-Einträge
    window.addEventListener("hashchange", ausAdresse);
    return () => window.removeEventListener("hashchange", ausAdresse);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const waehlen = (key: string) => {
    setAktiv(key);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${key}`);
  };
  return [aktiv, waehlen] as const;
}

export function ReiterLeiste({ eintraege, aktiv, onWahl, label, idBasis }: { eintraege: ReiterEintrag[]; aktiv: string; onWahl: (key: string) => void; label: string; idBasis: string }) {
  const leiste = useRef<HTMLDivElement>(null);
  const tasten = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const i = eintraege.findIndex((r) => r.key === aktiv);
    const n = eintraege.length;
    const ziel = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n;
    onWahl(eintraege[ziel].key);
    leiste.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[ziel]?.focus();
  };
  return (
    <div ref={leiste} role="tablist" aria-label={label} className="tabs flex-wrap" onKeyDown={tasten}>
      {eintraege.map((r) => {
        const an = r.key === aktiv;
        return (
          <button
            key={r.key}
            type="button"
            role="tab"
            id={`${idBasis}-tab-${r.key}`}
            aria-selected={an}
            aria-controls={`${idBasis}-panel-${r.key}`}
            tabIndex={an ? 0 : -1}
            onClick={() => onWahl(r.key)}
            className={`tab ${an ? "tab-active" : ""}`}
          >
            {r.fertig && <Icon name="circleCheck" size={14} className="text-keep" />}
            {r.label}
            {r.zahl ? <span className={`tnum rounded-full px-1.5 text-2xs ${an ? "bg-brand-soft text-brand-strong" : "bg-surface text-muted"}`}>{r.zahl}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function ReiterInhalt({ idBasis, key_, aktiv, children }: { idBasis: string; key_: string; aktiv: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idBasis}-panel-${key_}`} aria-labelledby={`${idBasis}-tab-${key_}`} hidden={aktiv !== key_}>
      {children}
    </div>
  );
}

export const useReiterId = () => useId().replace(/:/g, "");
