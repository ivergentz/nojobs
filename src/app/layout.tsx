import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
  { href: "/admin", label: "Steuerung" },
  { href: "/log", label: "Log" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          </ul>
        </nav>
        {children}
      </body>
    </html>
  );
}
