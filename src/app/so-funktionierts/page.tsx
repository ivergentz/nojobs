import Link from "next/link";

/**
 * "So funktioniert's" — erklärt Nutzerinnen und Nutzern, was die Career Inbox
 * macht und wie die Bewertung aus ihren Urteilen lernt. Bewusst ohne Technik-
 * Jargon; Schaubilder als inline-SVG, damit sie mit der Seite skalieren.
 */

export const metadata = { title: "So funktioniert's · Career Inbox" };

const INK = "#16181d";
const MUTED = "#6d6f76";
const RULE = "#d9d8d2";
const KEEP = "#1f6f4a";

function Box({
  x,
  y,
  w,
  titel,
  zeilen,
  akzent = false,
}: {
  x: number;
  y: number;
  w: number;
  titel: string;
  zeilen: string[];
  akzent?: boolean;
}) {
  const h = 40 + zeilen.length * 16;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        fill={akzent ? KEEP : "none"}
        fillOpacity={akzent ? 0.08 : 1}
        stroke={akzent ? KEEP : RULE}
        strokeWidth={akzent ? 2 : 1.25}
      />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fontSize={13} fontWeight={600} fill={INK}>
        {titel}
      </text>
      {zeilen.map((z, i) => (
        <text key={i} x={x + w / 2} y={y + 42 + i * 16} textAnchor="middle" fontSize={11.5} fill={MUTED}>
          {z}
        </text>
      ))}
    </g>
  );
}

function Pfeil({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={MUTED} strokeWidth={1.25} markerEnd="url(#pfeil)" />;
}

function PfeilDefs() {
  return (
    <defs>
      <marker id="pfeil" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill={MUTED} />
      </marker>
    </defs>
  );
}

/** Schaubild 1: der Tag in drei Schritten. */
function Tagesablauf() {
  const w = 200;
  return (
    <svg viewBox="0 0 720 132" role="img" aria-label="Nachts suchen, morgens bewerten, tagsüber entscheidest du" className="w-full min-w-[640px]">
      <PfeilDefs />
      <Box x={8} y={16} w={w} titel="Nachts: Suchen" zeilen={["Jobbörsen, Karriereseiten,", "Google Jobs — nur neue Stellen"]} />
      <Box x={260} y={16} w={w} titel="Morgens: Bewerten" zeilen={["jede Stelle gegen dein Profil,", "deine Regeln und Urteile"]} />
      <Box x={512} y={16} w={w} titel="Tagsüber: Du" zeilen={["Inbox + Telegram, Status,", "Unterlagen, Vorbereitung"]} akzent />
      <Pfeil d="M208 52H258" />
      <Pfeil d="M460 52H510" />
      <text x={360} y={124} textAnchor="middle" fontSize={11.5} fill={MUTED}>
        Nur Stellen mit „Bewerben“ oder „Anschauen“ landen in deiner Inbox.
      </text>
    </svg>
  );
}

/** Schaubild 2: die Lernschleife. */
function Lernschleife() {
  return (
    <svg viewBox="0 0 720 300" role="img" aria-label="Deine Urteile fließen bei jedem Lauf als Beispiele in die Bewertung" className="w-full min-w-[640px]">
      <PfeilDefs />
      <Box x={260} y={8} w={200} titel="Bewertung" zeilen={["liest bei jedem Lauf", "Regeln + deine Beispiele"]} akzent />
      <Box x={512} y={120} w={200} titel="Vorschlag" zeilen={["🔥 Bewerben, 👍 Anschauen", "oder Ignorieren + Grund"]} />
      <Box x={260} y={228} w={200} titel="Dein Urteil" zeilen={["Label + Grund, Bewerbung,", "Ablegen, Absagegrund"]} />
      <Box x={8} y={120} w={200} titel="Deine Beispiele" zeilen={["die neuesten Urteile,", "häufigste Gründe als Muster"]} />
      <Pfeil d="M460 40H612V118" />
      <Pfeil d="M612 194V260H462" />
      <Pfeil d="M258 260H108V194" />
      <Pfeil d="M108 118V40H258" />
      <text x={624} y={88} fontSize={11.5} fill={MUTED}>morgens</text>
      <text x={624} y={222} fontSize={11.5} fill={MUTED}>du entscheidest</text>
      <text x={100} y={222} textAnchor="end" fontSize={11.5} fill={MUTED}>wird gespeichert</text>
      <text x={100} y={88} textAnchor="end" fontSize={11.5} fill={MUTED}>nächster Lauf</text>
    </svg>
  );
}

const SIGNALE: Array<{ was: string; wirkung: string }> = [
  { was: "Label „Bewerben“ / „Anschauen“", wirkung: "So etwas will ich sehen." },
  { was: "Label „Ignorieren“ mit Grund", wirkung: "Das stärkste Signal — der Grund erklärt dem Modell das Warum." },
  { was: "Status „Beworben“", wirkung: "Noch stärker als ein Label: hier hast du wirklich gehandelt." },
  { was: "„Ablegen“ in der Inbox", wirkung: "Das Modell lag daneben — genau der Fehler, den es vermeiden soll." },
  { was: "Absagegrund eintragen", wirkung: "Hürden wie „Erfahrung X fehlt“ werden bei ähnlichen Stellen als Nachteil genannt." },
];

export default function SoFunktioniertsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-rule pb-8">
        <p className="text-sm text-muted">Career Inbox · Anleitung</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">So funktioniert&apos;s</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Die Career Inbox durchsucht jede Nacht die Jobbörsen, bewertet morgens jede neue Stelle für
          dich und zeigt dir nur, was passt. Je mehr du urteilst, desto genauer wird sie.
        </p>
      </header>

      <section className="border-b border-rule py-10">
        <h2 className="text-lg font-semibold tracking-tight">1. Dein Tag mit der Career Inbox</h2>
        {/* Auf dem Handy seitlich scrollbar statt winzig */}
        <div className="-mx-6 mt-6 overflow-x-auto px-6">
          <Tagesablauf />
        </div>
        <ul className="mt-6 space-y-2 text-sm leading-relaxed">
          <li>
            <span className="font-semibold">Nachts</span> holt das Tool neue Stellen aus Arbeitsagentur,
            ausgewählten Karriereseiten, Google Jobs und Arbeitnow. Doppelte Anzeigen werden zusammengeführt.
          </li>
          <li>
            <span className="font-semibold">Morgens</span> liest eine KI (Claude) jede neue Stelle und
            ordnet sie ein: 🔥 Bewerben, 👍 Anschauen oder Ignorieren — mit kurzer Begründung, Vor- und
            Nachteilen. Ist etwas zum Bewerben dabei, kommt eine Telegram-Nachricht.
          </li>
          <li>
            <span className="font-semibold">Du</span> entscheidest in der{" "}
            <Link href="/inbox" className="underline underline-offset-4">
              Inbox
            </Link>
            : vormerken, bewerben, ablegen. Für jede Stelle erzeugt das Tool auf Wunsch Anschreiben und
            Lebenslauf, beim Status „Beworben“ eine Gesprächsvorbereitung.
          </li>
        </ul>
      </section>

      <section className="border-b border-rule py-10">
        <h2 className="text-lg font-semibold tracking-tight">2. Wie die Bewertung lernt</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed">
          Das Modell wird nicht umtrainiert. Stattdessen bekommt es bei <em>jedem</em> Lauf deine neuesten
          Urteile als Beispiele mit — wie eine Einarbeitung, die jeden Morgen frisch ist. Was du heute
          labelst, wirkt ab dem nächsten Lauf.
        </p>
        <div className="-mx-6 mt-6 overflow-x-auto px-6">
          <Lernschleife />
        </div>
        <h3 className="mt-8 text-sm font-semibold">Was das Modell aus deinem Verhalten mitnimmt</h3>
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {SIGNALE.map((s) => (
              <tr key={s.was} className="border-t border-rule/70 align-top">
                <td className="w-2/5 py-2 pr-4 font-medium">{s.was}</td>
                <td className="py-2 text-muted">{s.wirkung}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Feste Regeln (z. B. Ort, Ausschlüsse) haben Vorrang vor Beispielen. Widerspricht ein altes Urteil
          einer Regel, gilt die Regel.
        </p>
      </section>

      <section className="border-b border-rule py-10">
        <h2 className="text-lg font-semibold tracking-tight">3. So hilfst du dem Tool am meisten</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>
            <span className="font-semibold">Anfangs 30 Stellen labeln</span> unter{" "}
            <Link href="/label" className="underline underline-offset-4">
              Labeln
            </Link>{" "}
            — Bauchgefühl reicht. Tasten 1/2/3, danach optional einen Grund wählen.
          </li>
          <li>
            <span className="font-semibold">Gründe angeben, wenn es schnell geht.</span> Ein Klick auf
            „Gehalt zu niedrig“ oder „Ort / kein Remote“ sagt dem Modell mehr als zehn Urteile ohne Grund.
          </li>
          <li>
            <span className="font-semibold">Status pflegen.</span> „Beworben“, „Absage“, „Ablegen“ — jede
            Bewegung ist ein Signal.
          </li>
          <li>
            <span className="font-semibold">Unpassendes ablegen statt liegen lassen.</span> So lernt das
            Modell genau aus seinen Fehlgriffen.
          </li>
        </ol>
      </section>

      <section className="py-10">
        <h2 className="text-lg font-semibold tracking-tight">4. Gut zu wissen</h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed">
          <li>
            <span className="font-semibold">Zwei Suchspuren:</span> 🤖 KI &amp; Automatisierung und ⬆️
            Career Upgrade (Senior-, Lead- und Head-of-Rollen). Der Filter über der Inbox trennt beide.
          </li>
          <li>
            <span className="font-semibold">Doppelte Bewerbungen:</span> Hast du dich in den letzten 60 Tagen
            bei einer Firma beworben, warnt die Inbox bei jeder weiteren Stelle dort.
          </li>
          <li>
            <span className="font-semibold">Telegram:</span> Nachrichten kommen nur, wenn mindestens eine
            Stelle zum Bewerben dabei ist — morgens zwischen 8 und 9 Uhr.
          </li>
          <li>
            <span className="font-semibold">Fehler sind normal.</span> Das Modell liegt manchmal daneben,
            besonders am Anfang. „Nicht vorgeschlagen“ heißt nicht „unpassend“ — wer sucht, schaut ab und zu
            auch selbst.
          </li>
        </ul>
      </section>
    </main>
  );
}
