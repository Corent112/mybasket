import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin/guard';
export default async function EditSlidePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  redirect(`/admin/slider?slide=${encodeURIComponent(id)}`);
}
