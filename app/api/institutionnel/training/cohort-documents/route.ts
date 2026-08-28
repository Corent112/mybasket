import React from "react";
import { NextResponse } from "next/server";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

async function canManage(sb: any, userId: string, cohortId: string) {
  const [{ data: instructor }, { data: profile }, { data: cohort }] = await Promise.all([
    sb.from("training_instructors").select("id").eq("cohort_id", cohortId).eq("user_id", userId).maybeSingle(),
    sb.from("profiles").select("platform_role").eq("id", userId).maybeSingle(),
    sb.from("training_cohorts").select("institution_id").eq("id", cohortId).maybeSingle(),
  ]);
  if (instructor || ["ceo", "superadmin"].includes(String(profile?.platform_role || ""))) return true;
  if (!cohort?.institution_id) return false;
  const { data: member } = await sb.from("institutional_members").select("id").eq("structure_id", cohort.institution_id).eq("user_id", userId).eq("status", "active").maybeSingle();
  return !!member;
}

export async function POST(request: Request) {
  const sb = await createClient(); const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const cohortId = String(body.cohortId || ""), type = String(body.type || "participants");
  if (!cohortId || !(await canManage(sb, user.id, cohortId))) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const db = createAdminClient() || sb;
  const { data: cohort } = await db.from("training_cohorts").select("*,training_programs(name,code)").eq("id", cohortId).single();
  const { data: candidates } = await db.from("training_candidates").select("id,first_name,last_name,email,club_name,license_number").eq("cohort_id", cohortId).not("status", "eq", "withdrawn").order("last_name");
  let structure: any = null;
  if (cohort?.institution_id) { const q = await db.from("institutional_structures").select("name,logo_url,document_primary_color,document_secondary_color").eq("id", cohort.institution_id).maybeSingle(); structure = q.data; }
  const primary = structure?.document_primary_color || "#6B1A2C", secondary = structure?.document_secondary_color || "#D4A24C";
  const styles = StyleSheet.create({
    page: { paddingTop: 34, paddingBottom: 32, paddingHorizontal: 34, fontSize: 8.5, fontFamily: "Helvetica", color: "#302328" },
    brand: { height: 6, backgroundColor: primary, marginBottom: 13 }, header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    logo: { width: 58, height: 38, objectFit: "contain" }, org: { color: primary, fontSize: 10, fontWeight: 700 }, title: { fontSize: 18, color: primary, fontWeight: 700, marginBottom: 4 },
    subtitle: { fontSize: 8, color: "#75686c", marginBottom: 12 }, table: { borderWidth: 0.7, borderColor: "#DDD1CA" }, row: { flexDirection: "row", minHeight: 24, borderBottomWidth: 0.5, borderColor: "#E7DDD8", alignItems: "center" },
    headRow: { backgroundColor: "#F6F0ED", borderBottomWidth: 1, borderColor: secondary }, cell: { paddingHorizontal: 5, paddingVertical: 5, flexShrink: 1 }, cName: { width: "25%" }, cClub: { width: "22%" }, cEmail: { width: "27%" }, cLicense: { width: "13%" }, cSign: { width: "13%" },
    headText: { fontSize: 7, fontWeight: 700, color: primary }, footer: { position: "absolute", bottom: 15, left: 34, right: 34, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 0.5, borderColor: "#DDD1CA", paddingTop: 5, fontSize: 6.5, color: "#87797D" },
  });
  const rows = (candidates || []).map((c: any) => React.createElement(View, { style: styles.row, key: c.id, wrap: false },
    React.createElement(Text, { style: [styles.cell, styles.cName] }, `${c.last_name || ""} ${c.first_name || ""}`.trim()),
    React.createElement(Text, { style: [styles.cell, styles.cClub] }, c.club_name || "—"),
    type === "attendance" ? React.createElement(React.Fragment, null,
      React.createElement(Text, { style: [styles.cell, styles.cLicense] }, c.license_number || "—"),
      React.createElement(Text, { style: [styles.cell, { width: "40%" }] }, ""),
    ) : React.createElement(React.Fragment, null,
      React.createElement(Text, { style: [styles.cell, styles.cEmail] }, c.email || "—"),
      React.createElement(Text, { style: [styles.cell, styles.cLicense] }, c.license_number || "—"),
      React.createElement(Text, { style: [styles.cell, styles.cSign] }, ""),
    )
  ));
  const doc = React.createElement(Document, null,
    React.createElement(Page, { size: "A4", orientation: type === "attendance" ? "landscape" : "portrait", style: styles.page },
      React.createElement(View, { style: styles.brand }),
      React.createElement(View, { style: styles.header },
        structure?.logo_url ? React.createElement(Image, { src: structure.logo_url, style: styles.logo }) : React.createElement(Text, { style: styles.org }, structure?.name || "MyBasket"),
        React.createElement(Text, { style: styles.org }, structure?.name || "Institution")
      ),
      React.createElement(Text, { style: styles.title }, type === "attendance" ? "Feuille d’émargement" : "Liste des participants"),
      React.createElement(Text, { style: styles.subtitle }, `${cohort?.training_programs?.name || "Formation"} · ${cohort?.name || "Promotion"}${cohort?.location ? ` · ${cohort.location}` : ""}`),
      React.createElement(View, { style: styles.table },
        React.createElement(View, { style: [styles.row, styles.headRow], fixed: true },
          React.createElement(Text, { style: [styles.cell, styles.cName, styles.headText] }, "CANDIDAT"),
          React.createElement(Text, { style: [styles.cell, styles.cClub, styles.headText] }, "CLUB / STRUCTURE"),
          type === "attendance" ? React.createElement(React.Fragment, null,
            React.createElement(Text, { style: [styles.cell, styles.cLicense, styles.headText] }, "LICENCE"),
            React.createElement(Text, { style: [styles.cell, { width: "40%" }, styles.headText] }, "SIGNATURE / ÉMARGEMENT"),
          ) : React.createElement(React.Fragment, null,
            React.createElement(Text, { style: [styles.cell, styles.cEmail, styles.headText] }, "EMAIL"),
            React.createElement(Text, { style: [styles.cell, styles.cLicense, styles.headText] }, "LICENCE"),
            React.createElement(Text, { style: [styles.cell, styles.cSign, styles.headText] }, "STATUT"),
          )
        ), ...rows
      ),
      React.createElement(View, { style: styles.footer, fixed: true }, React.createElement(Text, null, "Document généré par MyBasket"), React.createElement(Text, { render: ({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages}` }))
    )
  );
  const buffer = await renderToBuffer(doc);
  const filename = `${type === "attendance" ? "emargement" : "participants"}-${String(cohort?.name || "formation").replace(/[^a-z0-9_-]/gi, "-")}.pdf`;
  return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
}
