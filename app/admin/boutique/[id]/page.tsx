import { notFound } from "next/navigation";
import ProductForm from "@/components/shop/ProductForm";
import { getFilters, getProduct } from "@/lib/shop/queries";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function BoutiqueProductAdminPage({ params }: Props) {
  const { id } = await params;
  const [product, filters] = await Promise.all([
    getProduct(id),
    getFilters(),
  ]);

  if (!product) notFound();

  return <ProductForm product={product} filters={filters} />;
}
