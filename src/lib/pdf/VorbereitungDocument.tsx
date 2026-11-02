import React from "react";
import { Document, Page, Text, View, Link, StyleSheet } from "@react-pdf/renderer";
import type { Vorbereitung } from "../vorbereitung";
import { COLORS, registerFonts } from "./fonts";

/**
 * Gesprächsvorbereitung als PDF — im Design von Lebenslauf und Anschreiben,
 * aber dichter gesetzt: höchstens zwei A4-Seiten zum Ausdrucken oder fürs Handy.
 * Label-Spalte links (Plex, Crimson), Inhalt rechts (Newsreader).
 */

registerFonts();

const { ink: INK, soft: SOFT, mute: MUTE, accent: ACCENT, line: LINE } = COLORS;

const s = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    paddingTop: 34,
    paddingBottom: 34,
    paddingHorizontal: 42,
    fontFamily: "Newsreader",
    fontSize: 9.4,
    lineHeight: 1.32,
    color: SOFT,
  },
  head: { borderBottomWidth: 2, borderBottomColor: INK, paddingBottom: 8, marginBottom: 6 },
  kicker: { fontFamily: "Plex", fontWeight: 600, fontSize: 7, letterSpacing: 0.2, color: ACCENT },
  title: { fontFamily: "Oswald", fontWeight: 600, fontSize: 17, lineHeight: 1.1, color: INK, marginTop: 3 },
  sub: { fontFamily: "Plex", fontSize: 8, color: MUTE, marginTop: 3 },

  section: { flexDirection: "row", borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6, marginTop: 6 },
  label: { width: 92, fontFamily: "Plex", fontWeight: 600, fontSize: 7, letterSpacing: 0.2, color: ACCENT, paddingTop: 1.5 },
  body: { flex: 1 },

  lead: { fontFamily: "Bodoni", fontStyle: "italic", fontSize: 10.5, lineHeight: 1.3, color: INK, marginBottom: 3 },
  p: { marginBottom: 3 },
  sub2: { fontFamily: "Plex", fontWeight: 600, fontSize: 7.4, color: INK, marginTop: 3, marginBottom: 1.5 },
  bulletRow: { flexDirection: "row", marginBottom: 1.6 },
  dot: { width: 9, color: ACCENT },
  bulletText: { flex: 1 },
  b: { fontFamily: "Plex", fontWeight: 600, fontSize: 8.4, color: INK },
  muted: { color: MUTE },
  quellen: { fontFamily: "Plex", fontSize: 6.8, color: MUTE, marginTop: 2 },
  quelle: { color: MUTE, textDecoration: "none" },

  footer: { position: "absolute", left: 42, right: 42, bottom: 18, fontFamily: "Plex", fontSize: 6.8, color: MUTE, flexDirection: "row", justifyContent: "space-between" },
});

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bulletRow} wrap={false}>
      <Text style={s.dot}>–</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <View style={s.body}>{children}</View>
    </View>
  );
}

export default function VorbereitungDocument({
  data,
  title,
  employer,
  place,
}: {
  data: Vorbereitung;
  title: string;
  employer: string;
  place: string;
}) {
  const erstellt = data.erstellt
    ? new Date(data.erstellt).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Berlin" })
    : "";

  return (
    <Document title={`Gesprächsvorbereitung — ${employer}`} author="Iver Bohnes">
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <Text style={s.kicker}>GESPRÄCHSVORBEREITUNG</Text>
          <Text style={s.title}>{title}</Text>
          <Text style={s.sub}>
            {employer}
            {place ? ` · ${place}` : ""}
          </Text>
        </View>

        <Section label="Unternehmen">
          <Text style={s.p}>{data.unternehmen.kurz}</Text>
          {data.unternehmen.fakten.map((f, i) => (
            <Bullet key={i}>{f}</Bullet>
          ))}
          {data.quellen && data.quellen.length > 0 ? (
            <Text style={s.quellen}>
              Quellen:{" "}
              {data.quellen.slice(0, 4).map((q, i) => (
                <Text key={i}>
                  {i > 0 ? " · " : ""}
                  <Link src={q.url} style={s.quelle}>
                    {q.title.length > 48 ? `${q.title.slice(0, 46)}…` : q.title}
                  </Link>
                </Text>
              ))}
            </Text>
          ) : (
            <Text style={s.quellen}>Ohne Websuche erstellt — Unternehmensangaben prüfen.</Text>
          )}
        </Section>

        <Section label="Die Rolle">
          <Text style={s.lead}>{data.rolle.kern}</Text>
          {data.rolle.aufgaben.map((a, i) => (
            <Bullet key={i}>{a}</Bullet>
          ))}
          <Text style={s.sub2}>Worauf es wirklich ankommt</Text>
          {data.rolle.worauf_es_ankommt.map((a, i) => (
            <Bullet key={i}>{a}</Bullet>
          ))}
        </Section>

        <Section label="Dein Fit">
          {data.fit.staerken.map((st, i) => (
            <Bullet key={i}>
              <Text style={s.b}>{st.punkt} </Text>
              <Text>— {st.beleg}</Text>
            </Bullet>
          ))}
          <Text style={s.sub2}>Lücken und deine Antwort</Text>
          {data.fit.luecken.map((l, i) => (
            <Bullet key={i}>
              <Text style={s.b}>{l.punkt} </Text>
              <Text>— {l.antwort}</Text>
            </Bullet>
          ))}
        </Section>

        <Section label="Pitch, 60 Sek.">
          <Text style={s.p}>{data.pitch}</Text>
        </Section>

        <Section label="Deine Beispiele">
          {data.beispiele.map((b, i) => (
            <View key={i} wrap={false} style={{ marginBottom: 3 }}>
              <Text style={s.b}>{b.titel}</Text>
              <Text>
                <Text style={s.muted}>Situation: </Text>
                {b.situation} <Text style={s.muted}>Vorgehen: </Text>
                {b.vorgehen} <Text style={s.muted}>Ergebnis: </Text>
                {b.ergebnis}
              </Text>
            </View>
          ))}
        </Section>

        <Section label="Fragen an dich">
          {data.fragen_an_dich.map((f, i) => (
            <View key={i} wrap={false} style={{ marginBottom: 2.5 }}>
              <Text style={s.b}>{f.frage}</Text>
              <Text>{f.antwortskizze}</Text>
            </View>
          ))}
        </Section>

        <Section label="Deine Fragen">
          {data.fragen_an_sie.map((f, i) => (
            <Bullet key={i}>{f}</Bullet>
          ))}
        </Section>

        <Section label="Gehalt">
          <Text style={s.p}>{data.gehalt}</Text>
        </Section>

        <View style={s.footer} fixed>
          <Text>Iver Bohnes · Vorbereitung {employer}</Text>
          <Text render={({ pageNumber, totalPages }) => `${erstellt ? `${erstellt} · ` : ""}${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
