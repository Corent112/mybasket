import React from "react";
import {
  Document,Page,Text,View,Image,StyleSheet,Svg,Polyline,Circle
} from "@react-pdf/renderer";
import type { PlayerNotebookSnapshot } from "@/lib/institutionnel/player-notebook-data";

const B="#6B1A2C",G="#D4A24C",INK="#221C1D",M="#746B6D",L="#E7DDD8",BG="#F7F3F0";

const s=StyleSheet.create({
  page:{padding:34,fontFamily:"Helvetica",fontSize:9,color:INK},
  eyebrow:{fontSize:7,color:G,fontFamily:"Helvetica-Bold",letterSpacing:1.2,marginBottom:4},
  h1:{fontSize:23,color:B,fontFamily:"Helvetica-Bold",marginBottom:4},
  h2:{fontSize:12,color:B,fontFamily:"Helvetica-Bold",marginTop:14,marginBottom:7},
  muted:{color:M,fontSize:8,lineHeight:1.35},
  row:{flexDirection:"row",gap:8},
  logo:{width:95,height:70,objectFit:"contain"},
  logoFallback:{width:95,height:70,borderWidth:1,borderColor:L,alignItems:"center",justifyContent:"center",padding:8},
  photo:{width:115,height:145,objectFit:"cover",backgroundColor:BG},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  identity:{alignItems:"center",marginVertical:18},
  metrics:{flexDirection:"row",gap:6,marginTop:12},
  metric:{flex:1,borderWidth:1,borderColor:L,borderRadius:6,padding:8,alignItems:"center"},
  metricLabel:{fontSize:6.5,color:M,marginBottom:4},
  metricValue:{fontSize:13,color:B,fontFamily:"Helvetica-Bold"},
  table:{borderWidth:1,borderColor:L},
  tr:{flexDirection:"row",borderBottomWidth:1,borderBottomColor:L},
  th:{backgroundColor:BG,fontFamily:"Helvetica-Bold",color:B},
  cell:{padding:6,flex:1},
  box:{borderWidth:1,borderColor:L,borderRadius:6,padding:9,marginBottom:8},
  comment:{borderLeftWidth:4,borderLeftColor:B,backgroundColor:"#FBF8F6",padding:10,marginBottom:10},
  commentTitle:{color:B,fontFamily:"Helvetica-Bold",fontSize:8,marginBottom:5},
  bullets:{lineHeight:1.5},
  footer:{position:"absolute",left:34,right:34,bottom:20,borderTopWidth:1,borderTopColor:L,paddingTop:5,
          flexDirection:"row",justifyContent:"space-between",fontSize:6.5,color:M},
});

function fmt(d?:string|null){if(!d)return "—";const x=d.slice(0,10).split("-");return x.length===3?`${x[2]}/${x[1]}/${x[0]}`:d}
function Logo({src,label}:{src?:string|null;label:string}){
  return src?<Image src={src} style={s.logo}/>:<View style={s.logoFallback}><Text style={{color:B,fontFamily:"Helvetica-Bold",textAlign:"center"}}>{label}</Text></View>
}
function Metric({label,value}:{label:string;value:string}){
  return <View style={s.metric}><Text style={s.metricLabel}>{label.toUpperCase()}</Text><Text style={s.metricValue}>{value}</Text></View>
}
function Footer({generatedAt}:{generatedAt:string}){
  return <View style={s.footer} fixed><Text>MYBASKET · CAHIER DE SUIVI JOUEUR</Text><Text>Généré le {fmt(generatedAt)}</Text></View>
}
function HeightChart({items}:{items:any[]}){
  const pts=items.filter(x=>x.height_cm!=null);
  if(pts.length<2)return <View style={s.box}><Text style={s.muted}>Deux mesures de taille minimum pour afficher la courbe.</Text></View>;
  const vals=pts.map(x=>Number(x.height_cm)), min=Math.min(...vals)-2,max=Math.max(...vals)+2;
  const W=480,H=130,P=20;
  const points=pts.map((x,i)=>({
    x:P+i*(W-2*P)/(pts.length-1),
    y:P+(max-Number(x.height_cm))*(H-2*P)/(max-min),
    item:x
  }));
  return <View style={{borderWidth:1,borderColor:L,borderRadius:6,padding:8}}>
    <Svg width={W} height={H}>
      <Polyline points={points.map(p=>`${p.x},${p.y}`).join(" ")} stroke={B} strokeWidth={2.5} fill="none"/>
      {points.map((p,i)=><Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={G}/>)}
    </Svg>
    <View style={{flexDirection:"row",justifyContent:"space-between"}}>
      {points.map((p,i)=><Text key={i} style={{fontSize:6,color:M}}>{fmt(p.item.measured_at).slice(0,5)} · {p.item.height_cm}cm</Text>)}
    </View>
  </View>
}

export function PlayerNotebookPdf({snapshot}:{snapshot:PlayerNotebookSnapshot}){
  const p:any=snapshot.player, st:any=snapshot.structure;
  const seasons:any[]=snapshot.seasons as any[], entries:any[]=snapshot.entries as any[],
    ms:any[]=snapshot.measurements as any[], sessions:any[]=snapshot.attendanceSessions as any[],
    records:any[]=snapshot.attendanceRecords as any[], comments:any[]=snapshot.comments as any[],
    parent:any=snapshot.parentContext||{};
  const active=entries.find(e=>e.season_id===snapshot.activeSeasonId)||entries.at(-1)||{};
  const last=[...ms].reverse()[0]||{};
  const presence=seasons.map(season=>{
    const ss=sessions.filter(x=>x.season_id===season.id), ids=new Set(ss.map(x=>x.id));
    const rr=records.filter(x=>x.season_id===season.id&&ids.has(x.session_id));
    const present=rr.filter(x=>x.status==="present").length, absent=rr.filter(x=>x.status==="absent").length,
      excused=rr.filter(x=>x.status==="excused").length;
    return {label:season.season_label,present,absent,excused,rate:ss.length?Math.round(present/ss.length*100):null};
  }).filter(x=>x.present+x.absent+x.excused>0);
  const currentPresence=presence.at(-1)?.rate;

  return <Document title={`Cahier de suivi - ${p.first_name} ${p.last_name}`}>
    <Page size="A4" style={s.page}>
      <View style={s.header}>
        <Logo src={st.logo_url} label={st.short_name||st.name}/>
        {p.photo_url?<Image src={p.photo_url} style={s.photo}/>:<View style={[s.photo,{alignItems:"center",justifyContent:"center"}]}><Text style={s.muted}>PHOTO JOUEUR</Text></View>}
        <Logo src={active.club_logo_url} label={active.club_name||p.club_name||"CLUB"}/>
      </View>
      <View style={s.identity}>
        <Text style={s.eyebrow}>CAHIER DE SUIVI JOUEUR</Text>
        <Text style={s.h1}>{String(p.first_name||"").toUpperCase()} {String(p.last_name||"").toUpperCase()}</Text>
        <Text style={s.muted}>{active.category||p.category||"—"} · {p.sex==="F"?"Fille":p.sex==="M"?"Garçon":"—"} · Né(e) le {fmt(p.birthdate)}</Text>
      </View>
      <View style={s.metrics}>
        <Metric label="Taille actuelle" value={last.height_cm?`${last.height_cm} cm`:"—"}/>
        <Metric label="Poids" value={last.weight_kg?`${last.weight_kg} kg`:"—"}/>
        <Metric label="Envergure" value={last.wingspan_cm?`${last.wingspan_cm} cm`:"—"}/>
        <Metric label="Présence" value={currentPresence!=null?`${currentPresence}%`:"—"}/>
      </View>
      <Text style={s.h2}>Parcours club</Text>
      <View style={s.table}>
        {entries.map((e:any,i:number)=><View style={[s.tr,i===entries.length-1?{borderBottomWidth:0}:{}]} key={e.id}>
          <Text style={[s.cell,{fontFamily:"Helvetica-Bold",color:B,flex:.7}]}>{seasons.find(x=>x.id===e.season_id)?.season_label||"—"}</Text>
          <Text style={s.cell}>{e.club_name||"—"}</Text>
        </View>)}
      </View>
      <Text style={s.h2}>Informations</Text>
      <View style={s.box}>
        <Text>Club actuel : {active.club_name||p.club_name||"—"}</Text>
        <Text>Poste : {active.position_label||"—"}</Text>
        <Text>Email joueur : {p.email||"—"}</Text>
        <Text>Téléphone : {p.phone||"—"}</Text>
      </View>
      <Footer generatedAt={snapshot.generatedAt}/>
    </Page>

    <Page size="A4" style={s.page}>
      <Text style={s.eyebrow}>CONTEXTE & ÉVOLUTION</Text>
      <Text style={s.h1}>{p.first_name} {p.last_name}</Text>
      <View style={s.row}>
        <View style={[s.box,{flex:1}]}>
          <Text style={s.h2}>Responsable 1</Text>
          <Text>{parent.guardian1_name||"—"} · {parent.guardian1_relation||""}</Text>
          <Text>{parent.guardian1_email||""}</Text><Text>{parent.guardian1_phone||""}</Text>
          <Text>Taille : {parent.guardian1_height_cm?`${parent.guardian1_height_cm} cm`:"—"}</Text>
        </View>
        <View style={[s.box,{flex:1}]}>
          <Text style={s.h2}>Responsable 2</Text>
          <Text>{parent.guardian2_name||"—"} · {parent.guardian2_relation||""}</Text>
          <Text>{parent.guardian2_email||""}</Text><Text>{parent.guardian2_phone||""}</Text>
          <Text>Taille : {parent.guardian2_height_cm?`${parent.guardian2_height_cm} cm`:"—"}</Text>
        </View>
      </View>
      <View style={s.box}>
        <Text style={s.h2}>Contexte utile au suivi</Text>
        <Text style={s.muted}>{parent.school_context||"Contexte scolaire non renseigné."}</Text>
        {parent.siblings_context?<Text style={[s.muted,{marginTop:5}]}>{parent.siblings_context}</Text>:null}
        {parent.useful_context?<Text style={[s.muted,{marginTop:5}]}>{parent.useful_context}</Text>:null}
      </View>

      <Text style={s.h2}>Présence aux entraînements / sélections</Text>
      <View style={s.table}>
        <View style={[s.tr,s.th]}><Text style={s.cell}>Saison</Text><Text style={s.cell}>Présent</Text><Text style={s.cell}>Excusé</Text><Text style={s.cell}>Absent</Text><Text style={s.cell}>Taux</Text></View>
        {presence.map((x:any)=><View style={s.tr} key={x.label}><Text style={s.cell}>{x.label}</Text><Text style={s.cell}>{x.present}</Text><Text style={s.cell}>{x.excused}</Text><Text style={s.cell}>{x.absent}</Text><Text style={[s.cell,{fontFamily:"Helvetica-Bold",color:B}]}>{x.rate}%</Text></View>)}
      </View>

      <Text style={s.h2}>Évolution de la taille</Text>
      <HeightChart items={ms}/>
      <Footer generatedAt={snapshot.generatedAt}/>
    </Page>

    <Page size="A4" style={s.page}>
      <Text style={s.eyebrow}>BASKET</Text>
      <Text style={s.h1}>Commentaires & axes de travail</Text>
      <Text style={s.muted}>Les observations ci-dessous ont été marquées comme partageables avec le club.</Text>
      <View style={{marginTop:12}}>
        {comments.length?comments.map((c:any)=><View style={s.comment} key={c.id}>
          <Text style={s.commentTitle}>{fmt(c.comment_date)} · {seasons.find(x=>x.id===c.season_id)?.season_label||""} · {c.author_name||"Entraîneur"}</Text>
          {c.profile_text?<><Text style={[s.h2,{marginTop:2}]}>Profil</Text><Text style={s.bullets}>{c.profile_text}</Text></>:null}
          {c.strengths_text?<><Text style={s.h2}>Points forts</Text><Text style={s.bullets}>{c.strengths_text}</Text></>:null}
          {c.improvement_text?<><Text style={s.h2}>Axes de travail</Text><Text style={s.bullets}>{c.improvement_text}</Text></>:null}
          {c.projection_text?<><Text style={s.h2}>Projection</Text><Text style={s.bullets}>{c.projection_text}</Text></>:null}
          {c.free_comment?<><Text style={s.h2}>Commentaire</Text><Text style={s.bullets}>{c.free_comment}</Text></>:null}
        </View>):<View style={s.box}><Text style={s.muted}>Aucune observation basket partagée.</Text></View>}
      </View>
      <Footer generatedAt={snapshot.generatedAt}/>
    </Page>
  </Document>;
}
