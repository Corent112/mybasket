/** Institution roles never grant a platform administrator role. */
export function canManageInstitutionTraining(member:{role?:string|null;permissions?:Record<string,unknown>|null}|null|undefined){if(!member||member.permissions?.read_only===true)return false;return ['owner','admin','formation'].includes(String(member.role||''))||member.permissions?.training===true;}
export function institutionTabsFor(member:{role?:string|null;permissions?:Record<string,unknown>|null}|null){
 if(!member)return [];
 const role=String(member.role||'');if(role==='owner'||role==='admin')return null;
 if(role==='formation')return ['Formation des cadres','Ressources'];
 const p=member.permissions||{};const tabs=['Dashboard','Ressources'];
 if(p.players)tabs.push('Joueurs','Dossiers de sortie');if(p.training)tabs.push('Formation des cadres');if(p.calendar)tabs.push('Mon calendrier');if(p.documents)tabs.push('Documents');if(p.communication)tabs.push('Communication');return tabs;
}
