import { requireAccess } from "@/lib/require-access";
import CreerSystemeClient from "./CreerSystemeClient";

export default async function CreerSystemePage() {
  await requireAccess("systemes");
await requireAccess("plaquette");

  return <CreerSystemeClient />;
}