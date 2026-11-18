import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin-server';

export async function GET() {
  const db = createAdminClient({ noStore: true }) || await createClient();
  const [published, configured] = await Promise.all([
    db.from('admin_slider').select('id,title,subtitle,image_url,button_label,button_href,sort_order').in('placement', ['home', 'global']).eq('status', 'active').order('sort_order', { ascending: true }).order('id'),
    // Only the existence of a configured slider is exposed, never draft content.
    db.from('admin_slider').select('id', { count: 'exact', head: true }).in('placement', ['home', 'global']),
  ]);
  if (published.error || configured.error) return NextResponse.json({ error: 'Slider indisponible.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json({ slides: published.data || [], configured: (configured.count || 0) > 0 }, { headers: { 'Cache-Control': 'no-store' } });
}
