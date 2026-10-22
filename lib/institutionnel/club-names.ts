const words=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/(\d+)\s*(?:eme|er|e)\b/g,'$1').match(/[a-z]+|\d+/g)||[];
export const clubNameKey=(value:string)=>words(value).filter(word=>!['basket','basketball','club'].includes(word)).join('');
const clean=(value:string)=>value.trim().replace(/\s+/g,' ');
const acronym=(value:string)=>{const list=words(value);return list.map(word=>/^\d+$/.test(word)?word:word[0]).join('');};
export function clubDirectory(values:Array<string|null|undefined>){
 const groups=new Map<string,string[]>();for(const raw of values){if(!raw?.trim())continue;const name=clean(raw),key=clubNameKey(name);if(!key)continue;groups.set(key,[...new Set([...(groups.get(key)||[]),name])]);}
 const style=(name:string)=>name===name.toUpperCase()?0:(/^[A-ZÀ-Ÿ]/.test(name)?10:0)+(name.match(/[A-ZÀ-Ÿ]/g)||[]).length;
 const preferred=(names:string[])=>{const value=[...names].sort((a,b)=>b.length-a.length||style(b)-style(a)||a.localeCompare(b,'fr'))[0];return value===value.toUpperCase()?value:value.replace(/(^|\s)([a-zà-ÿ])/g,(_,space,letter)=>space+letter.toUpperCase());};
 const canonical=new Map<string,string>([...groups].map(([key,names])=>[key,preferred(names)]));
 // An omitted arrondissement is safe only when exactly one numbered version exists.
 for(const [key,label]of canonical){if(/\d/.test(key))continue;const numbered=[...canonical.entries()].filter(([candidate])=>/\d/.test(candidate)&&candidate.replace(/\d/g,'')===key);if(numbered.length===1)canonical.set(key,numbered[0][1]);}
 const full=[...new Map([...canonical.entries()].filter(([,name])=>words(name).filter(w=>!/^\d+$/.test(w)).length>=2).map(entry=>[entry[1],entry])).values()];
 for(const [key,names]of groups){const name=preferred(names);if(!/^[a-z]{2,6}\d*$/i.test(words(name).join(''))||words(name).filter(w=>!/^\d+$/.test(w)).length>1)continue;
  const short=words(name).join(''),hasNumber=/\d/.test(short);const matches=full.filter(([fullKey,label])=>fullKey!==key&&(hasNumber?acronym(label)===short:acronym(label).replace(/\d/g,'')===short));
  if(matches.length===1)canonical.set(key,matches[0][1]);
 }
 const names=[...new Set(canonical.values())].sort((a,b)=>a.localeCompare(b,'fr'));
 const resolve=(value:string)=>{const key=clubNameKey(value);if(canonical.has(key))return canonical.get(key)!;
  const short=words(value).join('');if(/^[a-z]{2,6}\d*$/.test(short)){const candidates=names.filter(name=>(/\d/.test(short)?acronym(name):acronym(name).replace(/\d/g,''))===short);if(candidates.length===1)return candidates[0];}
  return clean(value);
 };
 return{names,resolve};
}
/** Club names only; never return player identities to a public questionnaire. */
export async function loadInstitutionClubNames(db:any,structureId:string):Promise<string[]>{
 const values:string[]=[];for(let start=0;;start+=1000){const result=await db.from('institutional_players').select('id,club_name').eq('structure_id',structureId).eq('archived',false).order('id').range(start,start+999);if(result.error)throw Error(result.error.message);for(const row of result.data||[])if(row.club_name)values.push(String(row.club_name));if((result.data||[]).length<1000)return clubDirectory(values).names;}
}
export function suggestClubNames(value:string,names:string[]):string[]{
 const query=words(value).join('');if(query.length<2)return[];
 const distance=(a:string,b:string)=>{let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const next=[i];for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));row=next;}return row[b.length];};
 return names.filter(name=>{const full=words(name).join('');return full.includes(query)||acronym(name).startsWith(query)||(query.length>=6&&(query.match(/\d+/g)||[]).join('')===(full.match(/\d+/g)||[]).join('')&&distance(query,full)<=2);}).slice(0,6);
}
