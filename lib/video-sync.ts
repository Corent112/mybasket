/* ============================================================================
 * lib/video-sync.ts — Synchronisation vidéo ↔ codage (source unique)
 * ----------------------------------------------------------------------------
 * Une vidéo peut être ajoutée APRÈS le codage d'un match. Elle est alors souvent
 * plus longue (échauffement, présentation, temps mort avant l'entre-deux…). Le
 * codage MyBasket, lui, a été enregistré avec sa propre chronologie brute
 * (possessionStart / possessionEnd / clipStart / clipEnd / videoTime). On ne
 * touche JAMAIS à ces temps bruts : on ajoute une synchronisation AU NIVEAU DU
 * MATCH qui, à la lecture, convertit un temps « source » (codage) en un temps
 * « média » (position réelle dans le fichier vidéo).
 *
 * Trois modes :
 *   - native      : la vidéo était présente pendant le codage → aucun décalage.
 *   - offset      : vidéo ajoutée après → décalage global (media = source + offset).
 *   - calibrated  : deux points de synchro pour corriger une dérive
 *                   (media = source * rate + offset).
 *
 * TOUTE lecture vidéo de l'application doit passer par resolveSyncedVideoTime /
 * resolveActionClipBounds. Aucune lecture ne doit utiliser directement
 * action.clipStart / action.clipEnd sans passer par cette synchronisation.
 * ========================================================================== */

export type VideoSyncMode = 'native' | 'offset' | 'calibrated';

/** État de synchro d'un match (persisté dans match_stats + project_state). */
export type VideoSyncState = {
  mode: VideoSyncMode;
  offset: number;
  rate: number;
  anchorActionId?: string | null;
  anchorSourceTime?: number | null;
  anchorMediaTime?: number | null;
  /** true dès qu'une synchro a été validée (évite de redemander à la réouverture). */
  validated?: boolean;
};

/** Synchro par défaut : vidéo présente pendant le codage, aucun décalage. */
export const NATIVE_SYNC: VideoSyncState = {
  mode: 'native',
  offset: 0,
  rate: 1,
  anchorActionId: null,
  anchorSourceTime: null,
  anchorMediaTime: null,
  validated: false,
};

function safeFinite(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalise n'importe quelle source partielle (colonnes SQL, project_state,
 * ancien projet sans synchro) en un VideoSyncState complet et sûr.
 * Compatibilité §10 : mode absent → 'native', offset absent → 0, rate absent → 1.
 */
export function normalizeSync(
  partial:
    | Partial<VideoSyncState>
    | {
        video_sync_mode?: string | null;
        video_sync_offset?: number | null;
        video_sync_rate?: number | null;
        video_sync_anchor_action_id?: string | null;
        video_sync_anchor_source_time?: number | null;
        video_sync_anchor_media_time?: number | null;
      }
    | null
    | undefined
): VideoSyncState {
  if (!partial) return { ...NATIVE_SYNC };

  const p = partial as Record<string, unknown>;

  const rawMode = String(
    p.mode ?? p.videoSyncMode ?? p.video_sync_mode ?? 'native'
  );
  const mode: VideoSyncMode =
    rawMode === 'offset' || rawMode === 'calibrated' ? rawMode : 'native';

  const offset = safeFinite(
    p.offset ?? p.videoSyncOffset ?? p.video_sync_offset,
    0
  );
  const rate = safeFinite(p.rate ?? p.videoSyncRate ?? p.video_sync_rate, 1);

  const anchorActionId =
    (p.anchorActionId ??
      p.videoSyncAnchorActionId ??
      p.video_sync_anchor_action_id ??
      null) as string | null;

  const anchorSourceTimeRaw =
    p.anchorSourceTime ??
    p.videoSyncAnchorSourceTime ??
    p.video_sync_anchor_source_time ??
    null;
  const anchorMediaTimeRaw =
    p.anchorMediaTime ??
    p.videoSyncAnchorMediaTime ??
    p.video_sync_anchor_media_time ??
    null;

  const validated =
    (p.validated ?? p.videoSyncValidated ?? null) != null
      ? Boolean(p.validated ?? p.videoSyncValidated)
      : mode !== 'native';

  return {
    mode,
    offset,
    rate,
    anchorActionId: anchorActionId ?? null,
    anchorSourceTime:
      anchorSourceTimeRaw == null ? null : safeFinite(anchorSourceTimeRaw, 0),
    anchorMediaTime:
      anchorMediaTimeRaw == null ? null : safeFinite(anchorMediaTimeRaw, 0),
    validated,
  };
}

/**
 * FONCTION CENTRALE DE CONVERSION.
 * Convertit un temps brut de codage (« source ») en position réelle dans la
 * vidéo (« média »). En mode native, aucun décalage n'est appliqué.
 */
export function resolveSyncedVideoTime(
  rawTime: number | null | undefined,
  sync: { mode: VideoSyncMode; offset: number; rate: number }
): number | null {
  if (rawTime == null) return null;

  if (sync.mode === 'native') {
    return Math.max(0, rawTime);
  }

  return Math.max(
    0,
    rawTime * (Number.isFinite(sync.rate) ? sync.rate : 1) +
      (Number.isFinite(sync.offset) ? sync.offset : 0)
  );
}

/** Forme minimale d'action nécessaire au calcul des bornes de clip. */
export type SyncableAction = {
  possessionStart?: number | null;
  possessionEnd?: number | null;
  clipStart?: number | null;
  clipEnd?: number | null;
  videoTime?: number | null;
};

/**
 * Bornes de lecture d'un clip, DÉJÀ synchronisées (position réelle dans la
 * vidéo). Priorité de repli conforme au codage par possession :
 *   début = possessionStart ?? clipStart ?? videoTime
 *   fin   = possessionEnd   ?? clipEnd
 * Les temps bruts de l'action ne sont jamais modifiés : seule la conversion
 * vers l'échelle média est appliquée.
 */
export function resolveActionClipBounds(
  action: SyncableAction | null | undefined,
  sync: { mode: VideoSyncMode; offset: number; rate: number }
): { start: number | null; end: number | null } {
  const rawStart =
    action?.possessionStart ?? action?.clipStart ?? action?.videoTime ?? null;
  const rawEnd = action?.possessionEnd ?? action?.clipEnd ?? null;

  return {
    start: resolveSyncedVideoTime(rawStart, sync),
    end: resolveSyncedVideoTime(rawEnd, sync),
  };
}

/** Décalage à partir d'un unique point (mode offset). media = source + offset. */
export function computeOffsetSync(sourceTime: number, mediaTime: number): VideoSyncState {
  return {
    mode: 'offset',
    offset: mediaTime - sourceTime,
    rate: 1,
    anchorActionId: null,
    anchorSourceTime: sourceTime,
    anchorMediaTime: mediaTime,
    validated: true,
  };
}

/**
 * Calibration à deux points (mode calibrated). Corrige une éventuelle dérive :
 *   rate   = (media2 - media1) / (source2 - source1)
 *   offset = media1 - source1 * rate
 * Renvoie { ok: false } si les deux points ssource sont identiques.
 */
export function computeCalibratedSync(
  source1: number,
  media1: number,
  source2: number,
  media2: number
): { ok: true; sync: VideoSyncState; rate: number } | { ok: false; reason: string } {
  // Toutes les valeurs doivent être finies.
  if (![source1, media1, source2, media2].every((v) => Number.isFinite(v))) {
    return { ok: false, reason: 'Valeurs de synchronisation invalides.' };
  }
  // Les deux points de codage doivent être suffisamment éloignés (≥ 0,1 s),
  // sinon le calcul du rate est instable.
  if (Math.abs(source2 - source1) < 0.1) {
    return { ok: false, reason: 'Les deux points de synchro sont trop proches dans le temps de codage.' };
  }
  const rate = (media2 - media1) / (source2 - source1);
  // Rate doit être fini et strictement positif (le temps ne peut pas s'inverser).
  if (!Number.isFinite(rate) || rate <= 0) {
    return { ok: false, reason: 'Facteur d\'échelle invalide (la vidéo ne peut pas reculer entre les deux points).' };
  }
  const offset = media1 - source1 * rate;
  return {
    ok: true,
    rate,
    sync: {
      mode: 'calibrated',
      rate,
      offset,
      anchorActionId: null,
      anchorSourceTime: source1,
      anchorMediaTime: media1,
      validated: true,
    },
  };
}

/**
 * Formate un décalage signé en +MM:SS,d (ex. +12:34,0).
 * Arrondi calculé sur le TOTAL de dixièmes pour éviter les artefacts :
 * 12,96 s → 00:13,0 (et jamais 00:12,10).
 */
export function formatOffset(offsetSeconds: number): string {
  const safe = Number.isFinite(offsetSeconds) ? offsetSeconds : 0;
  const sign = safe < 0 ? '-' : '+';
  const totalTenths = Math.round(Math.abs(safe) * 10);
  const mm = Math.floor(totalTenths / 600);
  const ss = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')},${tenths}`;
}

/** Colonnes SQL match_stats ↔ VideoSyncState (écriture). */
export function syncToColumns(sync: VideoSyncState) {
  return {
    video_sync_mode: sync.mode,
    video_sync_offset: sync.offset,
    video_sync_rate: sync.rate,
    video_sync_anchor_action_id: sync.anchorActionId ?? null,
    video_sync_anchor_source_time: sync.anchorSourceTime ?? null,
    video_sync_anchor_media_time: sync.anchorMediaTime ?? null,
    video_sync_updated_at: new Date().toISOString(),
  };
}

/** VideoSyncState ↔ champs project_state (écriture dans le JSON du brouillon). */
export function syncToProjectState(sync: VideoSyncState) {
  return {
    videoSyncMode: sync.mode,
    videoSyncOffset: sync.offset,
    videoSyncRate: sync.rate,
    videoSyncAnchorActionId: sync.anchorActionId ?? null,
    videoSyncAnchorSourceTime: sync.anchorSourceTime ?? null,
    videoSyncAnchorMediaTime: sync.anchorMediaTime ?? null,
    videoSyncValidated: sync.validated ?? false,
  };
}