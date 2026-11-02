import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import ProfilWahl from "./ProfilWahl";
import { supabaseAdmin } from "@/lib/supabase";
import { ladeProfile, STANDARD_SLUG } from "@/lib/profil";
import { profilAusCookies } from "@/lib/aktuelles-profil";

export const metadata: Metadata = {
  title: "Career Inbox",
  description: "Kuratierte (AI-)Produktstellen in Hamburg und remote.",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/inbox", label: "Inbox" },
  { href: "/label", label: "Labeln" },
  { href: "/eval", label: "Kalibrierung" },
  { href: "/stats", label: "Statistik" },
  { href: "/analytics", label: "Analytics" },
  { href: "/kosten", label: "Kosten" },
  { href: "/admin", label: "Steuerung" },
  { href: "/log", label: "Log" },
  { href: "/so-funktionierts", label: "So funktioniert's" },
];

/** Schritt 2.2: aktive Profile für die Auswahl oben. Fehler → keine Auswahl, Seite bleibt heil. */
async function profilAuswahl(): Promise<{ profile: Array<{ slug: string; name: string }>; aktuell: string }> {
  try {
    const [{ profile }, aktuell] = await Promise.all([ladeProfile(supabaseAdmin()), profilAusCookies()]);
    const aktive = profile.filter((p) => p.aktiv !== false).map((p) => ({ slug: p.slug, name: p.name }));
    // Ist das gewählte Profil inzwischen deaktiviert, trotzdem anzeigen — die Seiten zeigen ja seine Daten.
    const gewaehlt = profile.find((p) => p.slug === aktuell);
    if (gewaehlt && gewaehlt.aktiv === false) aktive.push({ slug: gewaehlt.slug, name: `${gewaehlt.name} (deaktiviert)` });
    return { profile: aktive, aktuell: gewaehlt ? aktuell : STANDARD_SLUG };
  } catch {
    return { profile: [], aktuell: STANDARD_SLUG };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const auswahl = await profilAuswahl();
  const fremd = auswahl.aktuell !== STANDARD_SLUG ? auswahl.profile.find((p) => p.slug === auswahl.aktuell) : null;
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-rule">
          <ul className="mx-auto flex max-w-3xl gap-5 overflow-x-auto px-6 py-3 text-sm">
            {NAV.map((entry) => (
              <li key={entry.href} className="shrink-0">
                <Link href={entry.href} className="text-muted hover:text-ink">
                  {entry.label}
                </Link>
              </li>
            ))}
            {auswahl.profile.length > 1 && (
              <li className="ml-auto shrink-0">
                <ProfilWahl profile={auswahl.profile} aktuell={auswahl.aktuell} />
              </li>
            )}
          </ul>
        </nav>
        {fremd && (
          <div className="border-b border-rule bg-keep/10">
            <p className="mx-auto max-w-3xl px-6 py-2 text-xs">
              Ansicht für <span className="font-semibold">{fremd.name}</span> — Inbox, Labeln und Kalibrierung zeigen
              die Daten dieses Profils. Steuerung, Statistik, Analytics und Kosten gelten für alle.
            </p>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
