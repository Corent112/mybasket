import { requireAccess } from "@/lib/require-access";
import PlaquetteClient from "./PlaquetteClient";

export default async function PlaquettePage() {
  await requireAccess("plaquette");

  return <PlaquetteClient />;
}