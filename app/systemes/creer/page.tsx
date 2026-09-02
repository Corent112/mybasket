import { requireAccess } from "@/lib/require-access";
import CreerSystemeClient from "./CreerSystemeClient";
import DeleteSystemButton from "./DeleteSystemButton";

export default async function CreerSystemePage() {
  await requireAccess("systemes");
  await requireAccess("plaquette");

  return (
    <>
      <CreerSystemeClient />
      <DeleteSystemButton />
    </>
  );
}
