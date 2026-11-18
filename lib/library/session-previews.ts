import type { createClient } from '@/lib/supabase/client';
import { schemaPreviewImages } from './schema-previews';

/** One paginated batch per 100 sessions, scoped by the existing reader's RLS. */
export async function withSessionPreviews<T extends { id: string }>(db: ReturnType<typeof createClient>, sessions: T[]): Promise<Array<T & { schemaImages: string[] }>> {
  if (!sessions.length) return [];
  const bySession = new Map(sessions.map(session => [session.id, schemaPreviewImages(session)]));
  const chunks = Array.from({ length: Math.ceil(sessions.length / 100) }, (_, index) => sessions.slice(index * 100, (index + 1) * 100).map(session => session.id));
  await Promise.all(chunks.map(async ids => {
    for (let start = 0; ; ) {
      try {
        const { data, error } = await db.from('practice_session_exercises').select('id,session_id,situation_image_url,sort_order').in('session_id', ids).order('sort_order').order('id').range(start, start + 999);
        if (error || !data?.length) return;
        for (const row of data) {
          const images = bySession.get(row.session_id);
          if (images && typeof row.situation_image_url === 'string' && row.situation_image_url.trim() && !images.includes(row.situation_image_url)) images.push(row.situation_image_url);
        }
        start += data.length;
      } catch { return; } // Keep the session list usable if its preview snapshots are unavailable.
    }
  }));
  return sessions.map(session => ({ ...session, schemaImages: bySession.get(session.id) || [] }));
}
