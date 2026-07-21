import { notFound } from "next/navigation";
import { getProduct } from "@/lib/shop/queries";
import ProductDetail from "./ProductDetail";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function BoutiqueProductPage({ params }: Props) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product || !(product.active || ["active", "published"].includes(product.status))) notFound();

  return <ProductDetail product={product} />;
}
