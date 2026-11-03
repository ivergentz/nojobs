import React from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { kontaktZeilen, type LayoutOptionen, type UnterlagenBrief, type UnterlagenCv } from "./typen";

/** Editorial — große Display-Schrift, Label-Spalte links, kursive Akzente. Produkt, Digital, Kreativ. */

const INK = "#141414";
const SOFT = "#3D3D3D";
const MUTE = "#6E6E68";
const LINE = "#DCDCD6";
const LABEL = 98;

const st = (a: string) =>
  StyleSheet.create({
    page: { paddingTop: 36, paddingBottom: 44, paddingHorizontal: 46, fontFamily: "NjText", fontSize: 10, lineHeight: 1.42, color: SOFT },
    kopf: { flexDirection: "row", alignItems: "flex-end", paddingBottom: 14, borderBottomWidth: 2.5, borderBottomColor: INK },
    name: { fontFamily: "NjDisplay", fontWeight: 700, fontSize: 38, lineHeight: 1.2, color: INK, textTransform: "uppercase" },
    titel: { fontFamily: "NjText", fontStyle: "italic", fontSize: 13, color: a, marginTop: 5 },
    kontakt: { flexDirection: "row", flexWrap: "wrap", marginTop: 9, fontFamily: "NjSans", fontSize: 7.8, color: SOFT },
    punkt: { color: MUTE, marginHorizontal: 5 },
    foto: { width: 68, height: 85, objectFit: "cover", marginLeft: 16 },
    abschnitt: { flexDirection: "row", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: LINE },
    label: { width: LABEL, paddingRight: 12, paddingTop: 2.5, fontFamily: "NjSans", fontWeight: 600, fontSize: 7, letterSpacing: 0.4, color: a, textTransform: "uppercase" },
    inhalt: { flex: 1 },
    lead: { fontSize: 11.6, lineHeight: 1.38, color: INK },
    eintrag: { marginBottom: 8 },
    eKopf: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    eTitel: { flex: 1, paddingRight: 8, fontFamily: "NjDisplay", fontWeight: 600, fontSize: 11.6, color: INK, letterSpacing: 0.2 },
    zeit: { fontFamily: "NjSans", fontSize: 7.6, color: MUTE },
    firma: { fontFamily: "NjSans", fontWeight: 500, fontSize: 7.6, color: SOFT, marginTop: 1.5, letterSpacing: 0.2 },
    stich: { flexDirection: "row", marginTop: 2.5 },
    strich: { width: 9, color: a },
    stichText: { flex: 1 },
    chips: { flexDirection: "row", flexWrap: "wrap" },
    chip: { fontFamily: "NjSans", fontSize: 8, color: INK, marginRight: 10, marginBottom: 3 },
    // Brief
    bKopf: { paddingBottom: 12, borderBottomWidth: 2.5, borderBottomColor: INK, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
    bName: { fontFamily: "NjDisplay", fontWeight: 700, fontSize: 24, lineHeight: 1.25, color: INK, textTransform: "uppercase" },
    bKontakt: { fontFamily: "NjSans", fontSize: 7.6, color: SOFT, textAlign: "right", lineHeight: 1.5 },
    empf: { marginTop: 34, fontFamily: "NjSans", fontSize: 9, color: INK, lineHeight: 1.45 },
    datum: { marginTop: 22, textAlign: "right", fontFamily: "NjSans", fontSize: 8.6, color: MUTE },
    betreff: { marginTop: 18, fontFamily: "NjDisplay", fontWeight: 600, fontSize: 13, color: INK, letterSpacing: 0.2 },
    absatz: { marginTop: 9, fontSize: 10.6, lineHeight: 1.5, color: SOFT },
    gruss: { marginTop: 18, fontSize: 10.6 },
    unterschrift: { marginTop: 22, fontFamily: "NjText", fontStyle: "italic", fontSize: 14, color: a },
  });

function Abschnitt({ s, titel, children, letzter }: { s: ReturnType<typeof st>; titel: string; children: React.ReactNode; letzter?: boolean }) {
  return (
    <View style={[s.abschnitt, letzter ? { borderBottomWidth: 0 } : {}]} wrap={false}>
      <Text style={s.label}>{titel}</Text>
      <View style={s.inhalt}>{children}</View>
    </View>
  );
}

export function EditorialCv({ cv, o }: { cv: UnterlagenCv; o: LayoutOptionen }) {
  const s = st(o.akzent);
  const k = kontaktZeilen(cv.kontakt);
  return (
    <Document title={`Lebenslauf ${cv.name}`} author={cv.name}>
      <Page size="A4" style={s.page}>
        <View style={s.kopf}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{cv.name}</Text>
            <Text style={s.titel}>{cv.titel}</Text>
            <View style={s.kontakt}>
              {k.map((z, i) => (
                <Text key={i}>
                  {i > 0 && <Text style={s.punkt}> · </Text>}
                  {z}
                </Text>
              ))}
            </View>
          </View>
          {o.mitFoto && cv.foto ? <Image src={cv.foto} style={s.foto} /> : null}
        </View>

        <Abschnitt s={s} titel="Profil">
          <Text style={s.lead}>{cv.kurzprofil}</Text>
        </Abschnitt>
        <View style={[s.abschnitt]}>
          <Text style={s.label}>Erfahrung</Text>
          <View style={s.inhalt}>
            {cv.stationen.map((e, i) => (
              <View key={i} style={s.eintrag} wrap={false}>
                <View style={s.eKopf}>
                  <Text style={s.eTitel}>{e.titel}</Text>
                  <Text style={s.zeit}>{e.zeitraum}</Text>
                </View>
                <Text style={s.firma}>{[e.arbeitgeber, e.ort].filter(Boolean).join(" · ")}</Text>
                {e.stichpunkte.map((p, j) => (
                  <View key={j} style={s.stich}>
                    <Text style={s.strich}>–</Text>
                    <Text style={s.stichText}>{p}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </View>
        <Abschnitt s={s} titel="Ausbildung">
          {cv.ausbildung.map((a, i) => (
            <View key={i} style={s.eintrag}>
              <View style={s.eKopf}>
                <Text style={[s.eTitel, { fontSize: 10.6 }]}>{a.abschluss}</Text>
                <Text style={s.zeit}>{a.zeitraum}</Text>
              </View>
              <Text style={s.firma}>{a.einrichtung}</Text>
            </View>
          ))}
        </Abschnitt>
        <Abschnitt s={s} titel="Kenntnisse">
          <View style={s.chips}>
            {cv.kenntnisse.map((k2, i) => (
              <Text key={i} style={s.chip}>
                {k2}
              </Text>
            ))}
          </View>
        </Abschnitt>
        <Abschnitt s={s} titel="Sprachen" letzter>
          <Text>{cv.sprachen.map((sp) => `${sp.sprache} (${sp.niveau})`).join("  ·  ")}</Text>
        </Abschnitt>
      </Page>
    </Document>
  );
}

export function EditorialBrief({ cv, brief, o }: { cv: UnterlagenCv; brief: UnterlagenBrief; o: LayoutOptionen }) {
  const s = st(o.akzent);
  return (
    <Document title={brief.betreff} author={cv.name}>
      <Page size="A4" style={[s.page, { paddingHorizontal: 58 }]}>
        <View style={s.bKopf}>
          <View>
            <Text style={s.bName}>{cv.name}</Text>
            <Text style={[s.titel, { fontSize: 11 }]}>{cv.titel}</Text>
          </View>
          <View>
            {kontaktZeilen(cv.kontakt).map((z, i) => (
              <Text key={i} style={s.bKontakt}>
                {z}
              </Text>
            ))}
          </View>
        </View>
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
        <Text style={s.gruss}>{brief.gruss}</Text>
        <Text style={s.unterschrift}>{cv.name}</Text>
      </Page>
    </Document>
  );
}

