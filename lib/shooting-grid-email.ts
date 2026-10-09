import sharp from "sharp";
import { SHOT_ZONES } from "./shot-chart-zones";
import { shootingGridImages } from "./shooting-grid-media";
const esc=(v:unknown)=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const pct=(m:number,a:number)=>a?`${Math.round(m/a*1000)/10}`.replace('.',','):"—";
export type ShootingResult={row:{name:string};made:number;attempted:number};
export function shootingGroup(name:string):"2PTS"|"3PTS"|"LF"|"AUTRES" {
 const n=name.toUpperCase();return /\bLF\b|LANCER/.test(n)?"LF":/2\s*(PTS|POINT)/.test(n)?"2PTS":/3\s*(PTS|POINT)/.test(n)?"3PTS":"AUTRES";
}
/** Conservative mapping: only recognised positions; ambiguous/custom names stay in the table. */
export function shootingZone(name:string):string|null {
 const n=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const group=shootingGroup(name);
 if(group!=="2PTS"&&group!=="3PTS")return null;
 const right=/droit|\bd\b/.test(n),left=/gauche|\bg\b/.test(n);if(right&&left)return null;
 if(group==="2PTS") {
  if(/cercle|sous le panier/.test(n))return "z1";
  if(/raquette/.test(n))return "z2";
  if(/corner|coin/.test(n))return right?"z9":left?"z5":null;
  if(/45|aile|elbow/.test(n))return right?"z8":left?"z6":null;
  if(/axe|face/.test(n))return "z7";
 } else {
  if(/corner|coin/.test(n))return right?"z10":left?"z16":null;
  if(/45|aile/.test(n))return right?"z11":left?"z15":null;
  if(/axe|face/.test(n))return "z13";
  if(/slot/.test(n))return right?"z12":left?"z14":null;
 }
 return null;
}
export function shootingChartSvg(results:ShootingResult[]) {
 const totals=new Map<string,{made:number;attempted:number}>();
 for(const result of results){const id=shootingZone(result.row.name);if(!id)continue;const t=totals.get(id)||{made:0,attempted:0};t.made+=result.made;t.attempted+=result.attempted;totals.set(id,t)}
 const zones=SHOT_ZONES.map(z=>{const t=totals.get(z.id);const rate=t?.attempted?t.made/t.attempted:0;const fill=!t?.attempted?'#eee8df':rate>=.6?'#6B1A2C':rate>=.4?'#D4A24C':'#b4aba3';return `<path d="${z.d}" fill="${fill}" stroke="#fff" stroke-width="5"/><text x="${z.px}" y="${z.py-10}" text-anchor="middle" font-family="Arial" font-size="34" font-weight="bold" fill="${t?.attempted?'#fff':'#776d66'}">${t?.attempted?pct(t.made,t.attempted)+' %':'—'}</text>${t?`<text x="${z.px}" y="${z.py+30}" text-anchor="middle" font-family="Arial" font-size="25" fill="${t.attempted?'#fff':'#776d66'}">${t.made}/${t.attempted}</text>`:''}`}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1577" height="997" viewBox="0 0 1577 997"><rect width="1577" height="997" fill="#faf7f1"/>${zones}</svg>`;
}
export async function buildShootingGridEmail({grid,playerName,date,results,playerUrl}:{grid:any;playerName:string;date:string;results:ShootingResult[];playerUrl:string}) {
 const heading=(text:string)=>`<h3 style="font-size:17px;margin:24px 0 12px;color:#6B1A2C;border-bottom:1px solid #D4A24C;padding-bottom:8px">${text}</h3>`;
 const schemas=shootingGridImages(grid).map((url,i)=>`<div style="margin:0 0 16px"><img src="${esc(url)}" alt="Schéma ${i+1}" width="620" style="display:block;width:100%;max-width:620px;height:auto;border:1px solid #eadfd9;border-radius:10px"/><p style="text-align:center;font-size:12px;color:#756760;margin:6px 0">Schéma ${i+1}</p></div>`).join('');
 const detail=results.map((r,i)=>`<tr style="background:${i%2?'#faf7f1':'#fff'}"><td style="padding:9px;border-bottom:1px solid #eee">${esc(r.row.name)}</td><td style="padding:9px;text-align:center;font-weight:bold">${r.made}/${r.attempted}</td><td style="padding:9px;text-align:right;color:#6B1A2C;font-weight:bold">${pct(r.made,r.attempted)}${r.attempted?' %':''}</td></tr>`).join('');
 const groups=['2PTS','3PTS','LF','AUTRES'].map(group=>{const rows=results.filter(r=>shootingGroup(r.row.name)===group);return {group,made:rows.reduce((s,r)=>s+r.made,0),attempted:rows.reduce((s,r)=>s+r.attempted,0),count:rows.length}});
 const recap=groups.filter(g=>g.group!=='AUTRES'||g.count).map(g=>`<tr><td style="padding:12px;border-bottom:1px solid #eee;font-weight:bold">${g.group==='2PTS'?'2 points':g.group==='3PTS'?'3 points':g.group==='LF'?'Lancers francs':'Autres positions'}</td><td style="padding:12px;text-align:center;font-weight:bold">${g.made}/${g.attempted}</td><td style="padding:12px;text-align:right;color:#6B1A2C;font-weight:bold">${pct(g.made,g.attempted)}${g.attempted?' %':''}</td></tr>`).join('');
 const made=results.reduce((s,r)=>s+r.made,0),attempted=results.reduce((s,r)=>s+r.attempted,0);
 const unmapped=results.filter(r=>shootingGroup(r.row.name)!=='LF'&&!shootingZone(r.row.name));
 const png=await sharp(Buffer.from(shootingChartSvg(results))).resize(1100).png().toBuffer();
 const html=`<div style="background:#f7f3f0;padding:20px 8px;font-family:Arial,sans-serif"><div style="max-width:680px;margin:auto;background:white;border:1px solid #eadfd9;border-radius:16px;overflow:hidden"><div style="background:#6B1A2C;padding:26px;color:#fff"><div style="color:#D4A24C;font-size:12px;font-weight:bold;letter-spacing:2px">MYBASKET · GRILLE DE TIR TERMINÉE</div><h1 style="font-size:27px;margin:12px 0 6px">${esc(playerName)}</h1><div>${esc(grid.name)} · ${esc(date)}</div></div><div style="padding:24px">${heading('LES SCHÉMAS DE LA GRILLE')}${schemas||'<p>Aucun schéma associé à cette grille.</p>'}${heading('RÉSULTATS PAR POSITION')}<table role="table" style="width:100%;border-collapse:collapse;font-size:13px"><thead style="background:#6B1A2C;color:white"><tr><th style="text-align:left;padding:10px">Position</th><th style="padding:10px">Réussis / Tentés</th><th style="padding:10px">%</th></tr></thead><tbody>${detail}</tbody></table>${heading('SHOT CHART · RÉSULTATS PAR ZONE')}<img src="cid:shooting-zones" alt="Réussite par zone de tir ; détails dans le tableau" width="620" style="display:block;width:100%;height:auto;border-radius:10px"/><p style="font-size:11px;color:#756760">Zones MyBasket · résultats regroupés par position identifiable. — : aucun tir renseigné. Les lancers francs sont dans le récapitulatif.</p>${unmapped.length?`<p style="font-size:11px;color:#756760">Positions sans zone identifiable : ${unmapped.map(r=>esc(r.row.name)).join(', ')}. Leurs résultats restent dans le tableau.</p>`:''}${heading('RÉCAPITULATIF 2 POINTS · 3 POINTS · LF')}<table style="width:100%;border-collapse:collapse;font-size:14px">${recap}</table><p style="text-align:center;color:#6B1A2C;font-size:19px;font-weight:bold">TOTAL · ${made}/${attempted} · ${pct(made,attempted)}${attempted?' %':''}</p><a href="${esc(playerUrl)}" style="display:block;text-align:center;background:#6B1A2C;color:#fff;padding:15px;border-radius:10px;text-decoration:none;font-weight:bold">Voir les résultats dans MyBasket</a><p style="font-size:11px;color:#756760;text-align:center;margin-top:20px">Session enregistrée dans la fiche du joueur.</p></div></div></div>`;
 return {html,attachments:[{filename:'shot-chart.png',content:png.toString('base64'),content_id:'shooting-zones',content_type:'image/png'}]};
}
