import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

/**
 * Anschreiben im selben Layout wie der Lebenslauf.
 *
 * Gleiche Tokens wie CVPdfDocument: Crimson-Akzent, Times für Überschriften,
 * Courier für Metazeilen, Helvetica für Fließtext. Nur Standard-PDF-Schriften,
 * deshalb keine Schriftdateien nötig.
 */

const CRIMSON = "#DC143C";
const INK = "#0A0A0A";
const FG = "#141414";
const MUTED = "#6B6B66";
const HAIRLINE = "#D6D4CC";
const PAPER = "#FFFFFF";

const styles = StyleSheet.create({
  page: {
    backgroundColor: PAPER,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: FG,
    lineHeight: 1.55,
  },
  header: {
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
    marginBottom: 20,
  },
  name: { fontFamily: "Times-Roman", fontSize: 34, color: INK, marginBottom: 2 },
  role: { fontFamily: "Times-Italic", fontSize: 13, color: FG, marginBottom: 10 },
  meta: { fontSize: 8.5, color: MUTED, fontFamily: "Courier" },

  recipientBlock: { marginBottom: 22 },
  recipient: { fontSize: 10, color: FG, lineHeight: 1.5 },
  dateLine: { fontFamily: "Courier", fontSize: 8.5, color: MUTED, marginTop: 14 },

  subjectWrap: { flexDirection: "row", marginBottom: 16 },
  subject: {
    fontFamily: "Courier-Bold",
    fontSize: 8,
    color: PAPER,
    backgroundColor: CRIMSON,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    letterSpacing: 1.5,
  },

  headline: { fontFamily: "Times-Roman", fontSize: 15, color: INK, marginBottom: 12 },
  paragraph: { fontSize: 10, color: FG, lineHeight: 1.55, marginBottom: 10 },

  signOff: { marginTop: 18, fontSize: 10, color: FG },
  signature: { fontFamily: "Times-Roman", fontSize: 14, color: INK, marginTop: 10 },
  footer: {
    marginTop: 26,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: HAIRLINE,
    fontFamily: "Courier",
    fontSize: 7.5,
    color: MUTED,
  },
});

export type LetterData = {
  lang: "de" | "en";
  role: string;
  recipient: string[];
  subject: string;
  headline: string;
  paragraphs: string[];
  signOff: string;
};

export default function LetterDocument({ data }: { data: LetterData }) {
  const de = data.lang === "de";
  const today = new Date().toLocaleDateString(de ? "de-DE" : "en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <Document
      title={de ? "Anschreiben — Iver Bohnes" : "Cover Letter — Iver Bohnes"}
      author="Iver Bohnes"
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.name}>Iver Bohnes</Text>
          <Text style={styles.role}>{data.role}</Text>
          <Text style={styles.meta}>
            Hamburg, {de ? "Deutschland" : "Germany"} · iverbohnes@gmail.com · +49 176 66631237 ·
            ivergentz.de
          </Text>
        </View>

        <View style={styles.recipientBlock}>
          {data.recipient.map((line, index) => (
            <Text key={index} style={styles.recipient}>
              {line}
            </Text>
          ))}
          <Text style={styles.dateLine}>
            Hamburg, {today}
          </Text>
        </View>

        <View style={styles.subjectWrap}>
          <Text style={styles.subject}>{data.subject.toUpperCase()}</Text>
        </View>

        {data.headline ? <Text style={styles.headline}>{data.headline}</Text> : null}

        {data.paragraphs.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}

        <Text style={styles.signOff}>{data.signOff}</Text>
        <Text style={styles.signature}>Iver Bohnes</Text>

        <Text style={styles.footer}>
          {de
            ? "Anlagen: Lebenslauf · Referenzen auf Anfrage"
            : "Enclosed: CV · References on request"}
        </Text>
      </Page>
    </Document>
  );
}
