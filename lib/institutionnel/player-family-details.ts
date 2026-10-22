export type SiblingDetail={relation:'brother'|'sister';age:string;heightCm:string};
export function normalizeSiblingDetails(value:unknown):SiblingDetail[]{
 if(!Array.isArray(value)||value.length>12)throw Error('Renseigne au maximum 12 frères et sœurs.');
 return value.map(row=>{
  if(!row||!['brother','sister'].includes(row.relation))throw Error('Choisis frère ou sœur.');
  const age=String(row.age??'').trim(),heightCm=String(row.heightCm??'').trim().replace(',','.');
  if(age&&(!Number.isInteger(Number(age))||Number(age)<0||Number(age)>100))throw Error('L’âge doit être compris entre 0 et 100 ans.');
  if(heightCm&&(!Number.isFinite(Number(heightCm))||Number(heightCm)<30||Number(heightCm)>260))throw Error('La taille doit être comprise entre 30 et 260 cm.');
  return{relation:row.relation,age,heightCm};
 });
}
export function normalizeShoeSize(value:unknown):string|null{
 const raw=String(value??'').trim().replace(',','.');if(!raw)return null;
 const number=Number(raw);if(!Number.isFinite(number)||number<15||number>60)throw Error('La pointure doit être comprise entre 15 et 60.');return String(number);
}
export function siblingDetailsLabel(value:unknown):string{
 if(!Array.isArray(value))return '';
 return value.map(row=>[row.relation==='sister'?'Sœur':'Frère',row.age!==''&&row.age!=null?`${row.age} ans`:null,row.heightCm?`${row.heightCm} cm`:null].filter(Boolean).join(' · ')).join(' ; ');
}
