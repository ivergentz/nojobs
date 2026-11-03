import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppShell, { type NavGruppe, type NavPunkt } from "@/components/ui/AppShell";
import Icon from "@/components/ui/Icon";
import ProfilWahl from "./ProfilWahl";
import { supabaseAdmin } from "@/lib/supabase";
import { ladeProfile, STANDARD_SLUG } from "@/lib/profil";
import { profilAusCookies } from "@/lib/aktuelles-profil";
import { loginAktiv, SEITEN_NUTZER, sitzungAusCookies } from "@/lib/sitzung";

// Geist (SIL Open Font License), lokal ausgeliefert — keine Anfrage an fremde Server.
const geist = localFont({ src: "./fonts/Geist-Variable.woff2", weight: "100 900", variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Career Inbox",
  description: "Kuratierte (AI-)Produktstellen in Hamburg und remote.",
  robots: { index: false, follow: false },
};

/* Designdurchgang: dieselben Ziele wie bisher, nur nach Aufgaben gruppiert und verständlicher benannt. */
const JOBS: NavPunkt = { href: "/inbox", label: "Meine Jobs", icon: "inbox" };
const PROFIL: NavPunkt = { href: "/profil", label: "Mein Profil", icon: "user" };
const LABELN: NavPunkt = { href: "/label", label: "Stellen beurteilen", icon: "label" };
const KALIBRIERUNG: NavPunkt = { href: "/eval", label: "Kalibrierung", icon: "sliders" };
const HILFE: NavPunkt = { href: "/so-funktionierts", label: "So funktioniert's", icon: "help" };

function gruppenAdmin(mitProfil: boolean): NavGruppe[] {
  return [
    { punkte: mitProfil ? [JOBS, PROFIL] : [JOBS] },
    { titel: "Trefferqualität", punkte: [LABELN, KALIBRIERUNG] },
    {
      titel: "Auswertung",
      punkte: [
        { href: "/stats", label: "Statistik", icon: "chart" },
        { href: "/analytics", label: "Bewerbungs-Tracking", icon: "activity" },
      ],
    },
    {
      titel: "Betrieb",
      nachrangig: true,
      punkte: [
        { href: "/admin", label: "Steuerung", icon: "settings" },
        { href: "/kosten", label: "Kosten", icon: "receipt" },
        { href: "/log", label: "Log", icon: "log" },
      ],
    },
    { punkte: [HILFE], nachrangig: true },
  ];
}

const GRUPPEN_NUTZER: NavGruppe[] = [
  { punkte: [JOBS, PROFIL] },
  { titel: "Trefferqualität", punkte: [LABELN, KALIBRIERUNG].filter((p) => SEITEN_NUTZER.includes(p.href)) },
  { punkte: [HILFE], nachrangig: true },
];

function Abmelden() {
  return (
    <a href="/api/abmelden" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-muted transition hover:bg-subtle hover:text-ink">
      <Icon name="logout" size={17} />
      Abmelden
    </a>
  );
}

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
  // Schritt 2.3: Ohne Anmeldung (Login-Seite) keine Navigation; weitere Personen sehen nur ihre Seiten.
  const sitzung = await sitzungAusCookies();
  const html = (inhalt: React.ReactNode) => (
    <html lang="de" className={geist.variable}>
      <body className="min-h-screen font-sans antialiased">{inhalt}</body>
    </html>
  );

  if (loginAktiv() && !sitzung) return html(children);

  if (sitzung?.r === "nutzer") {
    return html(
      <AppShell gruppen={GRUPPEN_NUTZER} unten={<Abmelden />}>
        {children}
      </AppShell>
    );
  }

  const auswahl = await profilAuswahl();
  const fremd = auswahl.aktuell !== STANDARD_SLUG ? auswahl.profile.find((p) => p.slug === auswahl.aktuell) : null;
  return html(
    <AppShell
      // Schritt 2.4: „Mein Profil“ nur für weitere Profile — dein Profil nutzt den Lebenslauf der Website.
      gruppen={gruppenAdmin(Boolean(fremd))}
      unten={
        auswahl.profile.length > 1 || sitzung ? (
          <div className="space-y-1">
            {auswahl.profile.length > 1 && <ProfilWahl profile={auswahl.profile} aktuell={auswahl.aktuell} />}
            {sitzung && <Abmelden />}
          </div>
        ) : undefined
      }
      hinweis={
        fremd ? (
          <div className="border-b border-brand/15 bg-brand-soft/70">
            <p className="mx-auto flex max-w-5xl items-start gap-2 px-4 py-2 text-xs leading-relaxed text-brand-strong sm:px-6">
              <Icon name="eye" size={14} className="mt-0.5" />
              <span>
                Ansicht für <span className="font-semibold">{fremd.name}</span> — Inbox, Labeln und Kalibrierung zeigen die Daten dieses
                Profils. Steuerung, Statistik, Analytics und Kosten gelten für alle.
              </span>
            </p>
          </div>
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
