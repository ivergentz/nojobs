import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { type LayoutOptionen, type UnterlagenBrief, type UnterlagenCv } from "./typen";

/** Seitenleiste — farbige Spalte links (Foto, Kontakt, Kenntnisse, Sprachen), Werdegang rechts. Agenturen, Startups, Vertrieb. */

const INK = "#161616";
const SOFT = "#3B3B3B";
const MUTE = "#707070";
const LEISTE = 178;

const st = (a: string) =>
  StyleSheet.create({
    page: { flexDirection: "row", fontFamily: "NjSans", fontSize: 9, lineHeight: 1.45, color: SOFT },
    leiste: { width: LEISTE, backgroundColor: a, color: "#FFFFFF", paddingTop: 36, paddingBottom: 30, paddingHorizontal: 20 },
    foto: { width: 104, height: 130, objectFit: "cover", borderRadius: 4, marginBottom: 18, alignSelf: "center" },
    initialen: { width: 76, height: 76, borderRadius: 38, borderWidth: 1.2, borderColor: "#FFFFFF", alignSelf: "center", marginBottom: 18, justifyContent: "center", alignItems: "center" },
    initialenText: { fontSize: 24, fontWeight: 600, color: "#FFFFFF", letterSpacing: 1 },
    lH: { fontSize: 7.2, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: "#FFFFFF", opacity: 0.72, marginTop: 16, marginBottom: 6 },
    lText: { fontSize: 8.4, color: "#FFFFFF", marginBottom: 3.5 },
    lKlein: { fontSize: 7.2, color: "#FFFFFF", opacity: 0.72 },
    balken: { height: 2.5, backgroundColor: "#FFFFFF", opacity: 0.28, borderRadius: 2, marginTop: 2, marginBottom: 6 },
    balkenVoll: { height: 2.5, backgroundColor: "#FFFFFF", borderRadius: 2 },
    haupt: { flex: 1, paddingTop: 38, paddingBottom: 34, paddingHorizontal: 30 },
    name: { fontSize: 26, fontWeight: 700, color: INK, letterSpacing: -0.4, lineHeight: 1.25 },
    titel: { fontSize: 11, fontWeight: 500, color: a, marginTop: 4 },
    lead: { marginTop: 14, fontSize: 9.6, lineHeight: 1.5, color: SOFT },
    h: { marginTop: 18, marginBottom: 8, fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: a },
    eintrag: { marginBottom: 10 },
    eKopf: { flexDirection: "row", justifyContent: "space-between" },
    eTitel: { flex: 1, paddingRight: 8, fontSize: 10, fontWeight: 600, color: INK },
    zeit: { fontSize: 7.8, fontWeight: 500, color: MUTE },
    firma: { fontSize: 8.4, color: a, fontWeight: 500, marginTop: 1 },
    stich: { flexDirection: "row", marginTop: 2.2 },
    dot: { width: 3.2, height: 3.2, borderRadius: 1.6, backgroundColor: a, marginTop: 4.4, marginRight: 6 },
    stichText: { flex: 1 },
    // Brief
    bHaupt: { flex: 1, paddingTop: 44, paddingBottom: 40, paddingHorizontal: 40 },
    empf: { fontSize: 9.4, color: INK, lineHeight: 1.45 },
    datum: { marginTop: 24, fontSize: 8.6, color: MUTE, textAlign: "right" },
    betreff: { marginTop: 20, fontSize: 12, fontWeight: 700, color: INK },
    absatz: { marginTop: 8.5, fontSize: 9.6, lineHeight: 1.55 },
    unterschrift: { marginTop: 20, fontSize: 11, fontWeight: 600, color: a },
  });

const NIVEAU: Record<string, number> = { muttersprache: 1, c2: 1, c1: 0.85, b2: 0.7, b1: 0.55, a2: 0.4, a1: 0.25 };
const anteil = (niveau: string) => {
  const n = niveau.toLowerCase();
  const k = Object.keys(NIVEAU).find((x) => n.includes(x));
  return k ? NIVEAU[k] : 0.6;
};
const initialen = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function Leiste({ s, cv, o, kurz }: { s: ReturnType<typeof st>; cv: UnterlagenCv; o: LayoutOptionen; kurz?: boolean }) {
  const k = cv.kontakt;
  const kontakt = [
    ["Ort", k.ort],
    ["Telefon", k.telefon],
    ["E-Mail", k.email],
    ["LinkedIn", k.linkedin],
    ["Xing", k.xing],
    ["Web", k.web],
  ].filter((z): z is [string, string] => Boolean(z[1]));
  return (
    <View style={s.leiste}>
      {o.mitFoto && cv.foto ? (
        <Image src={cv.foto} style={s.foto} />
      ) : (
        <View style={s.initialen}>
          <Text style={s.initialenText}>{initialen(cv.name)}</Text>
        </View>
      )}
      <Text style={[s.lH, { marginTop: 0 }]}>Kontakt</Text>
      {kontakt.map(([l, w]) => (
        <View key={l} style={{ marginBottom: 5 }}>
          <Text style={s.lKlein}>{l}</Text>
          <Text style={[s.lText, { marginBottom: 0 }]}>{w}</Text>
        </View>
      ))}
      {!kurz && (
        <>
          <Text style={s.lH}>Kenntnisse</Text>
          {cv.kenntnisse.map((t, i) => (
            <Text key={i} style={s.lText}>
              {t}
            </Text>
          ))}
          <Text style={s.lH}>Sprachen</Text>
          {cv.sprachen.map((sp, i) => (
            <View key={i}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={[s.lText, { marginBottom: 0 }]}>{sp.sprache}</Text>
                <Text style={s.lKlein}>{sp.niveau}</Text>
              </View>
              <View style={s.balken}>
                <View style={[s.balkenVoll, { width: `${Math.round(anteil(sp.niveau) * 100)}%` }]} />
              </View>
            </View>
          ))}
        </>
      )}
    </View>
  );
}

export function SeitenleisteCv({ cv, o }: { cv: UnterlagenCv; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={`Lebenslauf ${cv.name}`} author={cv.name}>
      <Page size="A4" style={s.page}>
        <Leiste s={s} cv={cv} o={o} />
        <View style={s.haupt}>
          <Text style={s.name}>{cv.name}</Text>
          <Text style={s.titel}>{cv.titel}</Text>
          <Text style={s.lead}>{cv.kurzprofil}</Text>
          <Text style={s.h}>Berufserfahrung</Text>
          {cv.stationen.map((e, i) => (
            <View key={i} style={s.eintrag} wrap={false}>
              <View style={s.eKopf}>
                <Text style={s.eTitel}>{e.titel}</Text>
                <Text style={s.zeit}>{e.zeitraum}</Text>
              </View>
              <Text style={s.firma}>{[e.arbeitgeber, e.ort].filter(Boolean).join(" · ")}</Text>
              {e.stichpunkte.map((p, j) => (
                <View key={j} style={s.stich}>
                  <View style={s.dot} />
                  <Text style={s.stichText}>{p}</Text>
                </View>
              ))}
            </View>
          ))}
          <Text style={s.h}>Ausbildung</Text>
          {cv.ausbildung.map((a, i) => (
            <View key={i} style={s.eintrag} wrap={false}>
              <View style={s.eKopf}>
                <Text style={s.eTitel}>{a.abschluss}</Text>
                <Text style={s.zeit}>{a.zeitraum}</Text>
              </View>
              <Text style={s.firma}>{a.einrichtung}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export function SeitenleisteBrief({ cv, brief, o }: { cv: UnterlagenCv; brief: UnterlagenBrief; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={brief.betreff} author={cv.name}>
      <Page size="A4" style={s.page}>
        <Leiste s={s} cv={cv} o={o} kurz />
        <View style={s.bHaupt}>
          <Text style={[s.name, { fontSize: 20 }]}>{cv.name}</Text>
          <Text style={[s.titel, { marginBottom: 30 }]}>{cv.titel}</Text>
          <View style={s.empf}>
            {brief.empfaenger.map((z, i) => (
              <Text key={i}>{z}</Text>
            ))}
          </View>
          <Text style={s.datum}>{brief.ortDatum}</Text>
          <Text style={s.betreff}>{brief.betreff}</Text>
          <Text style={[s.absatz, { marginTop: 14 }]}>{brief.anrede}</Text>
          {brief.absaetze.map((p, i) => (
            <Text key={i} style={s.absatz}>
              {p}
            </Text>
          ))}
          <Text style={s.absatz}>{brief.schluss}</Text>
          <Text style={[s.absatz, { marginTop: 14 }]}>{brief.gruss}</Text>
          <Text style={s.unterschrift}>{cv.name}</Text>
        </View>
      </Page>
    </Document>
  );
}
