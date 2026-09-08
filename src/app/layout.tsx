import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Inbox",
  description: "Kuratierte Stellen aus Norwegen und Schweden.",
};

const NAV = [
  { href: "/inbox", label: "Inbox" },
  { href: "/label", label: "Labeln" },
  { href: "/eval", label: "Kalibrierung" },
  { href: "/stats", label: "Statistik" },
  { href: "/admin", label: "Steuerung" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-rule">
          <ul className="mx-auto flex max-w-3xl gap-5 px-6 py-3 text-sm">
            {NAV.map((entry) => (
              <li key={entry.href}>
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
