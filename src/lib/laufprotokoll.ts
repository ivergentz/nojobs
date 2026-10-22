/**
 * Protokolliert jeden Nacht- und Morgenlauf — auch die erfolgreichen.
 *
 * Vercel (Hobby) hält Logs nur eine Stunde. Damit man morgens noch sieht, ob
 * der Nachtlauf überhaupt gestartet ist, schreibt jeder Lauf eine Zeile in
 * import_cursor (id "nachtlauf" bzw. "morgenlauf"). Steuerung und Log zeigen sie an.
 * Schlägt das Schreiben fehl, läuft alles normal weiter.
 */

type Db = any;

export type Lauf = "nachtlauf" | "morgenlauf";

export function ausloeser(request: Request): string {
  const ua = request.headers.get("user-agent") ?? "";
  return /vercel-cron/i.test(ua) || request.headers.get("x-vercel-cron-schedule") ? "Cron" : "manuell";
}

export async function protokolliere(db: Db, lauf: Lauf, notiz: string, fertig: boolean): Promise<void> {
  try {
    const jetzt = new Date().toISOString();
    await db.from("import_cursor").upsert(
      {
        id: lauf,
        pages_done: 0,
        items_seen: 0,
        at_end: fertig,
        last_item_date: jetzt,
        last_run_at: jetzt,
        last_note: notiz.slice(0, 500),
      },
      { onConflict: "id" }
    );
  } catch {
    /* Protokoll darf den Lauf nie stören */
  }
}
