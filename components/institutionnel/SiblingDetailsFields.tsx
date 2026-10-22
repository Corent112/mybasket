'use client';
import type {SiblingDetail} from '@/lib/institutionnel/player-family-details';
export default function SiblingDetailsFields({value,onChange,disabled=false}:{value:SiblingDetail[];onChange:(value:SiblingDetail[])=>void;disabled?:boolean}){
 const patch=(index:number,field:keyof SiblingDetail,next:string)=>onChange(value.map((row,i)=>i===index?{...row,[field]:next}:row));
 return <section className="siblings"><h3>Frères et sœurs</h3><p>Âge et taille actuels, si connus. Vous pouvez laisser un champ vide.</p>{value.map((row,index)=><div className="sibling" key={index}>
 <label>Lien<select aria-label={`Lien frère ou sœur ${index+1}`} disabled={disabled} value={row.relation} onChange={e=>patch(index,'relation',e.target.value)}><option value="brother">Frère</option><option value="sister">Sœur</option></select></label>
 <label>Âge (ans)<input aria-label={`Âge frère ou sœur ${index+1}`} disabled={disabled} type="number" min={0} max={100} step={1} value={row.age} onChange={e=>patch(index,'age',e.target.value)}/></label>
 <label>Taille (cm)<input aria-label={`Taille frère ou sœur ${index+1}`} disabled={disabled} type="number" min={30} max={260} step="0.1" value={row.heightCm} onChange={e=>patch(index,'heightCm',e.target.value)}/></label>
 <button type="button" aria-label={`Retirer frère ou sœur ${index+1}`} disabled={disabled} onClick={()=>onChange(value.filter((_,i)=>i!==index))}>×</button></div>)}
 <button type="button" disabled={disabled||value.length>=12} onClick={()=>onChange([...value,{relation:'brother',age:'',heightCm:''}])}>+ Ajouter un frère ou une sœur</button>
 <style jsx>{`.siblings{grid-column:1/-1;margin:14px 0;padding:14px;border:1px solid #eadfd8;border-radius:10px}.siblings h3{margin:0;color:#6b1a2c;font-size:15px}.siblings p{font-size:12px;color:#776c70}.sibling{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:10px}label{display:grid;gap:5px;font-size:12px}input,select{box-sizing:border-box;width:100%;min-width:0;border:1px solid #ddd1ca;border-radius:7px;padding:9px;background:white;color:#352b2e;font:inherit}button{border:1px solid #dbc6cd;border-radius:7px;padding:8px 10px;background:#fff;color:#701b32;cursor:pointer;font-size:12px}button:disabled{opacity:.5}@media(max-width:480px){.sibling{grid-template-columns:1fr 1fr}.sibling button{justify-self:end}}`}</style></section>;
}
