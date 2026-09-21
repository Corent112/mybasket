"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteExercise, listMyExercises, submitExerciseForReview } from "@/lib/exercises";
import type { Exercise } from "@/types/exercise";

type StatusKey = "all" | "draft" | "submitted" | "approved" | "rejected" | "favorites";
type SortKey = "recent" | "alpha";
const FILTERS = [{key:"theme",label:"THÈMES"},{key:"category",label:"CATÉGORIE"},{key:"level",label:"NIVEAU"}] as const;
const CATEGORY_OPTIONS=["U9","U11","U13","U15","U18","U21","Senior"];
const THEME_OPTIONS=["Fondamentaux individuel","Fondamentaux pré collectif","Collectif","Défense","Surnombre","Jeu rapide","Repli","Rebond","Physique","Adresse"];
const STATUS_LABELS:Record<string,string>={draft:"Privé",submitted:"En attente CEO",approved:"Validé bibliothèque",rejected:"Refusé"};

function value(ex:Exercise,key:string){const v=(ex as unknown as Record<string,unknown>)[key];return typeof v==="string"?v:""}
function image(ex:Exercise){return ex.schemaImages?.[0]||ex.images?.[0]||ex.diagrams?.[0]?.imageUrl||""}
function status(ex:Exercise):StatusKey{return (ex.review_status||"draft") as StatusKey}
function date(v?:string|number){return v?new Date(v).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"—"}

export default function MesExercicesPage(){
 const [items,setItems]=useState<Exercise[]>([]),[loading,setLoading]=useState(true),[search,setSearch]=useState(""),[sort,setSort]=useState<SortKey>("recent"),[activeStatus,setActiveStatus]=useState<StatusKey>("all"),[selected,setSelected]=useState<Record<string,string[]>>({}),[busy,setBusy]=useState<string|null>(null),[favoriteIds,setFavoriteIds]=useState<Set<string>>(new Set());
 async function load(){setLoading(true);try{setItems(await listMyExercises());const sb=createClient();const {data:{user}}=await sb.auth.getUser();if(user){const {data}=await sb.from("favorites").select("item_id").eq("user_id",user.id).eq("item_type","exercise");setFavoriteIds(new Set((data||[]).map((r:any)=>String(r.item_id||"")).filter(Boolean)))}}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 const options=useMemo(()=>({theme:THEME_OPTIONS,category:CATEGORY_OPTIONS,level:Array.from(new Set(items.map(x=>value(x,"level")).filter(Boolean))).sort((a,b)=>a.localeCompare(b,"fr"))}),[items]);
 function toggle(k:string,v:string){setSelected(p=>({...p,[k]:(p[k]||[]).includes(v)?(p[k]||[]).filter(x=>x!==v):[...(p[k]||[]),v]}))}
 const counts=useMemo(()=>({all:items.length,draft:items.filter(x=>status(x)==="draft").length,submitted:items.filter(x=>status(x)==="submitted").length,approved:items.filter(x=>status(x)==="approved").length,rejected:items.filter(x=>status(x)==="rejected").length,favorites:items.filter(x=>favoriteIds.has(x.id)).length}),[items]);
 const shown=useMemo(()=>{const q=search.trim().toLowerCase();return [...items].filter(x=>{if(activeStatus==="favorites"&&!favoriteIds.has(x.id))return false;if(activeStatus!=="all"&&activeStatus!=="favorites"&&status(x)!==activeStatus)return false;for(const f of FILTERS){const a=selected[f.key]||[];if(a.length&&!a.includes(value(x,f.key)))return false}return !q||[x.title,x.theme,x.category,x.level,x.type,...(x.tags||[])].filter(Boolean).join(" ").toLowerCase().includes(q)}).sort((a,b)=>sort==="alpha"?(a.title||"").localeCompare(b.title||"","fr"):Number(b.createdAt||0)-Number(a.createdAt||0))},[items,search,sort,activeStatus,selected,favoriteIds]);
 async function toggleFavorite(x:Exercise){
  const sb=createClient();
  const {data:{user}}=await sb.auth.getUser();
  if(!user){window.location.href="/connexion";return}
  const isFavorite=favoriteIds.has(x.id);
  setFavoriteIds(prev=>{const next=new Set(prev);isFavorite?next.delete(x.id):next.add(x.id);return next});
  if(isFavorite){
    const {error}=await sb.from("favorites").delete().eq("user_id",user.id).eq("item_type","exercise").eq("item_id",x.id);
    if(error){setFavoriteIds(prev=>new Set(prev).add(x.id));alert(error.message)}
    return;
  }
  const {error}=await sb.from("favorites").upsert({
    user_id:user.id,item_type:"exercise",item_id:x.id,
    title:x.title||"Exercice sans titre",image_url:image(x)
  },{onConflict:"user_id,item_type,item_id"});
  if(error){setFavoriteIds(prev=>{const next=new Set(prev);next.delete(x.id);return next});alert(error.message)}
 }
 async function propose(x:Exercise){if(!confirm(`Proposer « ${x.title||"cet exercice"} » au CEO ?`))return;setBusy(x.id);try{await submitExerciseForReview(x.id);await load()}finally{setBusy(null)}}
 async function remove(x:Exercise){if(!confirm(`Supprimer définitivement « ${x.title||"cet exercice"} » ?`))return;setBusy(x.id);try{if(await deleteExercise(x.id))setItems(p=>p.filter(e=>e.id!==x.id))}finally{setBusy(null)}}
 return <main className="page"><div className="top"><Link href="/mon-compte">← Retour à mon compte</Link><Link className="create" href="/exercices/creer">+ Créer un exercice</Link></div>
 <section className="hero"><span>MYBASKET PERSONNEL</span><h1>MES EXERCICES</h1><p>Uniquement les exercices que tu as créés ou les copies personnelles que tu as modifiées.</p></section>
 <div className="status">{(["all","draft","submitted","approved","rejected","favorites"] as StatusKey[]).map(k=><button key={k} className={activeStatus===k?"on":""} onClick={()=>setActiveStatus(k)}>{k==="all"?"Tous":k==="favorites"?"⭐ Favoris":STATUS_LABELS[k]} <b>{counts[k]}</b></button>)}</div>
 <div className="tools"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher dans mes exercices…"/><select value={sort} onChange={e=>setSort(e.target.value as SortKey)}><option value="recent">Plus récents</option><option value="alpha">A → Z</option></select></div>
 <div className="layout"><aside>{FILTERS.map(f=><section key={f.key}><h3>{f.label}</h3>{(options[f.key]||[]).map(v=><label key={v}><input type="checkbox" checked={(selected[f.key]||[]).includes(v)} onChange={()=>toggle(f.key,v)}/><span>{v}</span></label>)}</section>)}</aside>
 <section>{loading?<div className="empty">Chargement…</div>:shown.length===0?<div className="empty">Aucun exercice correspondant.</div>:<div className="grid">{shown.map(x=><article className="card" key={x.id}>
<button type="button" className={`favorite ${favoriteIds.has(x.id)?"on":""}`} aria-label={favoriteIds.has(x.id)?"Retirer des favoris":"Ajouter aux favoris"} title={favoriteIds.has(x.id)?"Retirer des favoris":"Ajouter aux favoris"} onClick={(e)=>{e.preventDefault();e.stopPropagation();void toggleFavorite(x)}}>{favoriteIds.has(x.id)?"★":"☆"}</button>
<Link className="cover" href={`/exercices/${x.id}`}>{image(x)?<img src={image(x)} alt={x.title||"Exercice"}/>:<span>🏀</span>}<i className={`badge ${status(x)}`}>{STATUS_LABELS[status(x)]}</i></Link><div className="body"><h2>{x.title||"Exercice sans titre"}</h2><div className="meta"><strong>{x.theme||"Thème non défini"}</strong><span>{x.category||"Sans catégorie"}</span><span>{x.level||"Niveau non défini"}</span></div><div className="foot"><span>{date(x.createdAt)}</span><div><Link href={`/exercices/${x.id}/modifier`}>Modifier</Link>{status(x)!=="submitted"&&<button disabled={busy===x.id} onClick={()=>propose(x)}>Proposer</button>}<button className="del" disabled={busy===x.id} onClick={()=>remove(x)}>Supprimer</button></div></div></div></article>)}</div>}</section></div>
 <style jsx>{`.page{min-height:100vh;background:#f7f7f8;color:#171717;padding:34px;font-family:Roboto,Arial,sans-serif}.top,.tools,.status{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.top{justify-content:space-between}.top a{color:#6b1a2c;font-weight:850;text-decoration:none}.create{background:#6b1a2c!important;color:white!important;padding:11px 15px;border-radius:9px}.hero{margin:28px 0 18px}.hero span{font-size:11px;letter-spacing:.13em;color:#d4a24c;font-weight:950}.hero h1{margin:5px 0;color:#6b1a2c;font-size:36px}.hero p{margin:0;color:#666}.status button{border:1px solid #ddd;background:white;border-radius:9px;padding:9px 12px;font-weight:800}.status button.on{background:#6b1a2c;color:white;border-color:#6b1a2c}.tools{margin:16px 0}.tools input{flex:1;min-width:260px}.tools input,.tools select{height:42px;border:1px solid #ddd;border-radius:9px;background:white;padding:0 12px}.layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px}aside{background:white;border:1px solid #e5e5e7;border-radius:14px;padding:15px;height:max-content}aside section+section{border-top:1px solid #eee;margin-top:14px;padding-top:10px}aside h3{font-size:11px;color:#6b1a2c;letter-spacing:.06em}aside label{display:flex;gap:8px;margin:8px 0;font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}.card{position:relative;background:white;border:1px solid #e5e5e7;border-radius:15px;overflow:hidden;display:flex;flex-direction:column;height:100%}.favorite{position:absolute;z-index:20;top:10px;right:10px;width:38px;height:38px;border-radius:50%;border:1px solid #eadfe2;background:rgba(255,255,255,.96);color:#6b1a2c;box-shadow:0 4px 14px rgba(0,0,0,.12);font-size:23px;line-height:1;display:grid;place-items:center;cursor:pointer}.favorite:hover{transform:scale(1.06);background:#fff8eb}.favorite.on{background:#6b1a2c;color:#d4a24c;border-color:#6b1a2c}.cover{position:relative;display:grid;place-items:center;aspect-ratio:16/10;background:#f1f1f1;overflow:hidden;text-decoration:none;font-size:34px}.cover img{width:100%;height:100%;object-fit:contain}.badge{position:absolute;top:9px;left:9px;background:#222;color:white;border-radius:999px;padding:5px 8px;font-size:10px;font-style:normal;font-weight:900}.badge.submitted{background:#a56a00}.badge.approved{background:#167949}.badge.rejected{background:#ac2525}.body{padding:14px;display:flex;flex:1;flex-direction:column}.body h2{margin:0;min-height:46px;font-size:18px;line-height:1.28;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.meta{display:grid;gap:4px;min-height:70px;margin-top:10px;font-size:13px}.meta strong{color:#6b1a2c}.meta span{color:#666}.foot{margin-top:auto;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;gap:8px;align-items:end;color:#777;font-size:11px}.foot div{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.foot a,.foot button{border:0;background:none;color:#6b1a2c;font-weight:850;text-decoration:none;padding:0;cursor:pointer;font-size:11px}.foot .del{color:#a22}.empty{background:white;border:1px solid #e5e5e7;border-radius:14px;padding:30px;color:#777}@media(max-width:1050px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.page{padding:20px}.layout{grid-template-columns:1fr}.grid{grid-template-columns:1fr}}`}</style></main>
}
