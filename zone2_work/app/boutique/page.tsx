// app/boutique/page.tsx
import { getActiveProducts, getFilters } from '@/lib/shop/queries';
import ShopBrowser from './ShopBrowser';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Boutique MyBasket' };

export default async function BoutiquePage() {
  const [products, filters] = await Promise.all([getActiveProducts(), getFilters()]);
  return <ShopBrowser products={products} filters={filters} />;
}