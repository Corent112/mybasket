"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SESSION_QUESTIONS, buildSessionAnalysis, average } from "@/lib/development-profile";

type ExerciseReview={session_exercise_id:string;exercise_id:string|null;title:string;rating:number};

export default function SessionSelfEvaluation({sessionId}:{sessionId:string}) {
 const supabase=useMemo(()=>createClient(),[]);
 const [loading,setLoading]=useState(true), [saving,setSaving]=useState(false);
 const [session,setSession]=useState<any>(null), [calendarEventId,setCalendarEventId]=useState<string|null>(null);
 const [questions,setQuestions]=useState<Record<string,number>>({objectives_rating:3,clarity_rating:3,adaptation_rating:3,rhythm_rating:3,relevance_rating:3});
 const [remark,setRemark]=useState(""); const [exercises,setExercises]=useState<ExerciseReview[]>([]); const [existingId,setExistingId]=useState<string|null>(null);

 useEffect(()=>{void load()},[sessionId]);

 async function load(){
   setLoading(true);
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setLoading(false);return;}
   const [{data:s},{data:ev},{data:rows},{data:review}] = await Promise.all([
    supabase.from("practice_sessions").select("id,title,theme,session_date,start_time,end_time,team_id,team_name").eq("id",sessionId).maybeSingle(),
    supabase.from("calendar_events").select("id").eq("session_id",sessionId).order("created_at",{ascending:true}).limit(1).maybeSingle(),
    supabase.from("practice_session_exercises").select("id,exercise_id,title,sort_order").eq("session_id",sessionId).order("sort_order"),
    supabase.from("practice_session_self_reviews").select("*").eq("session_id",sessionId).eq("user_id",user.id).maybeSingle(),
   ]);
   setSession(s); setCalendarEventId(ev?.id??null);
   if(review){
     setExistingId(review.id);
     setQuestions({
       objectives_rating:review.objectives_rating??3, clarity_rating:review.clarity_rating??3,
       adaptation_rating:review.adaptation_rating??3, rhythm_rating:review.rhythm_rating??3,
       relevance_rating:review.relevance_rating??3
     });
     setRemark(review.takeaways??"");
   }
   const {data:er}=await supabase.from("practice_exercise_reviews").select("*").eq("session_id",sessionId).eq("user_id",user.id);
   const byId=new Map((er??[]).map((r:any)=>[String(r.session_exercise_id),r]));
   setExercises((rows??[]).map((r:any)=>{
     const old:any=byId.get(String(r.id));
     return {session_exercise_id:String(r.id),exercise_id:r.exercise_id??null,title:r.title,rating:old?.mastery_rating??3};
   }));
   setLoading(false);
 }

 async function save(){
   setSaving(true);
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){setSaving(false);return;}
   const analysis=buildSessionAnalysis({questions,exercises:exercises.map(e=>({...e,mastery_rating:e.rating})),remark});
   const payload={
     user_id:user.id,session_id:sessionId,calendar_event_id:calendarEventId,team_id:session?.team_id??null,
     review_date:session?.session_date || new Date().toISOString().slice(0,10),
     ...questions,takeaways:remark,next_time_changes:analysis.advice,
     generated_summary:analysis.summary,generated_advice:analysis.advice,updated_at:new Date().toISOString()
   };
   const {error}=await supabase.from("practice_session_self_reviews").upsert(payload,{onConflict:"user_id,session_id"});
   if(error){alert(error.message);setSaving(false);return;}
   for(const e of exercises){
     const status=e.rating<=2?"not_mastered":e.rating===3?"in_progress":"mastered";
     const {error:exerciseError}=await supabase.from("practice_exercise_reviews").upsert({
       user_id:user.id,session_id:sessionId,session_exercise_id:e.session_exercise_id,exercise_id:e.exercise_id,
       exercise_title:e.title,understanding_rating:e.rating,mastery_rating:e.rating,status,comment:"",
       updated_at:new Date().toISOString()
     },{onConflict:"user_id,session_id,session_exercise_id"});
     if(exerciseError){alert(exerciseError.message);setSaving(false);return;}
   }
   setSaving(false); alert("Auto-évaluation enregistrée."); void load();
 }

 const generated=buildSessionAnalysis({questions,exercises:exercises.map(e=>({...e,mastery_rating:e.rating})),remark});
 const score=average(Object.values(questions));
 if(loading)return <div className="ae-loading">Chargement…</div>;

 return <div className="ae">
   <header><div><span>AUTO-ÉVALUATION COACH</span><h1>{session?.title||session?.theme||"Séance"}</h1><p>{session?.team_name||"Équipe"} · {session?.session_date?new Date(session.session_date+"T12:00:00").toLocaleDateString("fr-FR"):"—"}</p></div><strong>{score.toFixed(1)}/5</strong></header>

   <section className="card"><h2>Ma séance</h2><p className="intro">5 questions rapides. Une note de 1 à 5 pour prendre du recul sur la séance.</p>
     {SESSION_QUESTIONS.map(q=><Rating key={q.key} label={q.label} value={questions[q.key]??3} onChange={v=>setQuestions(x=>({...x,[q.key]:v}))}/>)}
     <div className="remark"><label>Remarques <span>facultatif</span></label><textarea value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Ce que je retiens, un point à modifier, une observation pour la prochaine séance…"/></div>
   </section>

   <section className="card"><h2>Évaluation des exercices</h2><p className="intro">Une seule note par exercice : 1 = peu pertinent aujourd'hui, 5 = très efficace.</p>
     {exercises.length===0?<div className="empty">Aucun exercice n'est associé à cette séance.</div>:exercises.map((e,i)=><div className="exercise" key={e.session_exercise_id}><b>{e.title}</b><Rating label="Pertinence / efficacité" value={e.rating} onChange={v=>setExercises(all=>all.map((x,n)=>n===i?{...x,rating:v}:x))}/></div>)}
   </section>

   <section className="two">
     <div className="card analysis"><h2>Synthèse</h2><p>{generated.summary}</p></div>
     <div className="card advice"><h2>Conseils pour la séance suivante</h2><p>{generated.advice}</p></div>
   </section>

   <div className="save"><button onClick={save} disabled={saving}>{saving?"Enregistrement…":existingId?"Mettre à jour l'auto-évaluation":"Enregistrer l'auto-évaluation"}</button></div>
   <style jsx>{`.ae{max-width:1180px;margin:auto;padding:26px;color:#24171b}.ae header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.ae header span{color:#d4a24c;font-weight:950;font-size:12px}.ae h1{margin:4px 0;color:#6b1a2c}.ae header p,.intro{margin:0;color:#8c7e77}.ae header>strong{font-size:28px;color:#6b1a2c;background:#fff7eb;border:1px solid #eadccc;padding:12px 16px;border-radius:16px}.card{border:1px solid #eee2d6;border-radius:18px;background:#fff;padding:18px;margin-bottom:14px;box-shadow:0 10px 25px rgba(50,20,10,.05)}h2{color:#6b1a2c;margin:0 0 8px}.intro{margin-bottom:14px}.remark{border-top:1px solid #f0e6db;margin-top:12px;padding-top:16px}.remark label{display:block;font-weight:900;margin-bottom:8px}.remark label span{font-weight:500;color:#998b83}.exercise{border-top:1px solid #f0e6db;padding:15px 0}.exercise:first-of-type{border-top:0}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.analysis,.advice{background:#fff9ef}.analysis p,.advice p{line-height:1.6;margin-bottom:0}textarea{width:100%;min-height:100px;box-sizing:border-box;border:1px solid #e5ddd4;border-radius:12px;padding:11px;font:inherit;resize:vertical}.save{position:sticky;bottom:14px;display:flex;justify-content:center}.save button{border:0;background:#6b1a2c;color:#fff;border-radius:14px;padding:15px 26px;font-weight:950;cursor:pointer}.empty{padding:15px;border:1px dashed #eadccc;border-radius:12px;color:#887a72}@media(max-width:800px){.two{grid-template-columns:1fr}.ae{padding:16px}.ae header{align-items:flex-start}}`}</style>
 </div>
}

function Rating({label,value,onChange}:{label:string;value:number;onChange:(v:number)=>void}){
 return <div className="rating"><span>{label}</span><div>{[1,2,3,4,5].map(n=><button type="button" key={n} className={n===value?"on":""} onClick={()=>onChange(n)}>{n}</button>)}</div><b>{value}/5</b><style jsx>{`.rating{display:grid;grid-template-columns:minmax(300px,1fr) auto 42px;gap:10px;align-items:center;padding:9px 0}.rating>span{font-weight:800;color:#4c4040;line-height:1.35}.rating>div{display:flex;gap:5px}.rating button{width:34px;height:34px;border-radius:9px;border:1px solid #eadccc;background:#fff;color:#6b1a2c;font-weight:900;cursor:pointer}.rating button.on{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.rating>b{text-align:right;color:#d4a24c}@media(max-width:700px){.rating{grid-template-columns:1fr 42px}.rating>div{grid-column:1/-1;grid-row:2}}`}</style></div>
}
