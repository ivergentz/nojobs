/**
 * Gemeinsame Präsentationsbausteine (Server und Client). Keine Logik, nur Darstellung.
 */
import Icon, { type IconName } from "./Icon";

export function PageHeader({
  eyebrow,
  titel,
  lead,
  aktionen,
  children,
}: {
  eyebrow?: string;
  titel: React.ReactNode;
  lead?: React.ReactNode;
  aktionen?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className={`page-title ${eyebrow ? "mt-1.5" : ""}`}>{titel}</h1>
          {lead && <p className="page-lead">{lead}</p>}
        </div>
        {aktionen && <div className="flex shrink-0 flex-wrap items-center gap-2">{aktionen}</div>}
      </div>
      {children}
    </header>
  );
}

export function SectionHeader({ titel, lead, aktionen, id }: { titel: React.ReactNode; lead?: React.ReactNode; aktionen?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3" id={id}>
      <div className="min-w-0">
        <h2 className="section-title">{titel}</h2>
        {lead && <p className="section-lead">{lead}</p>}
      </div>
      {aktionen && <div className="flex flex-wrap items-center gap-2">{aktionen}</div>}
    </div>
  );
}

export function EmptyState({ icon = "inbox", titel, children }: { icon?: IconName; titel: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-subtle text-muted">
        <Icon name={icon} size={20} />
      </span>
      <p className="mt-3 text-[0.9375rem] font-medium">{titel}</p>
      {children && <div className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function Metric({ label, wert, hinweis, ton }: { label: React.ReactNode; wert: React.ReactNode; hinweis?: React.ReactNode; ton?: "positiv" | "negativ" | "warn" }) {
  const farbe = ton === "positiv" ? "text-keep" : ton === "negativ" ? "text-drop" : ton === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="metric">
      <p className="metric-label">{label}</p>
      <p className={`metric-value ${farbe}`}>{wert}</p>
      {hinweis && <p className="mt-0.5 text-xs text-muted">{hinweis}</p>}
    </div>
  );
}

// Klassen ausgeschrieben, damit Tailwind sie findet (keine zusammengesetzten Namen).
const KLASSE = { info: "alert-info", warn: "alert-warn", error: "alert-error", success: "alert-success" } as const;

export function Hinweis({ ton = "info", titel, children }: { ton?: "info" | "warn" | "error" | "success"; titel?: React.ReactNode; children?: React.ReactNode }) {
  const icon: IconName = ton === "error" ? "circleX" : ton === "warn" ? "alert" : ton === "success" ? "circleCheck" : "info";
  const farbe = ton === "error" ? "text-drop" : ton === "warn" ? "text-warn" : ton === "success" ? "text-keep" : "text-brand";
  return (
    <div className={KLASSE[ton]} role={ton === "error" ? "alert" : undefined}>
      <Icon name={icon} size={18} className={`mt-0.5 ${farbe}`} />
      <div className="min-w-0">
        {titel && <p className="font-medium">{titel}</p>}
        {children && <div className={titel ? "mt-0.5" : ""}>{children}</div>}
      </div>
    </div>
  );
}
