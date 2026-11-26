import { redirect } from "next/navigation";

export default function LegacyManagementAdminPage() {
  redirect("/mon-compte/club?tab=administratif");
}
