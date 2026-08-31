import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: "Helvetica", fontSize: 9, color: "#241B1E" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 10, borderBottomWidth: 3 },
  logo: { width: 72, height: 48, objectFit: "contain" },
  institution: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  eyebrow: { fontSize: 7, fontFamily: "Helvetica-Bold", letterSpacing: 1.2 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginTop: 3 },
  subtitle: { color: "#746B6D", marginTop: 3 },
  day: { marginTop: 12, marginBottom: 5, padding: 7, borderRadius: 5 },
  dayText: { color: "white", fontFamily: "Helvetica-Bold", fontSize: 10 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E8DFDA", paddingVertical: 6 },
  time: { width: 70, fontFamily: "Helvetica-Bold" },
  content: { flex: 1, paddingRight: 8 },
  blockTitle: { fontFamily: "Helvetica-Bold", fontSize: 9 },
  meta: { color: "#746B6D", fontSize: 7.5, marginTop: 2 },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, paddingTop: 5, borderTopWidth: 1, borderTopColor: "#E8DFDA", flexDirection: "row", justifyContent: "space-between", fontSize: 6.5, color: "#746B6D" },
});

function frDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export type PlanningPdfBlock = {
  id: string;
  training_day: string;
  start_time: string;
  end_time: string;
  title: string;
  formation_name?: string | null;
  instructor_name?: string | null;
  room_name?: string | null;
  description?: string | null;
};

export function TrainingPlanningPdf({ structure, cohort, title, blocks }: { structure: any; cohort: any; title: string; blocks: PlanningPdfBlock[] }) {
  const primary = structure.document_primary_color || "#6B1A2C";
  const secondary = structure.document_secondary_color || "#D4A24C";
  const days = [...new Set(blocks.map((b) => b.training_day))].sort();
  return <Document title={`Planning - ${title}`}>
    <Page size="A4" style={styles.page}>
      <View style={[styles.head, { borderBottomColor: secondary }]}>
        <View>
          {structure.logo_url ? <Image src={structure.logo_url} style={styles.logo} /> : <Text style={[styles.institution, { color: primary }]}>{structure.short_name || structure.name}</Text>}
        </View>
        <View style={{ alignItems: "flex-end", maxWidth: 430 }}>
          <Text style={[styles.eyebrow, { color: secondary }]}>PLANNING DE FORMATION</Text>
          <Text style={[styles.title, { color: primary }]}>{title}</Text>
          <Text style={styles.subtitle}>{cohort?.name || "Formation"}</Text>
        </View>
      </View>
      {days.length === 0 ? <Text>Aucun bloc n'est encore planifié.</Text> : days.map((day) => <View key={day} wrap={false}>
        <View style={[styles.day, { backgroundColor: primary }]}><Text style={styles.dayText}>{frDate(day)}</Text></View>
        {blocks.filter((b) => b.training_day === day).map((b) => <View key={b.id} style={styles.row} wrap={false}>
          <Text style={[styles.time, { color: primary }]}>{String(b.start_time).slice(0, 5)} – {String(b.end_time).slice(0, 5)}</Text>
          <View style={styles.content}>
            <Text style={styles.blockTitle}>{b.title}</Text>
            <Text style={styles.meta}>{[b.formation_name, b.instructor_name ? `Intervenant : ${b.instructor_name}` : null, b.room_name ? `Lieu : ${b.room_name}` : null].filter(Boolean).join(" · ")}</Text>
            {b.description ? <Text style={styles.meta}>{b.description}</Text> : null}
          </View>
        </View>)}
      </View>)}
      <View style={styles.footer} fixed><Text>{structure.name}</Text><Text>Généré par MyBasket</Text></View>
    </Page>
  </Document>;
}
