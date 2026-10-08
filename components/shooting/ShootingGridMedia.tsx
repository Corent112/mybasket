"use client";
import { shootingGridImages } from "@/lib/shooting-grid-media";
export default function ShootingGridMedia({grid}: {grid: {court_schema_url?: string|null;court_schema_data?:any;movement_video_url?:string|null}}) {
  const images = shootingGridImages(grid);
  if (!images.length && !grid.movement_video_url) return null;
  return <section aria-label="Vidéo et schémas de la grille" style={{display:"grid",gap:12,margin:"16px 0"}}>
    {grid.movement_video_url && <div><strong>Vidéo de la grille</strong><video src={grid.movement_video_url} controls playsInline preload="metadata" style={{display:"block",width:"100%",maxHeight:340,background:"#111",borderRadius:12,marginTop:8}} /></div>}
    {!!images.length && <div><strong>Schémas de la grille ({images.length})</strong><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:12,marginTop:8}}>{images.map((image,index)=><figure key={`${index}:${image}`} style={{margin:0}}><a href={image} target="_blank" rel="noreferrer"><img src={image} alt={`Schéma ${index+1} de la grille`} style={{width:"100%",borderRadius:10,border:"1px solid #eadfd9"}} /></a><figcaption style={{fontSize:12,marginTop:4}}>Schéma {index+1}</figcaption></figure>)}</div></div>}
  </section>;
}
