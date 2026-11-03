import React from "react";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { kontaktZeilen, type LayoutOptionen, type UnterlagenBrief, type UnterlagenCv } from "./typen";

/**
 * Minimal (ATS) — eine Spalte, keine Grafik, kein Foto, schlichte Schrift (Inter),
 * Überschriften als echter Text in fester Reihenfolge. Bewerbermanagement-Systeme lesen das zuverlässig.
 */

const INK = "#111111";
const SOFT = "#333333";

const st = (a: string) =>
  StyleSheet.create({
    page: { paddingTop: 42, paddingBottom: 44, paddingHorizontal: 54, fontFamily: "NjSans", fontSize: 9.6, lineHeight: 1.4, color: SOFT },
    name: { fontFamily: "NjSans", fontWeight: 700, fontSize: 20, lineHeight: 1.3, color: INK },
    titel: { fontSize: 11, color: a, marginTop: 2 },
    kontakt: { fontSize: 9, marginTop: 5 },
    h: { fontFamily: "NjSans", fontWeight: 700, fontSize: 10.5, color: a, marginTop: 15, marginBottom: 5, paddingBottom: 2, borderBottomWidth: 0.6, borderBottomColor: a, textTransform: "uppercase", letterSpacing: 0.6 },
    eintrag: { marginBottom: 7 },
    eTitel: { fontFamily: "NjSans", fontWeight: 700, fontSize: 10, color: INK },
    meta: { fontSize: 9.4 },
    stich: { flexDirection: "row", marginTop: 1.5 },
    bullet: { width: 9 },
    // Brief
    absatz: { marginTop: 9, fontSize: 10.4, lineHeight: 1.5 },
  });

export function MinimalCv({ cv, o }: { cv: UnterlagenCv; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={`Lebenslauf ${cv.name}`} author={cv.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{cv.name}</Text>
        <Text style={s.titel}>{cv.titel}</Text>
        <Text style={s.kontakt}>{kontaktZeilen(cv.kontakt).join(" | ")}</Text>

        <Text style={s.h}>Profil</Text>
        <Text>{cv.kurzprofil}</Text>

        <Text style={s.h}>Berufserfahrung</Text>
        {cv.stationen.map((e, i) => (
          <View key={i} style={s.eintrag} wrap={false}>
            <Text style={s.eTitel}>{e.titel}</Text>
            <Text style={s.meta}>{[e.arbeitgeber, e.ort, e.zeitraum].filter(Boolean).join(" | ")}</Text>
            {e.stichpunkte.map((p, j) => (
              <View key={j} style={s.stich}>
                <Text style={s.bullet}>•</Text>
                <Text style={{ flex: 1 }}>{p}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={s.h}>Ausbildung</Text>
        {cv.ausbildung.map((a, i) => (
          <View key={i} style={s.eintrag}>
            <Text style={s.eTitel}>{a.abschluss}</Text>
            <Text style={s.meta}>{[a.einrichtung, a.zeitraum].filter(Boolean).join(" | ")}</Text>
          </View>
        ))}

        <Text style={s.h}>Kenntnisse</Text>
        <Text>{cv.kenntnisse.join(", ")}</Text>

        <Text style={s.h}>Sprachen</Text>
        <Text>{cv.sprachen.map((sp) => `${sp.sprache}: ${sp.niveau}`).join(", ")}</Text>
      </Page>
    </Document>
  );
}

export function MinimalBrief({ cv, brief, o }: { cv: UnterlagenCv; brief: UnterlagenBrief; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={brief.betreff} author={cv.name}>
      <Page size="A4" style={[s.page, { paddingHorizontal: 62 }]}>
        <Text style={s.name}>{cv.name}</Text>
        <Text style={s.kontakt}>{kontaktZeilen(cv.kontakt).join(" | ")}</Text>
        <View style={{ marginTop: 36 }}>
          {brief.empfaenger.map((z, i) => (
            <Text key={i}>{z}</Text>
          ))}
        </View>
        <Text style={{ marginTop: 24, textAlign: "right" }}>{brief.ortDatum}</Text>
        <Text style={[s.eTitel, { marginTop: 20, fontSize: 11 }]}>{brief.betreff}</Text>
        <Text style={[s.absatz, { marginTop: 16 }]}>{brief.anrede}</Text>
        {brief.absaetze.map((p, i) => (
          <Text key={i} style={s.absatz}>
            {p}
          </Text>
        ))}
        <Text style={s.absatz}>{brief.schluss}</Text>
        <Text style={[s.absatz, { marginTop: 16 }]}>{brief.gruss}</Text>
        <Text style={[s.absatz, { marginTop: 22 }]}>{cv.name}</Text>
      </Page>
    </Document>
  );
}
