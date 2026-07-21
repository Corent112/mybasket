import { redirect } from "next/navigation";
import { hasAccess } from "@/lib/access";

export async function requireAccess(sectionKey: string) {
  const allowed = await hasAccess(sectionKey);

  if (!allowed) {
    redirect("/abonnements");
  }
}