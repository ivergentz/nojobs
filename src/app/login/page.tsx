import { redirect } from "next/navigation";
import { loginAktiv, sicheresZiel, sitzungAusCookies } from "@/lib/sitzung";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden · Career Inbox" };

const MELDUNG: Record<string, string> = {
  abgelaufen: "Der Link ist abgelaufen oder ungültig. Fordere einfach einen neuen an.",
  gesperrt: "Dieses Profil ist nicht (mehr) freigeschaltet.",
};

/** Schritt 2.3 · Anmelden ohne Passwort: E-Mail eingeben, Link aus der E-Mail anklicken. */
export default async function LoginSeite({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const wert = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : undefined);
  const weiter = sicheresZiel(wert("weiter"));
  if (!loginAktiv() || (await sitzungAusCookies())) redirect(weiter);
  const fehler = wert("fehler");

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <p className="text-sm text-muted">Career Inbox</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Anmelden</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Gib deine E-Mail-Adresse ein. Du bekommst einen Link, mit dem du dich ohne Passwort anmeldest.
      </p>
      {wert("abgemeldet") && <p className="mt-6 text-sm">Du bist abgemeldet.</p>}
      {fehler && MELDUNG[fehler] && <p className="mt-6 text-sm text-drop">{MELDUNG[fehler]}</p>}
      <LoginForm weiter={weiter} />
    </main>
  );
}
