/** Rundes Profilbild — Foto, wenn vorhanden, sonst der Anfangsbuchstabe. */
export default function Avatar({ name, src, groesse = 20 }: { name: string; src?: string | null; groesse?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={groesse} height={groesse} className="shrink-0 rounded-full object-cover ring-1 ring-rule" style={{ width: groesse, height: groesse }} />;
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand-strong"
      style={{ width: groesse, height: groesse, fontSize: Math.max(10, groesse * 0.45) }}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
