'use client';

import { createClient } from '@/lib/supabase/client';

export type LiveRole = 'individual' | 'collective';
export type SharedLiveState = {
  id: string; matchId: string; teamId: string; joinCode: string;
  status: 'live'|'paused'|'ended'; controllerClientId: string|null;
  currentPeriod: number; currentClock: string; currentPossessionId: string|null;
  currentLineup: string[]; scoreUs: number; scoreThem: number;
};
export type PickPayload = {
  zone?: string|null; handlerPlayerId: string; screenerPlayerId: string;
  rollerPlayerId?: string|null;
  screenerOutcome?: 'roll'|'pop'|'short-roll'|'slip'|'ghost'|'rescreen'|'other'|null;
  defenseCoverage?: 'drop'|'switch'|'hedge'|'show'|'ice'|'trap'|'under'|'over'|'other'|null;
};

const code = () => `MB-${Math.floor(1000 + Math.random()*9000)}`;
const map = (r:any): SharedLiveState => ({
  id:String(r.id), matchId:String(r.match_id), teamId:String(r.team_id), joinCode:String(r.join_code),
  status:r.status, controllerClientId:r.controller_client_id ?? null,
  currentPeriod:Number(r.current_period||1), currentClock:r.current_clock||'10:00',
  currentPossessionId:r.current_possession_id ?? null,
  currentLineup:Array.isArray(r.current_lineup)?r.current_lineup:[], scoreUs:Number(r.score_us||0), scoreThem:Number(r.score_them||0),
});

export async function createSharedLiveSession(matchId:string, teamId:string, clientId:string, lineup:string[]) {
  const sb=createClient(); const {data:{user}}=await sb.auth.getUser(); if(!user) throw new Error('Utilisateur non connecté');
  for(let i=0;i<8;i++) {
    const {data,error}=await sb.from('live_sessions').insert({match_id:matchId,team_id:teamId,owner_id:user.id,join_code:code(),controller_client_id:clientId,current_lineup:lineup}).select('*').single();
    if(!error && data) return map(data); if(error?.code!=='23505') throw error;
  }
  throw new Error('Impossible de générer un code de session');
}

export async function joinSharedLiveSession(joinCode:string) {
  const sb=createClient();
  const {data,error}=await sb.from('live_sessions').select('*').eq('join_code',joinCode.trim().toUpperCase()).eq('status','live').single();
  if(error) throw error; return map(data);
}

export async function updateSharedLiveState(sessionId:string, patch:Partial<{controller_client_id:string;current_period:number;current_clock:string;current_possession_id:string|null;current_lineup:string[];score_us:number;score_them:number;status:string;}>) {
  const {error}=await createClient().from('live_sessions').update({...patch,updated_at:new Date().toISOString()}).eq('id',sessionId); if(error) throw error;
}

export async function openSharedPossession(session:SharedLiveState, period:number, clock:string, lineup:string[], offense:'us'|'them'='us') {
  const sb=createClient();
  const {data:last}=await sb.from('live_possessions').select('number').eq('session_id',session.id).order('number',{ascending:false}).limit(1).maybeSingle();
  const {data,error}=await sb.from('live_possessions').insert({session_id:session.id,match_id:session.matchId,number:Number(last?.number||0)+1,period,start_clock:clock,offense,lineup}).select('*').single();
  if(error) throw error; await updateSharedLiveState(session.id,{current_possession_id:data.id,current_period:period,current_clock:clock,current_lineup:lineup}); return data;
}

export async function savePickEvent(session:SharedLiveState, possessionId:string, pick:PickPayload, actionClientId?:string|null) {
  const sb=createClient(); const {data:{user}}=await sb.auth.getUser();
  // Un groupe d'action est l'ancre commune entre le tag collectif et le résultat individuel.
  // Le résultat individuel suivant du handler dans la même possession pourra s'y rattacher automatiquement.
  const {data:lastGroup}=await sb.from('live_action_groups').select('sequence_no').eq('session_id',session.id).eq('possession_id',possessionId).order('sequence_no',{ascending:false}).limit(1).maybeSingle();
  const sequenceNo=Number(lastGroup?.sequence_no||0)+1;
  const {data:group,error:groupError}=await sb.from('live_action_groups').insert({session_id:session.id,possession_id:possessionId,match_id:session.matchId,period:session.currentPeriod,clock:session.currentClock,status:'open',confidence:1,sequence_no:sequenceNo,handler_player_id:pick.handlerPlayerId,screener_player_id:pick.screenerPlayerId}).select('id').single();
  if(groupError) throw groupError;
  const {data,error}=await sb.from('live_pick_events').insert({session_id:session.id,possession_id:possessionId,match_id:session.matchId,action_group_id:group.id,action_client_id:actionClientId||null,sequence_no:sequenceNo,zone:pick.zone||null,handler_player_id:pick.handlerPlayerId,screener_player_id:pick.screenerPlayerId,roller_player_id:pick.rollerPlayerId||null,screener_outcome:pick.screenerOutcome||null,defense_coverage:pick.defenseCoverage||null,created_by:user?.id||null}).select('*').single();
  if(error) throw error; return data;
}

export function subscribeSharedLive(sessionId:string, onState:(s:SharedLiveState)=>void, onPossession?:()=>void) {
  const sb=createClient();
  const ch=sb.channel(`mybasket-live:${sessionId}`)
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'live_sessions',filter:`id=eq.${sessionId}`},(p:any)=>onState(map(p.new)))
    .on('postgres_changes',{event:'*',schema:'public',table:'live_possessions',filter:`session_id=eq.${sessionId}`},()=>onPossession?.())
    .subscribe();
  return ()=>{ void sb.removeChannel(ch); };
}
