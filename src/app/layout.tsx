import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AppShell, { type NavGruppe, type NavPunkt } from "@/components/ui/AppShell";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import { fotoAus, fotoUrl } from "@/lib/foto";
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

/**
 * Weitere Personen: zwei Hauptbereiche, „Stellen beurteilen“ als freiwillige Ergänzung.
 * Kalibrierung ist eine reine Betreiberfunktion und erscheint hier nie (auch die Route ist gesperrt).
 * Hilfe steht unten bei Profil und Abmelden.
 */
const GRUPPEN_NUTZER: NavGruppe[] = [
  { punkte: [JOBS, PROFIL] },
  {
    titel: "Treffer verbessern",
    punkte: [LABELN].filter((p) => SEITEN_NUTZER.includes(p.href)),
    nachrangig: true,
    beschreibung: "Freiwillig: Ein paar Stellen einschätzen — so werden deine Vorschläge schneller treffsicher.",
  },
];

/** Name und Foto der angemeldeten Person (nur weitere Profile). */
async function meinProfilKurz(slug: string): Promise<{ name: string; foto: string | null }> {
  try {
    const { data } = await supabaseAdmin().from("profiles").select("name,einstellungen").eq("slug", slug).maybeSingle();
    const foto = fotoAus((data?.einstellungen ?? null) as Record<string, unknown> | null);
    return { name: String(data?.name ?? slug), foto: fotoUrl(slug, foto) };
  } catch {
    return { name: slug, foto: null };
  }
}

function Abmelden() {
  return (
    <a href="/api/abmelden" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-muted transition hover:bg-subtle hover:text-ink">
      <Icon name="logout" size={17} />
      Abmelden
    </a>
  );
}

/** Schritt 2.2: aktive Profile für die Auswahl oben. Fehler → keine Auswahl, Seite bleibt heil. */
async function profilAuswahl(): Promise<{ profile: Array<{ slug: string; name: string; fotoVersion?: string | null }>; aktuell: string }> {
  try {
    const [{ profile }, aktuell] = await Promise.all([ladeProfile(supabaseAdmin()), profilAusCookies()]);
    const aktive = profile.filter((p) => p.aktiv !== false).map((p) => ({ slug: p.slug, name: p.name, fotoVersion: p.fotoVersion ?? null }));
    // Ist das gewählte Profil inzwischen deaktiviert, trotzdem anzeigen — die Seiten zeigen ja seine Daten.
    const gewaehlt = profile.find((p) => p.slug === aktuell);
    if (gewaehlt && gewaehlt.aktiv === false) aktive.push({ slug: gewaehlt.slug, name: `${gewaehlt.name} (deaktiviert)`, fotoVersion: gewaehlt.fotoVersion ?? null });
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
    const ich = await meinProfilKurz(sitzung.s);
    return html(
      <AppShell
        gruppen={GRUPPEN_NUTZER}
        unten={
          <div className="space-y-1">
            <a href="/so-funktionierts" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm text-muted transition hover:bg-subtle hover:text-ink">
              <Icon name="help" size={17} />
              Hilfe
            </a>
            <a href="/profil" className="flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition hover:bg-subtle">
              <Avatar name={ich.name} src={ich.foto} groesse={28} />
              <span className="min-w-0 truncate font-medium">{ich.name}</span>
            </a>
            <Abmelden />
          </div>
        }
      >
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
