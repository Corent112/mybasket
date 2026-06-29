// app/admin/boutique/nouveau/page.tsx
import { getFilters } from '@/lib/shop/queries';
import ProductForm from '@/components/shop/ProductForm';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const filters = await getFilters();
  return <ProductForm filters={filters} />;
}