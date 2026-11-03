import { redirect } from "next/navigation";
import { loginAktiv, sicheresZiel, sitzungAusCookies } from "@/lib/sitzung";
import LoginForm from "./LoginForm";
import Icon from "@/components/ui/Icon";
import { Hinweis } from "@/components/ui/Bausteine";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmelden · nojobs" };

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
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white">
            <Icon name="briefcase" size={18} />
          </span>
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">nojobs</span>
            <span className="block text-xs text-muted">Dein Karriereassistent</span>
          </span>
        </div>
        <div className="card-pad sm:p-7">
          <h1 className="text-xl font-semibold tracking-tight">Anmelden</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Gib deine E-Mail-Adresse ein. Du bekommst einen Link, mit dem du dich ohne Passwort anmeldest.
          </p>
          {wert("abgemeldet") && (
            <div className="mt-5">
              <Hinweis ton="success">Du bist abgemeldet.</Hinweis>
            </div>
          )}
          {fehler && MELDUNG[fehler] && (
            <div className="mt-5">
              <Hinweis ton="error">{MELDUNG[fehler]}</Hinweis>
            </div>
          )}
          <LoginForm weiter={weiter} />
        </div>
        <p className="mt-6 text-center text-xs text-muted">Sucht täglich passende Stellen und bewertet sie für dich.</p>
      </div>
    </main>
  );
}
