import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", fontSize: 10, color: "#201B22" },
  frame: { borderWidth: 1.3, minHeight: 720 },
  header: { minHeight: 92, alignItems: "center", justifyContent: "center", padding: 12 },
  logo: { maxWidth: 90, width: 80, height: 55, objectFit: "contain" },
  instName: { fontFamily: "Helvetica-Bold", fontSize: 15, textAlign: "center" },
  titleBar: { marginHorizontal: 20, padding: 11, alignItems: "center", borderBottomWidth: 5 },
  title: { color: "white", fontFamily: "Helvetica-Bold", fontSize: 20 },
  meta: { padding: 12, borderTopWidth: 1, borderBottomWidth: 1, gap: 8 },
  metaRow: { flexDirection: "row", gap: 8 },
  label: { width: 90, fontFamily: "Helvetica-Bold" },
  importance: { flexDirection: "row", gap: 14, marginTop: 2 },
  body: { padding: 16, lineHeight: 1.6, minHeight: 360 },
  signature: { marginTop: 18 },
  signTable: { flexDirection: "row", borderTopWidth: 1, borderLeftWidth: 1 },
  signCol: { flex: 1, minHeight: 58, borderRightWidth: 1, borderBottomWidth: 1, padding: 6, alignItems: "center" },
  signHead: { fontFamily: "Helvetica-Bold", fontSize: 8, marginBottom: 5 },
  signText: { fontSize: 8, textAlign: "center" },
  footer: { position: "absolute", left: 34, right: 34, bottom: 16, padding: 7, color: "white", textAlign: "center", fontSize: 7 },
});

export function InstitutionNotePdf({ structure, note }: { structure: any; note: any }) {
  const primary = structure.document_primary_color || "#6B1A2C";
  const secondary = structure.document_secondary_color || "#D4A24C";
  const date = note.date || new Date().toLocaleDateString("fr-FR");
  const importance = note.importance || "information";
  return <Document title={note.title || "Note institutionnelle"}>
    <Page size="A4" style={s.page}>
      <View style={[s.frame, { borderColor: primary }]}>
        <View style={s.header}>
          {structure.logo_url ? <Image src={structure.logo_url} style={s.logo} /> : null}
          <Text style={[s.instName, { color: primary }]}>{structure.name}</Text>
        </View>
        <View style={[s.titleBar, { backgroundColor: primary, borderBottomColor: secondary }]}><Text style={s.title}>{note.title || "Information"}</Text></View>
        <View style={[s.meta, { borderColor: primary }]}>
          <View style={s.metaRow}><Text style={s.label}>Destinataires :</Text><Text>{note.recipientLabel || "Destinataires sélectionnés"}</Text></View>
          <View style={s.metaRow}><Text style={s.label}>Date :</Text><Text>{date}</Text></View>
          <View style={s.importance}>
            <Text style={{ fontFamily: importance === "high" ? "Helvetica-Bold" : "Helvetica" }}>■ Haute importance</Text>
            <Text style={{ fontFamily: importance === "medium" ? "Helvetica-Bold" : "Helvetica" }}>□ Moyenne importance</Text>
            <Text style={{ fontFamily: importance === "information" ? "Helvetica-Bold" : "Helvetica" }}>□ Information</Text>
          </View>
        </View>
        <View style={s.body}>
          <Text>{note.body || ""}</Text>
          <View style={s.signature}>
            <Text>Sportivement,</Text>
            <Text style={{ marginTop: 6, fontFamily: "Helvetica-Bold" }}>{structure.name}</Text>
          </View>
        </View>
        <View style={s.signTable}>
          {[
            ["Rédacteur", note.authorName, note.authorRole],
            ["Vérificateur", note.reviewerName, note.reviewerRole],
            ["Approbateur", note.approverName, note.approverRole],
          ].map(([head, name, role]) => <View style={[s.signCol, { borderColor: primary }]} key={head as string}><Text style={s.signHead}>{head}</Text><Text style={s.signText}>{name || ""}</Text><Text style={s.signText}>{role || ""}</Text></View>)}
        </View>
      </View>
      <Text style={[s.footer, { backgroundColor: primary }]} fixed>{[structure.name, structure.email, structure.city].filter(Boolean).join(" · ")}</Text>
    </Page>
  </Document>;
}
