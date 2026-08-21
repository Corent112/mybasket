'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { VideoSyncState } from '@/lib/video-sync';
import { resolveActionClipBounds } from '@/lib/video-sync';

export type AssociableLiveAction = {
  id: string;
  q: number;
  clock: string;
  context?: string;
  systemeName?: string | null;
  systemeSlot?: string | null;
  systemeJeu?: string;
  tempsFort?: string;
  actionType?: string;
  shotType?: string;
  shotResult?: string;
  specialCase?: string;
  playerId?: string | null;
  assist?: boolean | null;
  assistPlayerId?: string | null;
  reboundPlayerId?: string | null;
  reboundType?: string;
  videoTime?: number | null;
  clipStart?: number | null;
  clipEnd?: number | null;
  possessionStart?: number | null;
  possessionEnd?: number | null;
};

type Player = { id: string; num: number; name: string; photo?: string };

type Props = {
  open: boolean;
  actions: AssociableLiveAction[];
  roster: Player[];
  videoUrl?: string | null;
  sync: VideoSyncState;
  onPatch: (actionId: string, patch: { playerId?: string | null; assist?: boolean | null; assistPlayerId?: string | null; reboundPlayerId?: string | null }) => void;
  onClose: () => void;
};

const isMadeBasket = (a: AssociableLiveAction) =>
  a.actionType === 'tir' && a.shotResult === 'made' && (a.shotType === '2PTS' || a.shotType === '3PTS');

const actionLabel = (a: AssociableLiveAction) => {
  if (a.actionType === 'tir') return `${a.shotType || 'Tir'} ${a.shotResult === 'made' ? 'marqué' : a.shotResult === 'missed' ? 'raté' : ''}`.trim();
  if (a.actionType === 'interception') return 'Interception';
  if (a.actionType === 'perte') return 'Perte de balle';
  if (a.actionType === 'contre') return 'Contre';
  if (a.actionType === 'faute-provoquee') return 'Faute provoquée';
  if (a.actionType === 'faute-commise') return 'Faute commise';
  if (a.reboundType === 'off') return 'Rebond offensif';
  if (a.reboundType === 'def') return 'Rebond défensif';
  return a.actionType || 'Action';
};

export default function LivePlayerAssociationModal({ open, actions, roster, videoUrl, sync, onPatch, onClose }: Props) {
  const [scope, setScope] = useState<'all' | 'attaque' | 'defense'>('all');
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  const list = useMemo(() => actions.filter((a) => scope === 'all' ? true : a.context === scope), [actions, scope]);
  const action = list[index] ?? null;
  const completed = useMemo(() => list.filter((a) => !!a.playerId || !!a.assistPlayerId || !!a.reboundPlayerId).length, [list]);

  useEffect(() => { setIndex(0); }, [scope]);
  useEffect(() => { if (index >= list.length) setIndex(Math.max(0, list.length - 1)); }, [index, list.length]);

  useEffect(() => {
    if (!open || !action || !videoRef.current || !videoUrl) return;
    const v = videoRef.current;
    const { start, end } = resolveActionClipBounds(action, sync);
    if (start != null) {
      try { v.currentTime = Math.max(0, start); } catch { /* noop */ }
    }
    v.play().catch(() => {});
    if (stopTimerRef.current) window.clearInterval(stopTimerRef.current);
    if (end != null) {
      stopTimerRef.current = window.setInterval(() => {
        if (v.currentTime >= end) {
          v.pause();
          if (stopTimerRef.current) window.clearInterval(stopTimerRef.current);
          stopTimerRef.current = null;
        }
      }, 80);
    }
    return () => {
      if (stopTimerRef.current) window.clearInterval(stopTimerRef.current);
      stopTimerRef.current = null;
    };
  }, [open, action?.id, videoUrl, sync]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); setIndex((i) => Math.min(list.length - 1, i + 1)); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
      if (e.code === 'Space') { e.preventDefault(); const v = videoRef.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, list.length, onClose]);

  if (!open) return null;

  const actorTitle = action?.context === 'defense'
    ? action?.actionType === 'interception' ? "Qui fait l'interception ?"
      : action?.actionType === 'contre' ? 'Qui fait le contre ?'
        : action?.actionType === 'faute-commise' ? 'Qui commet la faute ?'
          : 'Qui fait l’action ?'
    : action?.actionType === 'faute-provoquee' ? 'Qui provoque la faute ?' : 'Qui fait l’action ?';

  const chooseActor = (playerId: string | null) => {
    if (!action) return;
    const patch: any = { playerId };
    if (action.reboundType === 'off' || action.reboundType === 'def') patch.reboundPlayerId = playerId;
    onPatch(action.id, patch);
  };

  const chooseAssist = (playerId: string | null) => {
    if (!action) return;
    onPatch(action.id, { assist: !!playerId, assistPlayerId: playerId });
  };

  return (
    <div className="assocBack" onClick={onClose}>
      <div className="assocCard" onClick={(e) => e.stopPropagation()}>
        <div className="assocHead">
          <div>
            <b>👥 Associer les joueurs aux attaques / actions</b>
            <span>Chaque association concerne uniquement cette action et son clip, jamais toute la possession.</span>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="assocTabs">
          {([['all','TOUT'],['attaque','ATTAQUE'],['defense','DÉFENSE']] as const).map(([k,l]) => (
            <button key={k} className={scope === k ? 'on' : ''} onClick={() => setScope(k)}>{l}</button>
          ))}
          <span>{completed}/{list.length} renseignées</span>
        </div>

        <div className="assocProgress"><i style={{ width: `${list.length ? (completed / list.length) * 100 : 0}%` }} /></div>

        {!action ? <div className="assocEmpty">Aucune action dans ce filtre.</div> : (
          <div className="assocBody">
            <section className="assocVideoPane">
              {videoUrl ? <video ref={videoRef} src={videoUrl} controls className="assocVideo" /> : <div className="assocNoVideo">🎬<b>Pas encore de vidéo</b><span>Tu peux quand même associer les joueurs à partir de la chronologie et du résultat.</span></div>}
              <div className="assocMeta">
                <b>{action.context === 'defense' ? 'DÉFENSE' : 'ATTAQUE'} · Q{action.q} · {action.clock}</b>
                <strong>{actionLabel(action)}</strong>
                <span>{action.systemeName || action.systemeSlot || action.systemeJeu || ''}{action.tempsFort ? ` · ${action.tempsFort}` : ''}</span>
              </div>
            </section>

            <section className="assocChoices">
              <div className="assocGroup">
                <h3>{actorTitle}</h3>
                <div className="assocPlayers">
                  {roster.map((p) => <button key={p.id} className={action.playerId === p.id ? 'on' : ''} onClick={() => chooseActor(p.id)}><b>#{p.num}</b><span>{p.name}</span></button>)}
                  <button className={!action.playerId ? 'on none' : 'none'} onClick={() => chooseActor(null)}>—<span>Non renseigné</span></button>
                </div>
              </div>

              {isMadeBasket(action) && (
                <div className="assocGroup">
                  <h3>Passe décisive ?</h3>
                  <div className="assocPlayers">
                    {roster.filter((p) => p.id !== action.playerId).map((p) => <button key={p.id} className={action.assistPlayerId === p.id ? 'on' : ''} onClick={() => chooseAssist(p.id)}><b>#{p.num}</b><span>{p.name}</span></button>)}
                    <button className={!action.assistPlayerId ? 'on none' : 'none'} onClick={() => chooseAssist(null)}>—<span>Aucune</span></button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        <div className="assocFoot">
          <button disabled={index <= 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>← Précédent</button>
          <b>{list.length ? `${index + 1} / ${list.length}` : '0 / 0'}</b>
          <button className="next" disabled={index >= list.length - 1} onClick={() => setIndex((i) => Math.min(list.length - 1, i + 1))}>Suivant →</button>
        </div>
      </div>

      <style jsx>{`
        .assocBack{position:fixed;inset:0;z-index:6000;background:rgba(2,5,12,.82);display:grid;place-items:center;padding:16px;backdrop-filter:blur(8px)}
        .assocCard{width:min(1180px,98vw);max-height:96vh;overflow:auto;background:#0b1120;border:1px solid #26344d;border-radius:18px;color:#fff;box-shadow:0 28px 90px rgba(0,0,0,.55)}
        .assocHead{display:flex;align-items:center;justify-content:space-between;padding:15px 18px;border-bottom:1px solid #243149}.assocHead b{display:block;font-size:16px}.assocHead span{display:block;color:#8c99ae;font-size:10px;margin-top:3px}.assocHead>button{width:34px;height:34px;border:0;border-radius:9px;background:#151f31;color:#fff;font-size:22px;cursor:pointer}
        .assocTabs{display:flex;align-items:center;gap:7px;padding:10px 16px}.assocTabs button{border:1px solid #31405b;background:#111b2d;color:#9daabd;border-radius:999px;padding:7px 12px;font-size:10px;font-weight:900;cursor:pointer}.assocTabs button.on{border-color:#d4a24c;color:#d4a24c;background:rgba(212,162,76,.10)}.assocTabs span{margin-left:auto;color:#a9b4c5;font-size:10px}
        .assocProgress{height:4px;background:#172136;margin:0 16px 12px;border-radius:999px;overflow:hidden}.assocProgress i{display:block;height:100%;background:#d4a24c}
        .assocBody{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(360px,.85fr);gap:14px;padding:0 16px 14px}.assocVideoPane,.assocChoices{min-width:0}.assocVideo{width:100%;max-height:500px;background:#000;border-radius:13px;border:1px solid #283750}.assocNoVideo{height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:1px dashed #35445e;border-radius:13px;background:#101827;color:#9ca9bc}.assocNoVideo b{color:#fff}.assocNoVideo span{font-size:10px;max-width:360px;text-align:center}.assocMeta{margin-top:8px;padding:10px 12px;border:1px solid #283750;border-radius:10px;background:#101827;display:grid;gap:3px}.assocMeta b{color:#d4a24c;font-size:10px}.assocMeta strong{font-size:15px}.assocMeta span{color:#8896aa;font-size:10px}
        .assocChoices{display:grid;align-content:start;gap:10px}.assocGroup{border:1px solid #283750;border-radius:12px;background:#101827;padding:11px}.assocGroup h3{margin:0 0 8px;font-size:11px;color:#dce5f3}.assocPlayers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.assocPlayers button{min-height:48px;border:1px solid #33425d;border-radius:9px;background:#131d2f;color:#fff;display:grid;grid-template-columns:44px 1fr;align-items:center;text-align:left;padding:7px 8px;cursor:pointer}.assocPlayers button b{color:#d4a24c}.assocPlayers button span{font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.assocPlayers button.on{border-color:#d4a24c;background:rgba(212,162,76,.12)}.assocPlayers button.none{grid-template-columns:30px 1fr;color:#9eabbf}
        .assocFoot{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:13px 16px;border-top:1px solid #243149;background:#0d1525}.assocFoot button{height:42px;border:1px solid #34435e;border-radius:10px;background:#141e30;color:#fff;font-size:11px;font-weight:900;cursor:pointer}.assocFoot .next{background:#6b1a2c;border-color:#8a2940}.assocFoot b{text-align:center;color:#d4a24c;font-size:11px}.assocFoot button:disabled{opacity:.35;cursor:not-allowed}.assocEmpty{padding:70px;text-align:center;color:#8e9bad}
        @media(max-width:820px){.assocBody{grid-template-columns:1fr}.assocPlayers{grid-template-columns:1fr 1fr}.assocVideo{max-height:300px}}
      `}</style>
    </div>
  );
}
