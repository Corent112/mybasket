import { requireAccess } from "@/lib/require-access";
import AnnoncesClient from "./AnnoncesClient";

export default async function AnnoncesPage() {
  await requireAccess("annonces");

  return <AnnoncesClient />;
}