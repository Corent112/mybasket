import { versionedHighlightKey } from './livestat-labels';
import type { LiveCodingProfile } from '@/components/prise-stats-pro/LiveCodingSettingsModal';
type Store=Pick<Storage,'getItem'|'setItem'>;
const legacyKey=(teamId:string)=>`mybasket:livestat-coding-profiles:${teamId||'default'}`;
export const codingProfileKey=(ownerId:string,teamId:string)=>`mybasket:livestat-coding-profiles:v2:${ownerId}:${teamId||'default'}`;
export function readCodingProfiles(store:Store,ownerId:string,teamId:string):LiveCodingProfile[]{
  if(!ownerId)return [];
  const raw=store.getItem(codingProfileKey(ownerId,teamId));
  if(raw){const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error('Fenêtres enregistrées illisibles');return parsed;}
  // Existing browser windows are retained for the first account opening this team.
  // Another account on the same browser must never inherit that migration.
  const claimedKey=`${legacyKey(teamId)}:migrated-owner`;
  const claimed=store.getItem(claimedKey);
  if(claimed&&claimed!==ownerId)return [];
  const legacy=store.getItem(legacyKey(teamId));
  if(!legacy)return [];
  const parsed=JSON.parse(legacy);if(!Array.isArray(parsed))throw new Error('Fenêtres enregistrées illisibles');
  store.setItem(claimedKey,ownerId);
  store.setItem(codingProfileKey(ownerId,teamId),JSON.stringify(parsed));
  return parsed;
}
export function writeCodingProfiles(store:Store,ownerId:string,teamId:string,profiles:LiveCodingProfile[]){
  if(!ownerId)throw new Error('Connexion nécessaire pour enregistrer une fenêtre');
  store.setItem(codingProfileKey(ownerId,teamId),JSON.stringify(profiles));
}

export function normalizeCodingProfileHighlights(profile:LiveCodingProfile):LiveCodingProfile {
  const buttons=profile.buttons?.map(row=>row.category==='temps'?{...row,key:versionedHighlightKey(row.key,row.label)}:row);
  const activeButtonKeys={...profile.activeButtonKeys,temps:profile.activeButtonKeys?.temps?.map(key=>{const row=profile.buttons?.find(row=>row.category==='temps'&&row.key===key);return row?versionedHighlightKey(key,row.label):key;})};
  return {...profile,buttons,activeButtonKeys};
}
