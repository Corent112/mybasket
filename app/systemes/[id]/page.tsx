import { requireAccess } from "@/lib/require-access";
import SystemeDetailPermissions from "./SystemeDetailPermissions";

export default async function SystemeDetailPage() {
  await requireAccess("systemes");

  return <SystemeDetailPermissions />;
}
