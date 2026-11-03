import Link from "next/link";
import type { ReactNode } from "react";
import Icon, { type IconName } from "@/components/ui/Icon";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";

/**
 * „So funktioniert's“ — Bedienung von nojobs Schritt für Schritt, für alle, die das Tool
 * zum ersten Mal nutzen. Gleiche Wörter wie in der App (Mein Profil, Stellen beurteilen,
 * Kalibrierung, Vormerken …). Technik nur, wo sie für die Bedienung zählt.
 * Was nur dein Profil betrifft (Suchspuren, eigene Website), steht in einem eigenen Kasten.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "So funktioniert's · nojobs" };

type Schritt = {
  nr: number;
  icon: IconName;
  titel: string;
  wo: { text: string; href: string };
  text: ReactNode;
  tun: string[];
  bild?: ReactNode;
  bald?: boolean;
};

/* ---------- kleine Bausteine für die Bilder ---------- */

const Chip = ({ children, ton = "neutral" }: { children: ReactNode; ton?: "neutral" | "keep" | "drop" | "brand" | "warn" }) => {
  const t = {
    neutral: "border-rule bg-surface text-ink",
    keep: "border-keep/30 bg-keep-soft text-keep",
    drop: "border-drop/30 bg-drop-soft text-drop",
    brand: "border-brand/30 bg-brand-soft text-brand-strong",
    warn: "border-warn/30 bg-warn-soft text-warn",
  }[ton];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${t}`}>{children}</span>;
};
const Pfeil = () => <Icon name="chevronRight" size={14} className="shrink-0 text-muted" />;
const Taste = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border border-rule bg-surface px-1.5 py-0.5 font-mono text-2xs text-muted">{children}</kbd>
);
const Bild = ({ children }: { children: ReactNode }) => (
  <div aria-hidden className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-rule bg-paper/60 p-3">
    {children}
  </div>
);

function schritte(eigenes: boolean): Array<{ phase: string; dauer: string; schritte: Schritt[] }> {
  return [
    {
      phase: "Einrichten",
      dauer: "einmalig, etwa 15 Minuten",
      schritte: [
        {
          nr: 1,
          icon: "upload",
          titel: "Lebenslauf hochladen",
          wo: { text: "Mein Profil → Lebenslauf", href: "/profil#lebenslauf" },
          text: "nojobs liest deinen Lebenslauf aus, schlägt dir 2–3 berufliche Richtungen vor und prüft ihn auf Lücken und Schwachstellen. Erfunden wird nichts.",
          tun: ["PDF oder Word-Datei (.docx) wählen", "etwa eine halbe Minute warten — die Seite offen lassen"],
          bild: (
            <>
              <Chip>
                <Icon name="file" size={13} /> lebenslauf.pdf
              </Chip>
              <Pfeil />
              <Chip ton="brand">Richtungen</Chip>
              <Chip ton="warn">Prüfbericht</Chip>
            </>
          ),
        },
        {
          nr: 2,
          icon: "file",
          titel: "Lebenslauf verbessern",
          wo: { text: "Mein Profil → Lebenslauf bearbeiten", href: "/profil/lebenslauf" },
          text: "Jeder Verbesserungsvorschlag steht genau an der Stelle, die du ändern solltest — zum Beispiel direkt bei der betroffenen Station. Ändern, abhaken, speichern.",
          tun: ["Kontaktdaten und die Zeile unter deinem Namen ergänzen", "Vorschläge abarbeiten und abhaken", "optional ein Foto hochladen"],
          bild: (
            <>
              <Chip ton="drop">Wichtig</Chip>
              <Chip ton="warn">Verbessern</Chip>
              <Chip>Hinweis</Chip>
              <Pfeil />
              <Chip ton="keep">
                <Icon name="check" size={13} /> erledigt
              </Chip>
            </>
          ),
        },
        {
          nr: 3,
          icon: "search",
          titel: "Suchprofil anlegen",
          wo: { text: "Mein Profil → Suchprofil", href: "/profil#suchprofil" },
          text: "Ein paar Fragen: Welche Richtung, welcher Ort und Umkreis, vor Ort oder remote, Voll- oder Teilzeit, Gehalt, No-Gos. Daraus schlägt nojobs Suchbegriffe und Regeln für die Bewertung vor.",
          tun: ["Fragebogen ausfüllen", "„Suchprofil vorschlagen“ klicken"],
          bild: (
            <>
              <Chip>Richtung</Chip>
              <Chip>Ort + Umkreis</Chip>
              <Chip>Gehalt</Chip>
              <Chip>No-Gos</Chip>
              <Pfeil />
              <Chip ton="brand">Suchbegriffe + Regeln</Chip>
            </>
          ),
        },
        {
          nr: 4,
          icon: "sliders",
          titel: "Suchprofil prüfen und anpassen",
          wo: { text: "Mein Profil → Suchprofil", href: "/profil#suchprofil" },
          text: "Der Vorschlag ist ein Startpunkt. Streiche Suchbegriffe, die nicht passen, ergänze fehlende, und lies die Regeln: So entscheidet nojobs später, was du zu sehen bekommst.",
          tun: ["Suchbegriffe und Regeln bearbeiten", "„Suchprofil übernehmen“ klicken"],
        },
        {
          nr: 5,
          icon: "refresh",
          titel: "Erste Stellen suchen",
          wo: { text: "Mein Profil → Suchprofil", href: "/profil#suchprofil" },
          text: "Damit du nicht bis morgen warten musst: nojobs sucht einmal die Stellen der letzten Tage zusammen und bewertet sie. Danach läuft die Suche jede Nacht von allein.",
          tun: ["„Jetzt nach neuen Stellen suchen“ klicken", "warten, bis alle Stellen bewertet sind — der Balken zeigt den Fortschritt"],
        },
        {
          nr: 6,
          icon: "label",
          titel: "Stellen beurteilen",
          wo: { text: "Stellen beurteilen", href: "/label" },
          text: "Du siehst Stellen ohne die Einschätzung von nojobs und sagst ehrlich, ob du dich bewerben würdest. Aus diesen Urteilen lernt nojobs, wie du entscheidest. Bauchgefühl reicht.",
          tun: ["anfangs etwa 30 Stellen, danach ab und zu 10–15 pro Woche", "bei „Anschauen“ und „Ignorieren“ kurz den Grund antippen — das hilft am meisten"],
          bild: (
            <>
              <Chip ton="keep">
                Bewerben <Taste>1</Taste>
              </Chip>
              <Chip>
                Anschauen <Taste>2</Taste>
              </Chip>
              <Chip ton="drop">
                Ignorieren <Taste>3</Taste>
              </Chip>
              <Pfeil />
              <Chip>Gehalt zu niedrig</Chip>
              <Chip>Fahrtweg zu weit</Chip>
            </>
          ),
        },
        {
          nr: 7,
          icon: "send",
          titel: "Telegram verbinden",
          wo: { text: "Mein Profil → Telegram", href: "/profil#benachrichtigung" },
          text: "Jeden Morgen eine kurze Nachricht aufs Handy, wenn eine neue Stelle zum Bewerben dabei ist. An Tagen ohne Treffer bleibt es still.",
          tun: ["„Mit Telegram verbinden“ klicken", "am Computer: QR-Code mit dem Handy abscannen, in Telegram auf „Start“ tippen"],
        },
        {
          nr: 8,
          icon: "file",
          titel: "Aussehen der Unterlagen wählen",
          wo: { text: "Mein Profil → Unterlagen", href: "/profil#unterlagen" },
          text: "Fünf Layouts für Lebenslauf und Anschreiben — von klassisch bis modern, eins davon extra gut lesbar für Bewerbersysteme großer Firmen. Dazu Akzentfarbe und Foto an oder aus.",
          tun: ["Layout und Farbe wählen", "„Vorschau Lebenslauf“ ansehen", "„Auswahl speichern“"],
        },
      ],
    },
    {
      phase: "Jeden Tag",
      dauer: "ein paar Minuten",
      schritte: [
        {
          nr: 9,
          icon: "inbox",
          titel: "Neue Stellen in Meine Jobs ansehen",
          wo: { text: "Meine Jobs", href: "/inbox" },
          text: "Jede Nacht sucht nojobs neue Stellen, morgens bewertet es sie. In „Meine Jobs“ landen nur die passenden — mit kurzer Begründung, was dafür und was dagegen spricht.",
          tun: ["„Anzeige öffnen“ zum Lesen", "Interessantes mit „Vormerken“ für später sichern"],
          bild: (
            <>
              <Chip ton="keep">
                <Icon name="flame" size={13} /> Bewerben
              </Chip>
              <span className="text-xs text-muted">passt sehr gut</span>
              <Chip>
                <Icon name="eye" size={13} /> Anschauen
              </Chip>
              <span className="text-xs text-muted">könnte passen — selbst prüfen</span>
            </>
          ),
        },
        {
          nr: 10,
          icon: "briefcase",
          titel: "Bewerben und Unterlagen erstellen",
          wo: { text: "Meine Jobs → Unterlagen", href: "/inbox" },
          text: eigenes
            ? "Für jede Stelle schreibt nojobs Anschreiben und Lebenslauf passend zur Anzeige — als PDF zum Herunterladen. Setzt du den Status auf „Beworben“, entsteht eine Vorbereitung fürs Vorstellungsgespräch."
            : "Für jede Stelle schreibt nojobs ein Anschreiben und schärft deinen Lebenslauf auf die Anzeige zu — nur aus deinem Lebenslauf, im Layout deiner Wahl (nojobs schlägt pro Stelle eins vor). Setzt du den Status auf „Beworben“, entsteht eine Vorbereitung fürs Vorstellungsgespräch.",
          tun: eigenes
            ? ["bewerben, dann Status „Beworben“ setzen", "im Status-Menü weiter: „Interview“ oder „Absage“"]
            : ["„Unterlagen“ öffnen → „Unterlagen erstellen“", "lesen, anpassen, speichern, als PDF laden", "nach dem Absenden: „Beworben“ — die Gesprächsvorbereitung entsteht von allein"],
        },
        {
          nr: 11,
          icon: "archive",
          titel: "Ablegen — mit Grund",
          wo: { text: "Meine Jobs → Status → Ablegen", href: "/inbox" },
          text: "Passt eine Stelle nicht, leg sie ab. nojobs fragt kurz nach dem Grund. Wichtig ist die Unterscheidung: Passt die Stelle nicht — oder passte sie, aber es gab einen anderen Grund?",
          tun: ["„Passt nicht“: nojobs schlägt so etwas seltener vor", "„Passt eigentlich, aber …“ (schon beworben, Frist vorbei …): zählt nicht gegen die Stelle"],
          bild: (
            <>
              <Chip ton="drop">Passt nicht</Chip>
              <span className="text-xs text-muted">oder</span>
              <Chip ton="keep">Passt eigentlich, aber …</Chip>
            </>
          ),
        },
      ],
    },
    {
      phase: "Ab und zu",
      dauer: "alle 1–2 Wochen",
      schritte: [
        {
          nr: 12,
          icon: "chart",
          titel: "Kalibrierung prüfen",
          wo: { text: "Kalibrierung", href: "/eval" },
          text: "Hier siehst du, wie gut die Vorschläge von nojobs zu deinen Urteilen passen: Wie viele Stellen, die du sehen willst, zeigt nojobs auch — und wie viele Vorschläge waren daneben?",
          tun: ["Trefferquote ansehen", "Fehlgriffe durchsehen — oft zeigen sie, welche Regel fehlt"],
        },
        {
          nr: 13,
          icon: "sliders",
          titel: "Suchprofil nachschärfen",
          wo: { text: "Mein Profil → Suchprofil", href: "/profil#suchprofil" },
          text: "Kommen zu viele unpassende Stellen oder fehlen dir welche? Dann Suchbegriffe oder Regeln anpassen und neu übernehmen. Ab dem nächsten Lauf gilt das neue Profil.",
          tun: ["Suchbegriffe ergänzen oder streichen", "Regeln schärfen, z. B. „keine Zeitarbeit“", "„Änderungen übernehmen“"],
        },
      ],
    },
  ];
}

const STATUS: Array<{ name: string; ton: "neutral" | "keep" | "drop" | "brand" | "warn"; was: string }> = [
  { name: "Neu", ton: "neutral", was: "frisch vorgeschlagen" },
  { name: "Vorgemerkt", ton: "brand", was: "will ich mir genauer ansehen" },
  { name: "Beworben", ton: "keep", was: "Bewerbung ist raus" },
  { name: "Interview", ton: "keep", was: "Einladung bekommen" },
];

const SIGNALE: Array<{ was: string; wirkung: string; staerke: number }> = [
  { was: "Status „Beworben“", wirkung: "Das stärkste Ja — hier hast du wirklich gehandelt.", staerke: 3 },
  { was: "Urteil „Ignorieren“ mit Grund", wirkung: "Der Grund erklärt nojobs das Warum — wirkt auf alle ähnlichen Stellen.", staerke: 3 },
  { was: "Ablegen mit „Passt nicht“", wirkung: "Genau der Fehlgriff, den nojobs künftig vermeiden soll.", staerke: 2 },
  { was: "Urteil „Bewerben“ / „Anschauen“", wirkung: "So etwas willst du sehen.", staerke: 2 },
  { was: "Ablegen mit „Passt eigentlich, aber …“", wirkung: "Zählt nicht gegen die Stelle — nojobs schlägt Ähnliches weiter vor.", staerke: 1 },
  { was: "Absagegrund eintragen", wirkung: "Hürden wie „Erfahrung X fehlt“ werden bei ähnlichen Stellen als Nachteil genannt.", staerke: 1 },
];

export default async function SoFunktioniertsPage() {
  const eigenes = istStandard(await profilAusCookies());
  const phasen = schritte(eigenes);

  return (
    <main className="page">
      <header className="mb-2">
        <p className="eyebrow">Anleitung</p>
        <h1 className="page-title mt-1.5">So funktioniert&apos;s</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          nojobs sucht jede Nacht neue Stellen, bewertet sie morgens für dich und zeigt dir nur, was zu dir passt. Je öfter du sagst, was
          du davon hältst, desto genauer wird es.
        </p>
      </header>

      {/* Der Kreislauf auf einen Blick */}
      <section className="card-pad mt-5" aria-labelledby="kreislauf">
        <h2 id="kreislauf" className="section-title">
          Auf einen Blick
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-4">
          {[
            { icon: "search" as const, t: "Nachts", d: "nojobs sucht neue Stellen zu deinem Suchprofil" },
            { icon: "sparkles" as const, t: "Morgens", d: "jede Stelle wird bewertet: Bewerben, Anschauen oder Ignorieren" },
            { icon: "inbox" as const, t: "Tagsüber", d: "du siehst die passenden in Meine Jobs — und auf Wunsch per Telegram" },
            { icon: "refresh" as const, t: "Immer", d: "deine Urteile fließen in die nächste Bewertung ein" },
          ].map((s, i) => (
            <li key={s.t} className="relative rounded-lg border border-rule bg-paper/60 p-4">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand-strong">
                <Icon name={s.icon} size={17} />
              </span>
              <p className="mt-3 font-semibold">{s.t}</p>
              <p className="mt-1 text-sm leading-snug text-muted">{s.d}</p>
              {i < 3 && (
                <span aria-hidden className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 rounded-full bg-surface sm:block">
                  <Icon name="chevronRight" size={16} className="text-muted" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Inhaltsübersicht */}
      <nav aria-label="Schritte" className="mt-5 flex flex-wrap gap-2 text-sm">
        {phasen.map((p) => (
          <a key={p.phase} href={`#${p.phase.toLowerCase().replace(/\s+/g, "-")}`} className="btn-secondary btn-sm">
            {p.phase} · Schritt {p.schritte[0].nr}–{p.schritte.at(-1)!.nr}
          </a>
        ))}
        <a href="#lernen" className="btn-secondary btn-sm">
          Wie nojobs lernt
        </a>
      </nav>

      {phasen.map((p) => (
        <section key={p.phase} id={p.phase.toLowerCase().replace(/\s+/g, "-")} className="mt-8 scroll-mt-4" aria-labelledby={`h-${p.phase}`}>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <h2 id={`h-${p.phase}`} className="text-lg font-semibold tracking-tight">
              {p.phase}
            </h2>
            <span className="text-sm text-muted">{p.dauer}</span>
          </div>
          <ol className="mt-3 space-y-3">
            {p.schritte.map((s) => (
              <li key={s.nr} className="card-pad">
                <div className="flex items-start gap-4">
                  <div className="flex shrink-0 flex-col items-center gap-1.5">
                    <span className="tnum grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{s.nr}</span>
                    <Icon name={s.icon} size={16} className="text-muted" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">
                        {s.titel}
                        {s.bald && <span className="badge-neutral ml-2 align-middle">bald</span>}
                      </h3>
                      <Link href={s.wo.href} className="link inline-flex items-center gap-1 text-xs">
                        {s.wo.text} <Icon name="chevronRight" size={12} />
                      </Link>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{s.text}</p>
                    <ul className="mt-2.5 space-y-1 text-sm">
                      {s.tun.map((t) => (
                        <li key={t} className="flex gap-2">
                          <Icon name="check" size={14} className="mt-[3px] shrink-0 text-keep" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                    {s.bild && <Bild>{s.bild}</Bild>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {/* Status einer Stelle */}
      <section className="card-pad mt-8" aria-labelledby="status">
        <h2 id="status" className="section-title">
          Der Weg einer Stelle in Meine Jobs
        </h2>
        <p className="section-lead">Den Status änderst du an jeder Stelle über „Status“. Jeder Status hat einen eigenen Reiter.</p>
        <div className="mt-4 flex flex-wrap items-start gap-2">
          {STATUS.map((s, i) => (
            <div key={s.name} className="flex items-start gap-2">
              <div className="flex flex-col items-start gap-1">
                <Chip ton={s.ton}>{s.name}</Chip>
                <span className="max-w-[9rem] text-xs leading-snug text-muted">{s.was}</span>
              </div>
              {i < STATUS.length - 1 && (
                <span className="pt-1.5">
                  <Pfeil />
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-rule/70 pt-4 text-sm">
          <span className="flex items-center gap-2">
            <Chip ton="drop">Absage</Chip> <span className="text-muted">nach einer Bewerbung — gern mit dem genannten Grund</span>
          </span>
          <span className="flex items-center gap-2">
            <Chip>Abgelegt</Chip> <span className="text-muted">jederzeit möglich, mit Grund</span>
          </span>
        </div>
      </section>

      {/* Lernen */}
      <section id="lernen" className="card-pad mt-5 scroll-mt-4" aria-labelledby="lernen-h">
        <h2 id="lernen-h" className="section-title">
          Wie nojobs von dir lernt
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed">
          Bei jeder Bewertung bekommt nojobs deine neuesten Urteile als Beispiele mit — wie eine Einarbeitung, die jeden Morgen frisch ist.
          Was du heute beurteilst, wirkt ab dem nächsten Lauf. Feste Regeln aus deinem Suchprofil gehen dabei immer vor.
        </p>
        <ul className="mt-4 divide-y divide-rule/70 text-sm">
          {SIGNALE.map((s) => (
            <li key={s.was} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-4">
              <span className="flex shrink-0 items-center gap-2 font-medium sm:w-72">
                <span aria-label={`Wirkung ${s.staerke} von 3`} className="flex gap-0.5">
                  {[1, 2, 3].map((n) => (
                    <span key={n} className={`h-2 w-2 rounded-full ${n <= s.staerke ? "bg-brand" : "bg-rule"}`} />
                  ))}
                </span>
                {s.was}
              </span>
              <span className="text-muted">{s.wirkung}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card-pad mt-5" aria-labelledby="wissen">
        <h2 id="wissen" className="section-title">
          Gut zu wissen
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed">
          <li>
            <span className="font-semibold">Woher die Stellen kommen:</span>{" "}
            {eigenes
              ? "Arbeitsagentur, ausgewählte Karriereseiten, Google Jobs und Arbeitnow. Doppelte Anzeigen werden zusammengeführt."
              : "aus der Jobbörse der Bundesagentur für Arbeit — dort stehen fast alle Stellen in Deutschland."}
          </li>
          <li>
            <span className="font-semibold">Am Anfang liegt nojobs öfter daneben.</span> Nach den ersten 20–30 Urteilen wird es deutlich
            genauer. „Nicht vorgeschlagen“ heißt nicht „unpassend“ — ab und zu selbst schauen lohnt sich.
          </li>
          <li>
            <span className="font-semibold">Deine Daten:</span> Lebenslauf und Foto liegen in einem privaten, nicht öffentlichen Speicher.
            Andere Nutzer sehen sie nicht — nur du und die Person, die nojobs betreibt.
          </li>
          <li>
            <span className="font-semibold">Telegram</span> meldet sich nur, wenn mindestens eine Stelle zum Bewerben dabei ist.
          </li>
        </ul>
      </section>

      {eigenes && (
        <section className="card-pad mt-5 border-brand/30 bg-brand-soft/30" aria-labelledby="nur-du">
          <h2 id="nur-du" className="section-title">
            Nur in deinem Profil
          </h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed">
            <li>
              <span className="font-semibold">Zwei Suchspuren:</span> KI &amp; Automatisierung und Career Upgrade (Senior-, Lead- und
              Head-of-Rollen). Der Filter über Meine Jobs trennt beide.
            </li>
            <li>
              <span className="font-semibold">Doppelte Bewerbungen:</span> Hast du dich in den letzten 60 Tagen bei einer Firma beworben,
              warnt Meine Jobs bei jeder weiteren Stelle dort.
            </li>
            <li>
              <span className="font-semibold">Unterlagen</span> kommen mit Daten und Design deiner Website, mit persönlichem Bewerbungs-Link,
              dessen Aufrufe in Meine Jobs angezeigt werden.
            </li>
          </ul>
        </section>
      )}
    </main>
  );
}
