export type FilterGroup = "type" | "category" | "level" | "age" | "price";
export type ProductStatus = "draft" | "active" | "archived";

export type Product = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock_quantity: number | null;
  status: ProductStatus | string;
  is_featured: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ProductFilter = {
  id: string;
  filter_group: FilterGroup | string;
  label: string;
  value: string;
  sort: number;
  active: boolean;
  created_at?: string;
};

export type GroupedFilters = Record<string, ProductFilter[]>;

export type ProductReview = {
  id: string;
  product_id: string;
  user_id: string | null;
  author_name: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type ReviewStat = { product_id: string; avg_rating: number; votes: number };
export type ProductDraft = Omit<Product, "id" | "created_at" | "updated_at">;

export const FILTER_GROUP_LABELS: Record<string, string> = {
  type: "Type de produit",
  category: "Catégorie",
  level: "Niveau",
  age: "Catégorie d’âge",
  price: "Prix",
};
