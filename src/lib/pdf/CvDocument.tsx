import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

/**
 * CVPdfDocument — A4, white base, crimson accent.
 *
 * v1.3.8 layout restoration:
 *   - Two-page target layout matching the prior PDF behaviour:
 *     Page 1 = Header + Tagline + ALL THREE products with bullets
 *     Page 2 = Experience + Education + Skills + Languages
 *   - Per-row `wrap={false}` removed so bullets stay with their parent
 *     row even if the row pushes near a page edge — the row will move
 *     to the next page as a unit instead of leaving the heading orphaned.
 *   - Hard page break before Experience removed — let pdf-renderer place
 *     the section naturally.
 *   - Reduced section spacing slightly so two pages fit more reliably.
 */

const CRIMSON = '#DC143C';
const INK = '#0A0A0A';
const FG = '#141414';
const MUTED = '#6B6B66';
const HAIRLINE = '#D6D4CC';
const PAPER = '#FFFFFF';

const styles = StyleSheet.create({
  page: {
    backgroundColor: PAPER,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: FG,
    lineHeight: 1.45,
  },
  header: {
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: HAIRLINE,
    marginBottom: 16,
  },
  name: {
    fontFamily: 'Times-Roman',
    fontSize: 34,
    lineHeight: 1.15,
    color: INK,
    marginBottom: 6,
  },
  role: {
    fontFamily: 'Times-Italic',
    fontSize: 13,
    lineHeight: 1.3,
    color: FG,
    marginBottom: 10,
  },
  meta: {
    fontSize: 8.5,
    color: MUTED,
    fontFamily: 'Courier',
  },
  tagline: {
    fontFamily: 'Times-Italic',
    fontSize: 11.5,
    color: FG,
    marginBottom: 18,
    lineHeight: 1.45,
  },

  sectionLabelWrap: {
    flexDirection: 'row',
    marginTop: 4,
    marginBottom: 10,
  },
  sectionLabel: {
    fontFamily: 'Courier-Bold',
    fontSize: 8,
    color: PAPER,
    backgroundColor: CRIMSON,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    letterSpacing: 1.5,
  },

  /* Two-column row: 100px period | flex body */
  row: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  period: {
    width: 100,
    fontFamily: 'Courier',
    fontSize: 8.5,
    color: MUTED,
    paddingTop: 2,
    lineHeight: 1.4,
  },
  periodStatus: {
    color: MUTED,
    fontFamily: 'Courier',
    fontSize: 8,
    marginTop: 1,
  },
  body: { flex: 1 },

  /* Product variants */
  productName: {
    fontFamily: 'Times-Roman',
    fontSize: 15,
    lineHeight: 1.25,
    color: INK,
    marginBottom: 3,
  },
  productUrlWrap: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  productUrl: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: PAPER,
    backgroundColor: CRIMSON,
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 4,
    paddingRight: 4,
  },

  /* Experience variants */
  title: {
    fontFamily: 'Times-Roman',
    fontSize: 12,
    lineHeight: 1.25,
    color: FG,
    marginBottom: 3,
  },
  company: {
    fontSize: 9.5,
    color: MUTED,
    marginBottom: 4,
  },

  bulletList: { marginTop: 1 },
  bullet: { flexDirection: 'row', marginBottom: 2 },
  bulletMark: { width: 10, color: CRIMSON, fontSize: 9.5 },
  bulletText: { flex: 1, fontSize: 9.5, lineHeight: 1.4, color: FG },

  stack: {
    fontFamily: 'Courier',
    fontSize: 7.5,
    color: MUTED,
    marginTop: 4,
  },

  /* Education */
  eduTitle: { fontFamily: 'Times-Roman', fontSize: 11, lineHeight: 1.3, color: FG },
  eduSchool: { fontSize: 8.5, color: MUTED },

  /* Skills grid */
  skillsGrid: { flexDirection: 'row', gap: 14 },
  skillCol: { flex: 1 },
  skillLabel: {
    fontFamily: 'Courier',
    fontSize: 7,
    color: CRIMSON,
    marginBottom: 2,
    letterSpacing: 1,
  },
  skillItems: { fontSize: 9, color: FG, lineHeight: 1.4 },

  /* Languages */
  /* Vier Sprachen passen nicht mehr nebeneinander — zweispaltig umbrechen. */
  langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  langItem: { flexBasis: '45%', flexDirection: 'row', marginBottom: 3 },
  langName: { fontSize: 10, color: FG, marginRight: 6 },
  langLevel: { fontSize: 9.5, color: MUTED },
});

export default function CvDocument({ cv, lang }: { cv: any; lang: string }) {
  return (
    <Document
      title={lang === 'de' ? 'Lebenslauf — Iver Bohnes' : 'CV — Iver Bohnes'}
      author="Iver Bohnes"
    >
      <Page size="A4" style={styles.page} wrap>
        {/* === Compact header (top of page 1, no longer fixed) === */}
        <View style={styles.header}>
          <Text style={styles.name}>Iver Bohnes</Text>
          <Text style={styles.role}>{cv.role}</Text>
          <Text style={styles.meta}>
            Hamburg, Deutschland  ·  iverbohnes@gmail.com  ·  +49 176 66631237  ·  ivergentz.de
          </Text>
        </View>

        <Text style={styles.tagline}>{cv.tagline}</Text>

        {/* === Products — each row stays together as a unit === */}
        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>{cv.labels.products.toUpperCase()}</Text>
        </View>
        {cv.products.map((p: any, i: number) => (
          <View key={i} style={styles.row}>
            <View style={styles.period}>
              <Text>{p.period}</Text>
              <Text style={styles.periodStatus}>{p.status}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.productName}>{p.name}</Text>
              <View style={styles.productUrlWrap}>
                <Text style={styles.productUrl}>{p.url}</Text>
              </View>
              <View style={styles.bulletList}>
                {p.bullets.map((b: any, j: number) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletMark}>—</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.stack}>{p.stack}</Text>
            </View>
          </View>
        ))}

        {/* === Experience — natural flow, lands on page 2 === */}
        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>{cv.labels.experience.toUpperCase()}</Text>
        </View>
        {cv.experience.map((e: any, i: number) => (
          <View key={i} style={styles.row} wrap={false}>
            <View style={styles.period}>
              <Text>{e.period}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{e.title}</Text>
              <Text style={styles.company}>{e.company}</Text>
              <View style={styles.bulletList}>
                {e.bullets.map((b: any, j: number) => (
                  <View key={j} style={styles.bullet}>
                    <Text style={styles.bulletMark}>—</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}

        {/* === Education === */}
        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>{cv.labels.education.toUpperCase()}</Text>
        </View>
        {cv.education.map((e: any, i: number) => (
          <View key={i} style={styles.row} wrap={false}>
            <View style={styles.period}>
              <Text>{e.period}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.eduTitle}>{e.title}</Text>
              <Text style={styles.eduSchool}>{e.school}</Text>
            </View>
          </View>
        ))}

        {/* === Skills === */}
        <View style={styles.sectionLabelWrap}>
          <Text style={styles.sectionLabel}>{cv.labels.skills.toUpperCase()}</Text>
        </View>
        <View style={styles.skillsGrid} wrap={false}>
          {cv.skills.map((s: any, i: number) => (
            <View key={i} style={styles.skillCol}>
              <Text style={styles.skillLabel}>{s.label}</Text>
              <Text style={styles.skillItems}>{s.items}</Text>
            </View>
          ))}
        </View>

        {/* === Languages === */}
        <View style={{ marginTop: 12 }}>
          <View style={styles.sectionLabelWrap}>
            <Text style={styles.sectionLabel}>{cv.labels.languages.toUpperCase()}</Text>
          </View>
          <View style={styles.langGrid} wrap={false}>
            {cv.languages.map((l: any, i: number) => (
              <View key={i} style={styles.langItem}>
                <Text style={styles.langName}>{l.name}</Text>
                <Text style={styles.langLevel}>— {l.level}</Text>
              </View>
            ))}
          </View>
        </View>
      </Page>
    </Document>
  );
}
