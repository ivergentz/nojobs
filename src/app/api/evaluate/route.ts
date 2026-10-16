import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { logFehler } from "@/lib/fehlerlog";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_MODEL } from "@/lib/evaluate";
import { runEvaluation } from "@/lib/run-evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Neue Blöcke nur bis Sekunde 25: ein Modellaufruf kann bis zu 25 Sekunden
 * dauern, danach ist das 60-Sekunden-Limit von Vercel erreicht.
 */
const TIME_BUDGET_DEFAULT = 25_000;

/**
 * ?scope=labeled  — nur Stellen, die Iver selbst beurteilt hat (Kalibrierung)
 * ?scope=all      — alle aktiven Stellen (Standard)
 * ?force=1        — vorhandene Bewertungen überschreiben (nach Prompt-Änderung)
 * ?days=N         — nur Stellen der letzten N Tage
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request)) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const db = supabaseAdmin();
    const result = await runEvaluation(db, {
      budgetMs: Math.min(Number(url.searchParams.get("budget") ?? TIME_BUDGET_DEFAULT), 30_000),
      scope: url.searchParams.get("scope") === "labeled" ? "labeled" : "all",
      force: url.searchParams.get("force") === "1",
      days: url.searchParams.get("days") ? Number(url.searchParams.get("days")) : null,
      limit: Number(url.searchParams.get("limit") ?? "60"),
    });

    if (result.failed > 0) {
      await logFehler(db, [
        {
          quelle: "Bewertung (Claude)",
          detail: `${result.failed} fehlgeschlagen, ${result.evaluated} ok`,
          meldung: result.fehlerbeispiele[0] ?? "unbekannt",
        },
      ]);
    }

    // Alles gescheitert ist ein Fehler, kein "nichts zu tun" — sonst bleibt
    // z. B. ein falscher Modellname oder Schlüssel unbemerkt.
    if (result.evaluated === 0 && result.failed > 0) {
      return NextResponse.json(
        { ok: false, error: result.fehlerbeispiele[0] ?? "Bewertung fehlgeschlagen", ...result },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
      modell: process.env.EVAL_MODEL || DEFAULT_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
