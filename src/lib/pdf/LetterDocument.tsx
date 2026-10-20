import React from "react";
import { Document, Page, Text, View, Link, StyleSheet } from "@react-pdf/renderer";
import type { Cv } from "../cv-source";
import { COLORS, registerFonts } from "./fonts";

/**
 * Anschreiben im Design von ivergentz.de, passend zum Lebenslauf:
 * Kopf mit IVER BOHNES (Bohnes in Crimson), "geb. Gentz", Rolle, Kontakt rechts;
 * Betreff in Oswald, Aufmacher kursiv in Bodoni, Fließtext in Newsreader.
 *
 * Absätze dürfen mit einem fett markierten Einstieg beginnen:
 *   "**Eine KI-Initiative aufbauen.** Bei der VBG …"
 * Der Teil zwischen ** erscheint in Oswald-Versalien.
 *
 * Gehaltsvorstellung und Kündigungsfrist stehen als Faktenzeile über dem Gruß,
 * sofern ausgefüllt.
 */

registerFonts();

const { ink: INK, soft: SOFT, mute: MUTE, accent: ACCENT, line: LINE } = COLORS;

const s = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    paddingTop: 44,
    paddingBottom: 40,
    paddingHorizontal: 54,
    fontFamily: "Newsreader",
    fontSize: 10.4,
    lineHeight: 1.42,
    color: SOFT,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2.5,
    borderBottomColor: INK,
    paddingBottom: 11,
  },
  nameRow: { flexDirection: "row" },
  name: { fontFamily: "Oswald", fontWeight: 700, fontSize: 34, lineHeight: 1, color: INK },
  nameB: { fontFamily: "Oswald", fontWeight: 700, fontSize: 34, lineHeight: 1, color: ACCENT },
  former: { fontFamily: "Bodoni", fontStyle: "italic", fontSize: 11, color: MUTE, marginTop: 8 },
  role: { fontFamily: "Oswald", fontWeight: 600, fontSize: 10.5, letterSpacing: 0.6, color: ACCENT, marginTop: 4 },
  contact: { fontFamily: "Plex", fontSize: 7.8, color: SOFT, textAlign: "right", lineHeight: 1.6 },

  meta: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20, marginBottom: 17 },
  to: { fontFamily: "Plex", fontSize: 8.6, color: INK, lineHeight: 1.5 },
  date: { fontFamily: "Plex", fontSize: 8, color: MUTE },

  kicker: { fontFamily: "Plex", fontWeight: 600, fontSize: 7, letterSpacing: 0.2, color: ACCENT, marginBottom: 4 },
  subject: { fontFamily: "Oswald", fontWeight: 600, fontSize: 20, lineHeight: 1.05, color: INK, marginBottom: 14 },

  salutation: { marginBottom: 7 },
  lead: { fontFamily: "Bodoni", fontStyle: "italic", fontSize: 13.5, lineHeight: 1.3, color: INK, marginBottom: 10 },
  p: { marginBottom: 7 },
  b: { fontFamily: "Oswald", fontWeight: 600, fontSize: 9.6, letterSpacing: 0.3, color: INK },

  facts: {
    flexDirection: "row",
    borderTopWidth: 2,
    borderTopColor: INK,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    paddingVertical: 6,
    marginTop: 4,
    marginBottom: 11,
  },
  fact: { flexDirection: "row", alignItems: "center", marginRight: 28 },
  factLabel: { fontFamily: "Plex", fontWeight: 600, fontSize: 7, letterSpacing: 0.2, color: ACCENT, marginRight: 6 },
  factValue: { fontFamily: "Plex", fontWeight: 500, fontSize: 8.2, color: INK },

  closing: { marginBottom: 7 },
  greet: { marginTop: 6 },
  signRow: { flexDirection: "row", marginTop: 3 },
  sign: { fontFamily: "Oswald", fontWeight: 700, fontSize: 18, color: INK },
  signB: { fontFamily: "Oswald", fontWeight: 700, fontSize: 18, color: ACCENT },

  footer: {
    position: "absolute",
    left: 54,
    right: 54,
    bottom: 24,
    fontFamily: "Plex",
    fontSize: 7.2,
    color: MUTE,
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
  salutation?: string;
  closing?: string;
  facts?: { salary?: string; notice?: string };
};

/** "**Einstieg.** Rest" → Einstieg in Oswald-Versalien, Rest normal. */
function Paragraph({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <Text style={s.p}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text key={index} style={s.b}>
            {part.toUpperCase()}
          </Text>
        ) : (
          <Text key={index}>{part}</Text>
        )
      )}
    </Text>
  );
}

export default function LetterDocument({ data, cv }: { data: LetterData; cv: Cv }) {
  const de = data.lang === "de";
  const today = new Date().toLocaleDateString(de ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Berlin",
  });

  // Bei Bewerbungen steht hier der persönliche Link (iverbohnes.de/firma).
  const webText = cv.contact.web.replace(/^https?:\/\//, "");
  const webHref = cv.contact.web.startsWith("http") ? cv.contact.web : `https://${cv.contact.web}`;

  const salary = data.facts?.salary?.trim();
  const notice = data.facts?.notice?.trim();
  const [lead, ...body] = data.headline ? [data.headline, ...data.paragraphs] : [null, ...data.paragraphs];

  return (
    <Document title={de ? "Anschreiben — Iver Bohnes" : "Cover Letter — Iver Bohnes"} author="Iver Bohnes">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>
            <View style={s.nameRow}>
              <Text style={s.name}>IVER </Text>
              <Text style={s.nameB}>BOHNES</Text>
            </View>
            <Text style={s.former}>{cv.formerName}</Text>
            <Text style={s.role}>{(data.role || cv.role).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={s.contact}>Große Freiheit 82, 22767 Hamburg{de ? "" : ", Germany"}</Text>
            <Text style={s.contact}>
              {cv.contact.email} · {cv.contact.phone}
            </Text>
            <Link src={webHref} style={{ ...s.contact, textDecoration: "none" }}>
              {webText}
            </Link>
          </View>
        </View>

        <View style={s.meta}>
          <View>
            {data.recipient.filter(Boolean).map((line, index) => (
              <Text key={index} style={s.to}>
                {line}
              </Text>
            ))}
          </View>
          <Text style={s.date}>Hamburg, {today}</Text>
        </View>

        <Text style={s.kicker}>{de ? "BEWERBUNG" : "APPLICATION"}</Text>
        <Text style={s.subject}>{data.subject.toUpperCase()}</Text>

        <Text style={s.salutation}>
          {data.salutation || (de ? "Sehr geehrte Damen und Herren," : "Dear Hiring Team,")}
        </Text>

        {lead ? <Text style={s.lead}>{lead}</Text> : null}
        {body.map((paragraph, index) => (paragraph ? <Paragraph key={index} text={paragraph} /> : null))}

        {salary || notice ? (
          <View style={s.facts} wrap={false}>
            {salary ? (
              <View style={s.fact}>
                <Text style={s.factLabel}>{de ? "GEHALTSVORSTELLUNG" : "SALARY EXPECTATION"}</Text>
                <Text style={s.factValue}>{salary}</Text>
              </View>
            ) : null}
            {notice ? (
              <View style={s.fact}>
                <Text style={s.factLabel}>{de ? "KÜNDIGUNGSFRIST" : "NOTICE PERIOD"}</Text>
                <Text style={s.factValue}>{notice}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View wrap={false}>
          {data.closing ? <Text style={s.closing}>{data.closing}</Text> : null}
          <Text style={s.greet}>{data.signOff || (de ? "Mit freundlichen Grüßen" : "Kind regards")}</Text>
          <View style={s.signRow}>
            <Text style={s.sign}>IVER </Text>
            <Text style={s.signB}>BOHNES</Text>
          </View>
        </View>

        <Text style={s.footer} fixed>
          {de ? "Anlage: Lebenslauf" : "Enclosure: CV"} · {webText}
        </Text>
      </Page>
    </Document>
  );
}
