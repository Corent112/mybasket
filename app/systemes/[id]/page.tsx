import { requireAccess } from "@/lib/require-access";
import SystemeDetailClient from "./SystemeDetailClient";

export default async function SystemeDetailPage() {
  await requireAccess("systemes");

  return <SystemeDetailClient />;
}