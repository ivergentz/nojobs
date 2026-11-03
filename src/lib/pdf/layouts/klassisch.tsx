import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { kontaktZeilen, type LayoutOptionen, type UnterlagenBrief, type UnterlagenCv } from "./typen";

/** Klassisch — Serifenschrift, zentrierter Kopf, eine Spalte, feine Doppellinie. Verwaltung, Banken, öffentlicher Dienst. */

const INK = "#1B1B1B";
const SOFT = "#383838";
const MUTE = "#6B6B6B";
const LINE = "#CFCFCF";

const st = (a: string) =>
  StyleSheet.create({
    page: { paddingTop: 32, paddingBottom: 38, paddingHorizontal: 58, fontFamily: "NjSerif", fontSize: 10, lineHeight: 1.45, color: SOFT },
    kopf: { alignItems: "center", paddingBottom: 12 },
    foto: { width: 56, height: 70, objectFit: "cover", marginBottom: 8, borderWidth: 0.5, borderColor: LINE },
    name: { fontFamily: "NjSerif", fontWeight: 600, fontSize: 24, lineHeight: 1.3, color: INK, letterSpacing: 1.2 },
    titel: { fontFamily: "NjSerif", fontStyle: "italic", fontSize: 11.5, color: a, marginTop: 3 },
    kontakt: { marginTop: 7, fontSize: 8.4, color: MUTE, textAlign: "center" },
    doppel: { borderTopWidth: 1.2, borderTopColor: a, paddingTop: 1.6, marginBottom: 4 },
    doppelInnen: { borderTopWidth: 0.4, borderTopColor: a },
    abschnitt: { marginTop: 11 },
    hKopf: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    h: { fontFamily: "NjSerif", fontWeight: 600, fontSize: 9.2, color: a, letterSpacing: 1.6, textTransform: "uppercase", marginRight: 8 },
    hLinie: { flex: 1, borderTopWidth: 0.5, borderTopColor: LINE },
    eintrag: { flexDirection: "row", marginBottom: 6 },
    zeit: { width: 86, fontSize: 8.8, color: MUTE, paddingTop: 0.8 },
    eInhalt: { flex: 1 },
    eTitel: { fontWeight: 600, fontSize: 10.4, color: INK },
    firma: { fontStyle: "italic", fontSize: 9.4, color: SOFT },
    stich: { flexDirection: "row", marginTop: 1.8 },
    bullet: { width: 9, color: a },
    stichText: { flex: 1 },
    // Brief
    bKopf: { alignItems: "center", paddingBottom: 10 },
    bName: { fontWeight: 600, fontSize: 18, lineHeight: 1.3, color: INK, letterSpacing: 1 },
    absender: { fontSize: 7.6, color: MUTE, textDecoration: "underline", marginTop: 34 },
    empf: { marginTop: 6, fontSize: 10, color: INK, lineHeight: 1.4 },
    datum: { marginTop: 26, textAlign: "right", fontSize: 9.6 },
    betreff: { marginTop: 22, fontWeight: 600, fontSize: 11, color: INK },
    absatz: { marginTop: 9, fontSize: 10.4, lineHeight: 1.5, textAlign: "justify" },
    unterschrift: { marginTop: 24, fontStyle: "italic", fontSize: 13, color: a },
  });

function Kopfzeile({ s, titel }: { s: ReturnType<typeof st>; titel: string }) {
  return (
    <View style={s.hKopf}>
      <Text style={s.h}>{titel}</Text>
      <View style={s.hLinie} />
    </View>
  );
}

export function KlassischCv({ cv, o }: { cv: UnterlagenCv; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={`Lebenslauf ${cv.name}`} author={cv.name}>
      <Page size="A4" style={s.page}>
        <View style={s.kopf}>
          {o.mitFoto && cv.foto ? <Image src={cv.foto} style={s.foto} /> : null}
          <Text style={s.name}>{cv.name}</Text>
          <Text style={s.titel}>{cv.titel}</Text>
          <Text style={s.kontakt}>{kontaktZeilen(cv.kontakt).join("   ·   ")}</Text>
        </View>
        <View style={s.doppel}>
          <View style={s.doppelInnen} />
        </View>

        <View style={s.abschnitt}>
          <Kopfzeile s={s} titel="Profil" />
          <Text style={{ textAlign: "justify" }}>{cv.kurzprofil}</Text>
        </View>
        <View style={s.abschnitt}>
          <Kopfzeile s={s} titel="Berufserfahrung" />
          {cv.stationen.map((e, i) => (
            <View key={i} style={s.eintrag} wrap={false}>
              <Text style={s.zeit}>{e.zeitraum}</Text>
              <View style={s.eInhalt}>
                <Text style={s.eTitel}>{e.titel}</Text>
                <Text style={s.firma}>{[e.arbeitgeber, e.ort].filter(Boolean).join(", ")}</Text>
                {e.stichpunkte.map((p, j) => (
                  <View key={j} style={s.stich}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.stichText}>{p}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
        <View style={s.abschnitt} wrap={false}>
          <Kopfzeile s={s} titel="Ausbildung" />
          {cv.ausbildung.map((a, i) => (
            <View key={i} style={s.eintrag}>
              <Text style={s.zeit}>{a.zeitraum}</Text>
              <View style={s.eInhalt}>
                <Text style={s.eTitel}>{a.abschluss}</Text>
                <Text style={s.firma}>{a.einrichtung}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={s.abschnitt} wrap={false}>
          <Kopfzeile s={s} titel="Kenntnisse und Sprachen" />
          <View style={s.eintrag}>
            <Text style={s.zeit}>Fachlich</Text>
            <Text style={s.eInhalt}>{cv.kenntnisse.join(" · ")}</Text>
          </View>
          <View style={s.eintrag}>
            <Text style={s.zeit}>Sprachen</Text>
            <Text style={s.eInhalt}>{cv.sprachen.map((sp) => `${sp.sprache} (${sp.niveau})`).join(" · ")}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export function KlassischBrief({ cv, brief, o }: { cv: UnterlagenCv; brief: UnterlagenBrief; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={brief.betreff} author={cv.name}>
      <Page size="A4" style={[s.page, { paddingHorizontal: 64 }]}>
        <View style={s.bKopf}>
          <Text style={s.bName}>{cv.name}</Text>
          <Text style={s.kontakt}>{kontaktZeilen(cv.kontakt).join("   ·   ")}</Text>
        </View>
        <View style={s.doppel}>
          <View style={s.doppelInnen} />
        </View>
        <Text style={s.absender}>{[cv.name, cv.kontakt.ort].filter(Boolean).join(" · ")}</Text>
        <View style={s.empf}>
          {brief.empfaenger.map((z, i) => (
            <Text key={i}>{z}</Text>
          ))}
        </View>
        <Text style={s.datum}>{brief.ortDatum}</Text>
        <Text style={s.betreff}>{brief.betreff}</Text>
        <Text style={[s.absatz, { marginTop: 16 }]}>{brief.anrede}</Text>
        {brief.absaetze.map((p, i) => (
          <Text key={i} style={s.absatz}>
            {p}
          </Text>
        ))}
        <Text style={s.absatz}>{brief.schluss}</Text>
        <Text style={[s.absatz, { marginTop: 16 }]}>{brief.gruss}</Text>
        <Text style={s.unterschrift}>{cv.name}</Text>
      </Page>
    </Document>
  );
}
