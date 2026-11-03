import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { speichereEinstellungen } from "@/lib/profil";
import { EINWILLIGUNG_VERSION } from "@/lib/einwilligung";

export const dynamic = "force-dynamic";

/** POST {} → Einwilligung (aktuelle Fassung) mit Zeitpunkt in den eigenen Einstellungen festhalten. Dein Profil: nicht nötig. */
export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return NextResponse.json({ error: "Für dein Profil nicht nötig." }, { status: 400 });
  const einwilligung = { version: EINWILLIGUNG_VERSION, at: new Date().toISOString() };
  const ok = await speichereEinstellungen(supabaseAdmin(), profil, { einwilligung });
  if (!ok.ok) return NextResponse.json({ error: ok.fehler }, { status: 500 });
  return NextResponse.json({ einwilligung });
}
