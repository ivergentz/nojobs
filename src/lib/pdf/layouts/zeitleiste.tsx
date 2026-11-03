import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { kontaktZeilen, type LayoutOptionen, type UnterlagenBrief, type UnterlagenCv } from "./typen";

/** Zeitleiste — Werdegang als Zeitstrahl, weiche Formen, Kurzprofil im Kasten. Soziales, Bildung, Pflege, Handwerk. */

const INK = "#1C1C1C";
const SOFT = "#3E3E3E";
const MUTE = "#727272";

/** Akzent stark aufgehellt — für Flächen. */
function hell(hex: string, anteil = 0.9): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const k = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * anteil));
  return `#${k.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const st = (a: string) =>
  StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 40, paddingHorizontal: 44, fontFamily: "NjRund", fontSize: 9.6, lineHeight: 1.45, color: SOFT },
    kopf: { flexDirection: "row", alignItems: "center" },
    foto: { width: 82, height: 82, borderRadius: 41, objectFit: "cover", marginRight: 18 },
    name: { fontSize: 25, fontWeight: 700, color: INK, lineHeight: 1.25 },
    titel: { fontSize: 11.5, fontWeight: 600, color: a, marginTop: 3 },
    kontakt: { flexDirection: "row", flexWrap: "wrap", marginTop: 7 },
    pille: { fontSize: 7.8, color: SOFT, backgroundColor: hell(a, 0.9), borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, marginRight: 5, marginBottom: 4 },
    profil: { marginTop: 16, backgroundColor: hell(a, 0.93), borderRadius: 8, paddingVertical: 11, paddingHorizontal: 14, fontSize: 9.8, lineHeight: 1.5, color: INK },
    h: { marginTop: 18, marginBottom: 9, fontSize: 12, fontWeight: 700, color: a },
    zeile: { flexDirection: "row" },
    zeitSpalte: { width: 88, paddingTop: 0.5, paddingRight: 8, fontSize: 8, fontWeight: 600, color: MUTE, textAlign: "right" },
    strahl: { width: 16, alignItems: "center" },
    punkt: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 2, borderColor: a, backgroundColor: "#FFFFFF", marginTop: 2.5 },
    linie: { flex: 1, width: 1.5, backgroundColor: hell(a, 0.7), marginTop: 1 },
    eInhalt: { flex: 1, paddingLeft: 8, paddingBottom: 11 },
    eTitel: { fontSize: 10.4, fontWeight: 700, color: INK },
    firma: { fontSize: 8.8, color: a, fontWeight: 600 },
    stich: { flexDirection: "row", marginTop: 2 },
    haken: { width: 10, color: a, fontWeight: 700 },
    zwei: { flexDirection: "row", marginTop: 4 },
    spalte: { flex: 1 },
    tags: { flexDirection: "row", flexWrap: "wrap" },
    tag: { fontSize: 8.2, color: INK, borderWidth: 0.8, borderColor: hell(a, 0.55), borderRadius: 9, paddingVertical: 2, paddingHorizontal: 8, marginRight: 5, marginBottom: 5 },
    // Brief
    band: { backgroundColor: hell(a, 0.92), borderRadius: 10, paddingVertical: 14, paddingHorizontal: 18, flexDirection: "row", alignItems: "center" },
    bFoto: { width: 52, height: 52, borderRadius: 26, objectFit: "cover", marginRight: 14 },
    empf: { marginTop: 30, fontSize: 9.8, color: INK, lineHeight: 1.45 },
    datum: { marginTop: 22, textAlign: "right", fontSize: 9, color: MUTE },
    betreff: { marginTop: 18, fontSize: 12.5, fontWeight: 700, color: a },
    absatz: { marginTop: 8.5, fontSize: 10, lineHeight: 1.55 },
    unterschrift: { marginTop: 20, fontSize: 13, fontWeight: 600, fontStyle: "italic", color: a },
  });

export function ZeitleisteCv({ cv, o }: { cv: UnterlagenCv; o: LayoutOptionen }) {
  const s = st(o.akzent);
  const n = cv.stationen.length;
  return (
    <Document title={`Lebenslauf ${cv.name}`} author={cv.name}>
      <Page size="A4" style={s.page}>
        <View style={s.kopf}>
          {o.mitFoto && cv.foto ? <Image src={cv.foto} style={s.foto} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{cv.name}</Text>
            <Text style={s.titel}>{cv.titel}</Text>
            <View style={s.kontakt}>
              {kontaktZeilen(cv.kontakt).map((z, i) => (
                <Text key={i} style={s.pille}>
                  {z}
                </Text>
              ))}
            </View>
          </View>
        </View>
        <Text style={s.profil}>{cv.kurzprofil}</Text>

        <Text style={s.h}>Mein Werdegang</Text>
        {cv.stationen.map((e, i) => (
          <View key={i} style={s.zeile} wrap={false}>
            <Text style={s.zeitSpalte}>{e.zeitraum}</Text>
            <View style={s.strahl}>
              <View style={s.punkt} />
              {i < n - 1 ? <View style={s.linie} /> : null}
            </View>
            <View style={s.eInhalt}>
              <Text style={s.eTitel}>{e.titel}</Text>
              <Text style={s.firma}>{[e.arbeitgeber, e.ort].filter(Boolean).join(" · ")}</Text>
              {e.stichpunkte.map((p, j) => (
                <View key={j} style={s.stich}>
                  <Text style={s.haken}>•</Text>
                  <Text style={{ flex: 1 }}>{p}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={s.zwei} wrap={false}>
          <View style={[s.spalte, { paddingRight: 14 }]}>
            <Text style={[s.h, { marginTop: 6 }]}>Ausbildung</Text>
            {cv.ausbildung.map((a, i) => (
              <View key={i} style={{ marginBottom: 7 }}>
                <Text style={s.eTitel}>{a.abschluss}</Text>
                <Text style={s.firma}>{a.einrichtung}</Text>
                <Text style={{ fontSize: 8, color: MUTE }}>{a.zeitraum}</Text>
              </View>
            ))}
          </View>
          <View style={s.spalte}>
            <Text style={[s.h, { marginTop: 6 }]}>Was ich mitbringe</Text>
            <View style={s.tags}>
              {cv.kenntnisse.map((t, i) => (
                <Text key={i} style={s.tag}>
                  {t}
                </Text>
              ))}
            </View>
            <Text style={[s.h, { marginTop: 8, fontSize: 10.5 }]}>Sprachen</Text>
            <Text>{cv.sprachen.map((sp) => `${sp.sprache} (${sp.niveau})`).join(" · ")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function ZeitleisteBrief({ cv, brief, o }: { cv: UnterlagenCv; brief: UnterlagenBrief; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={brief.betreff} author={cv.name}>
      <Page size="A4" style={[s.page, { paddingHorizontal: 52 }]}>
        <View style={s.band}>
          {o.mitFoto && cv.foto ? <Image src={cv.foto} style={s.bFoto} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={[s.name, { fontSize: 18 }]}>{cv.name}</Text>
            <Text style={{ fontSize: 8, color: SOFT, marginTop: 3 }}>{kontaktZeilen(cv.kontakt).join("  ·  ")}</Text>
          </View>
        </View>
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
      </Page>
    </Document>
  );
}
