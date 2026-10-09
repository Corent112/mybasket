import sharp from "sharp";
import {archiveTrainingExport} from "@/lib/institutionnel/training-export-archive";
import {readAttendanceSignature,ATTENDANCE_LABELS} from "@/lib/institutionnel/training-attendance-signature";
import React from "react";
import { NextResponse } from "next/server";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

async function canManage(sb: any, userId: string, cohortId: string) {
  const [{ data: instructor }, { data: profile }, { data: cohort }] =
    await Promise.all([
      sb
        .from("training_instructors")
        .select("id")
        .eq("cohort_id", cohortId)
        .eq("user_id", userId)
        .maybeSingle(),
      sb
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle(),
      sb
        .from("training_cohorts")
        .select("institution_id")
        .eq("id", cohortId)
        .maybeSingle(),
    ]);

  if (
    instructor ||
    ["ceo", "superadmin"].includes(String(profile?.platform_role || ""))
  ) {
    return true;
  }

  if (!cohort?.institution_id) return false;

  const { data: member } = await sb
    .from("institutional_members")
    .select("id")
    .eq("structure_id", cohort.institution_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  return !!member;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function shortTime(value: string | null | undefined) {
  return value ? String(value).slice(0, 5).replace(":", "h") : "";
}

export async function POST(request: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const cohortId = String(body.cohortId || "");
  const type = String(body.type || "participants");

  if (!cohortId || !(await canManage(sb, user.id, cohortId))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const db = createAdminClient() || sb;

  const [{ data: cohort }, { data: candidates }, { data: sessions }] =
    await Promise.all([
      db
        .from("training_cohorts")
        .select("*,training_programs(name,code)")
        .eq("id", cohortId)
        .single(),
      db
        .from("training_candidates")
        .select(
          "id,first_name,last_name,email,club_name,license_number",
        )
        .eq("cohort_id", cohortId)
        .not("status", "eq", "withdrawn")
        .order("last_name"),
      type === "attendance"
        ? db
            .from("training_attendance_sessions")
            .select(
              "id,title,session_date,start_time,end_time,location,is_required",
            )
            .eq("cohort_id", cohortId)
            .order("session_date")
            .order("start_time")
        : Promise.resolve({ data: [] }),
    ]);

  const attendanceRows=type==="attendance"&&(sessions||[]).length?await db.from("training_candidate_attendance").select("session_id,candidate_id,status,notes").in("session_id",(sessions||[]).map((session:any)=>session.id)):{data:[],error:null};
  if(attendanceRows.error)return NextResponse.json({error:attendanceRows.error.message},{status:400});
  const attendanceByPair=new Map((attendanceRows.data||[]).map((row:any)=>[`${row.session_id}:${row.candidate_id}`,row]));
  let structure: any = null;
  if (cohort?.institution_id) {
    const q = await db
      .from("institutional_structures")
      .select(
        "name,logo_url,document_primary_color,document_secondary_color",
      )
      .eq("id", cohort.institution_id)
      .maybeSingle();
    structure = q.data;
  }

  const primary = structure?.document_primary_color || "#6B1A2C";
  const secondary = structure?.document_secondary_color || "#D4A24C";

  const styles = StyleSheet.create({
    page: {
      paddingTop: 28,
      paddingBottom: 30,
      paddingHorizontal: 28,
      fontSize: 8.5,
      fontFamily: "Helvetica",
      color: "#302328",
    },
    brand: {
      height: 6,
      backgroundColor: primary,
      marginBottom: 12,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    logo: {
      width: 58,
      height: 38,
      objectFit: "contain",
    },
    org: {
      color: primary,
      fontSize: 10,
      fontWeight: 700,
    },
    title: {
      fontSize: 18,
      color: primary,
      fontWeight: 700,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 8,
      color: "#75686c",
      marginBottom: 8,
    },
    dayTitle: {
      marginBottom: 10,
      paddingVertical: 7,
      paddingHorizontal: 9,
      backgroundColor: "#F6F0ED",
      borderLeftWidth: 3,
      borderLeftColor: secondary,
      fontSize: 10,
      fontWeight: 700,
      color: primary,
    },
    table: {
      borderWidth: 0.7,
      borderColor: "#DDD1CA",
    },
    row: {
      flexDirection: "row",
      minHeight: 25,
      borderBottomWidth: 0.5,
      borderColor: "#E7DDD8",
      alignItems: "stretch",
    },
    headRow: {
      backgroundColor: "#F6F0ED",
      borderBottomWidth: 1,
      borderColor: secondary,
    },
    cell: {
      paddingHorizontal: 5,
      paddingVertical: 5,
      flexShrink: 1,
      justifyContent: "center",
    },
    cName: { width: "24%" },
    cClub: { width: "20%" },
    cEmail: { width: "27%" },
    cLicense: { width: "13%" },
    cSign: { width: "16%" },
    headText: {
      fontSize: 7,
      fontWeight: 700,
      color: primary,
    },
    sessionHead: {
      fontSize: 6.5,
      fontWeight: 700,
      color: primary,
      textAlign: "center",
    },
    sessionSub: {
      fontSize: 5.8,
      color: "#75686c",
      textAlign: "center",
      marginTop: 2,
    },
    signCell: {
      minHeight: 36,
      borderLeftWidth: 0.5,
      borderLeftColor: "#E7DDD8",
    },
    footer: {
      position: "absolute",
      bottom: 15,
      left: 28,
      right: 28,
      flexDirection: "row",
      justifyContent: "space-between",
      borderTopWidth: 0.5,
      borderColor: "#DDD1CA",
      paddingTop: 5,
      fontSize: 6.5,
      color: "#87797D",
    },
  });

  const formationLabel = `${cohort?.training_programs?.name || "Formation"} ${String(
    cohort?.name || "",
  )
    .replace(/promotion/gi, "")
    .replace(/\s+/g, " ")
    .trim()}`.trim();

  const renderHeader = () => [
    React.createElement(View, { style: styles.brand, key: "brand" }),
    React.createElement(
      View,
      { style: styles.header, key: "header" },
      structure?.logo_url
        ? React.createElement(Image, {
            src: structure.logo_url,
            style: styles.logo,
          })
        : React.createElement(
            Text,
            { style: styles.org },
            structure?.name || "MyBasket",
          ),
      React.createElement(
        Text,
        { style: styles.org },
        structure?.name || "Institution",
      ),
    ),
  ];

  const footer = React.createElement(
    View,
    { style: styles.footer, fixed: true },
    React.createElement(Text, null, "Document généré par MyBasket"),
    React.createElement(Text, {
      render: ({ pageNumber, totalPages }) =>
        `Page ${pageNumber}/${totalPages}`,
    }),
  );

  let pages: React.ReactElement[] = [];

  if (type === "attendance") {
    let attendanceLogo:string|null=null;
    if(structure?.logo_url){
      try{
        const source=String(structure.logo_url);let bytes:Buffer;
        if(/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(source))bytes=Buffer.from(source.split(",")[1],"base64");
        else{
          const url=new URL(source,new URL(request.url).origin);
          if(!["https:","http:"].includes(url.protocol))throw new Error("URL invalide");
          const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
          if(!response.ok)throw new Error("Logo inaccessible");
          bytes=Buffer.from(await response.arrayBuffer());
        }
        if(bytes.length>5*1024*1024)throw new Error("Logo trop volumineux");
        const png=await sharp(bytes,{limitInputPixels:20000000}).resize(240,240,{fit:"inside",withoutEnlargement:true}).png().toBuffer();
        attendanceLogo=`data:image/png;base64,${png.toString("base64")}`;
      }catch{return NextResponse.json({error:"Le logo de l’institution ne peut pas être chargé. Vérifiez le logo dans les paramètres de l’institution."},{status:400});}
    }

    const ordered = [...(sessions || [])].sort((a:any,b:any)=>`${a.session_date} ${a.start_time||""}`.localeCompare(`${b.session_date} ${b.start_time||""}`));
    const people=candidates||[];
    const rowHeight=Math.min(24,410/Math.max(1,people.length));
    const nameWidth=20,clubWidth=14;
    const columnWidth=66/Math.max(1,ordered.length);
    const signatureWidth=Math.max(1,805.89*columnWidth/100-6);
    const fontSize=Math.min(7,rowHeight*.32);
    const cell={paddingHorizontal:3,paddingVertical:2,justifyContent:"center" as const,overflow:"hidden" as const};
    const sessionCell={...cell,width:`${columnWidth}%`,borderLeftWidth:.5,borderLeftColor:"#E7DDD8"};
    const header=React.createElement(View,{style:{flexDirection:"row",alignItems:"center",marginBottom:10,height:46}},
      ...(attendanceLogo?[React.createElement(Image,{src:attendanceLogo,style:{width:46,height:46,objectFit:"contain",marginRight:10}})]:[]),
      React.createElement(View,{style:{flex:1}},React.createElement(Text,{style:{fontSize:16,fontWeight:700,color:primary}},"Feuille d’émargement"),React.createElement(Text,{style:{fontSize:8,color:"#75686c",marginTop:4}},`${formationLabel}${cohort?.location?` · ${cohort.location}`:""}`)),
      React.createElement(Text,{style:{fontSize:9,fontWeight:700,color:primary,maxWidth:160}},structure?.name||"MyBasket"));
    const tableHeader=React.createElement(View,{style:{flexDirection:"row",height:42,backgroundColor:"#F6F0ED",borderBottomWidth:1,borderColor:secondary}},
      React.createElement(Text,{style:{...cell,width:`${nameWidth}%`,fontSize:7,fontWeight:700,color:primary}},"CANDIDAT"),
      React.createElement(Text,{style:{...cell,width:`${clubWidth}%`,fontSize:7,fontWeight:700,color:primary}},"CLUB / STRUCTURE"),
      ...ordered.map((session:any)=>React.createElement(View,{key:session.id,style:sessionCell},
        React.createElement(Text,{style:{fontSize:6.2,fontWeight:700,color:primary,textAlign:"center"}},new Date(`${session.session_date}T12:00:00`).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"})),
        React.createElement(Text,{style:{fontSize:5.5,fontWeight:700,textAlign:"center",marginTop:3}},String(session.title||"Émargement").toUpperCase()),
        React.createElement(Text,{style:{fontSize:5.2,textAlign:"center",color:"#75686c",marginTop:2}},`${shortTime(session.start_time)} - ${shortTime(session.end_time)}`))));
    const tableRows=people.map((candidate:any)=>React.createElement(View,{key:candidate.id,wrap:false,style:{flexDirection:"row",height:rowHeight,borderBottomWidth:.5,borderColor:"#E7DDD8",backgroundColor:people.indexOf(candidate)%2?"#FCFAF8":"#FFFFFF"}},
      React.createElement(Text,{style:{...cell,width:`${nameWidth}%`,fontSize,fontWeight:700}},`${candidate.last_name||""} ${candidate.first_name||""}`.trim()),
      React.createElement(Text,{style:{...cell,width:`${clubWidth}%`,fontSize}},candidate.club_name||"—"),
      ...ordered.map((session:any)=>{
        const record:any=attendanceByPair.get(`${session.id}:${candidate.id}`),signature=readAttendanceSignature(record?.notes),present=record?.status==="present"||record?.status==="late";
        return React.createElement(View,{key:session.id,style:sessionCell},present&&signature?React.createElement(View,null,
          React.createElement(Image,{src:signature.image,style:{width:signatureWidth,height:Math.max(1,rowHeight-8),objectFit:"contain"}}),
          React.createElement(Text,{style:{fontSize:Math.min(4.2,rowHeight*.18),color:"#75686c",textAlign:"center"}},new Date(signature.signedAt).toLocaleString("fr-FR",{timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})))
          :React.createElement(Text,{style:{fontSize:Math.min(fontSize,6),textAlign:"center"}},record?.status&&record.status!=="unknown"?(ATTENDANCE_LABELS[record.status]||record.status):""));
      })));
    pages=[React.createElement(Page,{key:"attendance-all",size:"A4",orientation:"landscape",wrap:false,style:{...styles.page,height:595.28,minHeight:595.28,paddingTop:18,paddingHorizontal:18,paddingBottom:24}},
      React.createElement(View,{style:{height:4,backgroundColor:primary,marginBottom:8}}),header,
      ordered.length?React.createElement(View,{style:styles.table},tableHeader,...tableRows):React.createElement(Text,{style:{fontSize:9}},"Aucune demi-journée de présence définie."),
      footer)];

  } else {
    const rows = (candidates || []).map((candidate: any) =>
      React.createElement(
        View,
        {
          style: styles.row,
          key: candidate.id,
          wrap: false,
        },
        React.createElement(
          Text,
          { style: [styles.cell, styles.cName] },
          `${candidate.last_name || ""} ${
            candidate.first_name || ""
          }`.trim(),
        ),
        React.createElement(
          Text,
          { style: [styles.cell, styles.cClub] },
          candidate.club_name || "—",
        ),
        React.createElement(
          Text,
          { style: [styles.cell, styles.cEmail] },
          candidate.email || "—",
        ),
        React.createElement(
          Text,
          { style: [styles.cell, styles.cLicense] },
          candidate.license_number || "—",
        ),
        React.createElement(
          Text,
          { style: [styles.cell, styles.cSign] },
          "",
        ),
      ),
    );

    pages = [
      React.createElement(
        Page,
        {
          key: "participants",
          size: "A4",
          orientation: "portrait",
          style: styles.page,
        },
        ...renderHeader(),
        React.createElement(
          Text,
          { style: styles.title },
          "Liste des participants",
        ),
        React.createElement(
          Text,
          { style: styles.subtitle },
          `${formationLabel}${cohort?.location ? ` · ${cohort.location}` : ""}`,
        ),
        React.createElement(
          View,
          { style: styles.table },
          React.createElement(
            View,
            {
              style: [styles.row, styles.headRow],
              fixed: true,
            },
            React.createElement(
              Text,
              { style: [styles.cell, styles.cName, styles.headText] },
              "CANDIDAT",
            ),
            React.createElement(
              Text,
              { style: [styles.cell, styles.cClub, styles.headText] },
              "CLUB / STRUCTURE",
            ),
            React.createElement(
              Text,
              { style: [styles.cell, styles.cEmail, styles.headText] },
              "EMAIL",
            ),
            React.createElement(
              Text,
              { style: [styles.cell, styles.cLicense, styles.headText] },
              "LICENCE",
            ),
            React.createElement(
              Text,
              { style: [styles.cell, styles.cSign, styles.headText] },
              "STATUT",
            ),
          ),
          ...rows,
        ),
        footer,
      ),
    ];
  }

  const doc = React.createElement(Document, null, ...pages);
  const buffer = await renderToBuffer(doc);

  const filename = `${
    type === "attendance" ? "emargement" : "participants"
  }-${String(cohort?.name || "formation").replace(
    /[^a-z0-9_-]/gi,
    "-",
  )}.pdf`;

  if (cohort?.institution_id && body.preview !== true) {
    try {
      await archiveTrainingExport(db, {institutionId: cohort.institution_id, cohortId, userId: user.id, filename, buffer, contentType: "application/pdf", kind: type === "attendance" ? "attendance_pdf" : "participants_pdf"});
    } catch(e) {return NextResponse.json({error: e instanceof Error ? e.message : "Enregistrement impossible"}, {status: 400});}
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
