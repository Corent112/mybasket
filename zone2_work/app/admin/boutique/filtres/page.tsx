// app/admin/boutique/filtres/page.tsx
import { getFilters } from '@/lib/shop/queries';
import FiltersManager from './FiltersManager';

export const dynamic = 'force-dynamic';

export default async function BoutiqueFiltersPage() {
  const filters = await getFilters(true); // inclut les inactifs
  return <FiltersManager filters={filters} />;
}