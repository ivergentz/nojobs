import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Row = {
  uuid: string;
  title: string | null;
  employer_name: string | null;
  label: string;
  eval_fit: string | null;
  eval_language: string | null;
  eval_summary: string | null;
};

const LABELS: Record<string, string> = {
  must_apply: "Bewerben",
  worth_reading: "Anschauen",
  ignore: "Ignorieren",
};

const RANK: Record<string, number> = { must_apply: 2, worth_reading: 1, ignore: 0 };
const ORDER = ["must_apply", "worth_reading", "ignore"];

export default async function EvalPage() {
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("jobs")
    .select("uuid,title,employer_name,label,eval_fit,eval_language,eval_summary")
    .eq("status", "ACTIVE")
    .not("label", "is", null)
    .not("evaluated_at", "is", null)
    .limit(500);

  const rows = (data ?? []) as Row[];

  const matrix: Record<string, Record<string, number>> = {};
  for (const mine of ORDER) {
    matrix[mine] = { must_apply: 0, worth_reading: 0, ignore: 0 };
  }
  for (const row of rows) {
    if (row.eval_fit && matrix[row.label]) {
      matrix[row.label][row.eval_fit] = (matrix[row.label][row.eval_fit] ?? 0) + 1;
    }
  }

  const agree = rows.filter((row) => row.label === row.eval_fit).length;
  const rate = rows.length ? Math.round((agree / rows.length) * 100) : 0;

  // Übersehene Treffer: Iver sagt bewerben oder anschauen, das Modell ignoriert.
  // Das ist der teure Fehler — was hier landet, sieht er nie wieder.
  const missed = rows.filter(
    (row) => RANK[row.label] > 0 && row.eval_fit === "ignore"
  );

  // Falscher Alarm: Modell stuft höher ein als Iver.
  const noisy = rows.filter(
    (row) => row.eval_fit && RANK[row.eval_fit] > RANK[row.label] + 0
  );

  const languageBlocked = rows.filter(
    (row) => RANK[row.eval_fit ?? "ignore"] > 0 && row.eval_language === "scandinavian_required"
  ).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="border-b border-rule pb-10">
        <p className="text-sm text-muted">Career Inbox · Kalibrierung</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Urteilt das Modell wie du?
        </h1>
      </header>

      {error && <p className="mt-8 text-sm text-drop">Fehler: {error.message}</p>}

      <section className="border-b border-rule py-12">
        <div className="flex items-baseline gap-4">
          <span className="tnum text-7xl font-semibold leading-none">{rate}%</span>
          <span className="max-w-[16rem] text-sm leading-snug text-muted">
            Übereinstimmung über {rows.length} beurteilte Stellen
          </span>
        </div>

        <p className="mt-6 max-w-xl text-sm leading-relaxed">
          {missed.length === 0
            ? "Kein übersehener Treffer. Das ist der Wert, auf den es ankommt."
            : `${missed.length} übersehene Treffer. Jeder davon wäre in der Inbox nie aufgetaucht — das ist der teure Fehler, nicht die Fehlalarme.`}
        </p>
      </section>

      <section className="border-b border-rule py-12">
        <h2 className="text-lg font-semibold tracking-tight">Wo es auseinandergeht</h2>
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-muted">
              <th className="py-2 font-normal">dein Urteil ↓ / Modell →</th>
              {ORDER.map((key) => (
                <th key={key} className="w-24 py-2 text-right font-normal">
                  {LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER.map((mine) => (
              <tr key={mine} className="border-b border-rule/60">
                <td className="py-2">{LABELS[mine]}</td>
                {ORDER.map((theirs) => {
                  const value = matrix[mine][theirs] ?? 0;
                  const same = mine === theirs;
                  const bad = RANK[mine] > 0 && theirs === "ignore";
                  return (
                    <td
                      key={theirs}
                      className={`tnum py-2 text-right ${
                        same ? "text-keep" : bad && value > 0 ? "font-semibold text-drop" : ""
                      }`}
                    >
                      {value || "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 text-sm leading-relaxed text-muted">
          Die Diagonale ist Übereinstimmung. Rot markiert sind übersehene Treffer. Die rechte obere
          Ecke — du ignorierst, das Modell empfiehlt — ist nur lästig, nicht teuer.
        </p>
      </section>

      {missed.length > 0 && (
        <section className="border-b border-rule py-12">
          <h2 className="text-lg font-semibold tracking-tight text-drop">Übersehene Treffer</h2>
          <ul className="mt-6 space-y-5">
            {missed.map((row) => (
              <li key={row.uuid} className="border-t border-rule/60 pt-4">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="mt-1 text-sm text-muted">
                  {row.employer_name} · dein Urteil: {LABELS[row.label]}
                </p>
                {row.eval_summary && (
                  <p className="mt-2 text-sm leading-relaxed">{row.eval_summary}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="py-12 text-sm">
        <h2 className="text-lg font-semibold tracking-tight">Sprachfilter</h2>
        <p className="mt-3 max-w-xl leading-relaxed text-muted">
          {languageBlocked} inhaltlich passende Stellen scheitern an der Sprache. Das ist die Menge,
          die ein Norwegischkurs zusätzlich öffnen würde.
        </p>

        <h3 className="mt-10 font-semibold">Fehlalarme</h3>
        <p className="mt-2 leading-relaxed text-muted">
          {noisy.length} Stellen stuft das Modell höher ein als du. Solange die Zahl klein bleibt,
          ist das der günstigere Fehler.
        </p>
      </section>
    </main>
  );
}
