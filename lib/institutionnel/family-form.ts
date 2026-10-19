import { institutionalPlayerCounts } from './dashboard-summary';
export const FAMILY_GROUPS = [
  {id:'u13m',label:'U13 garçons',detail:'Joueurs U12 et U13'},
  {id:'u13f',label:'U13 filles',detail:'Joueuses U12 et U13'},
  {id:'u14m',label:'U14 garçons',detail:'Joueurs U14 uniquement'},
  {id:'u14f',label:'U14 filles',detail:'Joueuses U14 uniquement'},
] as const;
export type FamilyGroup = typeof FAMILY_GROUPS[number]['id'];
export function familyGroup(value:unknown) { return FAMILY_GROUPS.find(g=>g.id===value); }
export function belongsToFamilyGroup(player:any,group:FamilyGroup,seasonLabel?:string|null):boolean {
  if(player.archived || player.status==='archived' || player.profile_data?.lifecycle?.workflowStatus==='archived')return false;
  return institutionalPlayerCounts([player],seasonLabel)[group]===1;
}
export function familyName(value:unknown):string {
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
export function familyBirthdate(value:unknown):string|null {
  const raw=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
  const d=new Date(`${raw}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===raw?raw:null;
}
/** Seuls les champs du formulaire peuvent être écrits ; vide signifie conserver. */
export function familyPlayerPatch(body:any,profile:Record<string,any>,group:FamilyGroup) {
  const patch:Record<string,any>={},extra:Record<string,any>={...profile};let count=0;
  for(const [key,min,max] of [['height_cm',50,260],['father_height_cm',100,260],['mother_height_cm',100,260]] as const) {
    const raw=String(body[key]??'').trim();if(!raw)continue;
    const value=Number(raw.replace(',','.'));if(!Number.isFinite(value)||value<min||value>max)throw Error(`La taille doit être comprise entre ${min} et ${max} cm.`);
    patch[key]=value;count++;
  }
  for(const [input,dest,max] of [['club_name','club_name',150],['street','street',250],['postal_code','postalCode',12],['city','city',100]] as const) {
    const value=String(body[input]??'').trim();if(!value)continue;if(value.length>max)throw Error('Une information est trop longue.');
    if(input==='club_name')patch.club_name=value;else extra[dest]=value;count++;
  }
  if(!count)throw Error('Renseignez au moins une information.');
  const now=new Date().toISOString();
  extra.familyQuestionnaire={submittedAt:now,group};patch.profile_data=extra;patch.updated_at=now;
  return patch;
}
