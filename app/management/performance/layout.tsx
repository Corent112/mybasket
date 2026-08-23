import { requireAccess } from "@/lib/require-access";
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireAccess("stats_joueur");
  return children;
}
