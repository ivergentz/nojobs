"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon, { type IconName } from "./Icon";

export type NavPunkt = { href: string; label: string; icon: IconName };
export type NavGruppe = { titel?: string; punkte: NavPunkt[]; nachrangig?: boolean };

/**
 * App-Rahmen: Seitenleiste auf dem Desktop, kompakte Kopfzeile mit Menü auf dem Handy.
 * Reine Darstellung — welche Punkte erscheinen, entscheidet das Layout (Rechte unverändert).
 */
export default function AppShell({
  gruppen,
  unten,
  hinweis,
  children,
}: {
  gruppen: NavGruppe[];
  /** Profil, Profilauswahl, Abmelden */
  unten?: React.ReactNode;
  /** z. B. „Ansicht für …“ */
  hinweis?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pfad = usePathname() ?? "";
  const [offen, setOffen] = useState(false);

  // Menü schließen, wenn sich die Seite ändert; Esc schließt ebenfalls.
  useEffect(() => setOffen(false), [pfad]);
  useEffect(() => {
    if (!offen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOffen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [offen]);

  const aktiv = (href: string) => pfad === href || pfad.startsWith(`${href}/`) || (href === "/inbox" && pfad.startsWith("/application"));

  const navigation = (
    <nav aria-label="Hauptnavigation" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {gruppen.map((g, i) => (
        <div key={g.titel ?? i}>
          {g.titel && <p className="mb-1.5 px-2.5 text-2xs font-medium uppercase tracking-[0.1em] text-muted/80">{g.titel}</p>}
          <ul className="space-y-0.5">
            {g.punkte.map((p) => {
              const an = aktiv(p.href);
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    aria-current={an ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition ${
                      an
                        ? "bg-brand-soft font-medium text-brand-strong"
                        : g.nachrangig
                          ? "text-muted hover:bg-subtle hover:text-ink"
                          : "text-ink/80 hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    <Icon name={p.icon} size={17} className={an ? "text-brand" : "text-muted"} />
                    {p.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const marke = (
    <Link href="/inbox" className="flex items-center gap-2.5" aria-label="nojobs — zu meinen Jobs">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-white">
        <Icon name="briefcase" size={15} />
      </span>
      <span className="leading-tight">
        <span className="block text-[0.9375rem] font-semibold tracking-tight">nojobs</span>
        <span className="block text-2xs text-muted">Dein Karriereassistent</span>
      </span>
    </Link>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Desktop: Seitenleiste */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-rule bg-surface/80 backdrop-blur lg:flex">
        <div className="px-5 pb-2 pt-5">{marke}</div>
        {navigation}
        {unten && <div className="border-t border-rule px-3 py-3">{unten}</div>}
      </aside>

      {/* Handy und Tablet: Kopfzeile */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-surface/90 px-4 backdrop-blur lg:hidden">
        {marke}
        <button
          type="button"
          onClick={() => setOffen(true)}
          className="btn-ghost -mr-2 px-2"
          aria-label="Menü öffnen"
          aria-expanded={offen}
          aria-controls="mobil-menue"
        >
          <Icon name="menu" size={20} />
        </button>
      </header>

      {offen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menü" id="mobil-menue">
          <button type="button" className="absolute inset-0 bg-ink/30" aria-label="Menü schließen" onClick={() => setOffen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-raised">
            <div className="flex h-14 items-center justify-between border-b border-rule px-4">
              <span className="text-sm font-medium">Menü</span>
              <button type="button" onClick={() => setOffen(false)} className="btn-ghost -mr-2 px-2" aria-label="Menü schließen">
                <Icon name="x" size={20} />
              </button>
            </div>
            {navigation}
            {unten && <div className="border-t border-rule px-3 py-3">{unten}</div>}
          </div>
        </div>
      )}

      {hinweis}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
