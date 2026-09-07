import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Career Inbox — Validierung",
  description: "Zählt, was der NAV-Feed nach dem Hard Filter tatsächlich übrig lässt.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
