import { redirect } from "next/navigation";
import { hasAllAccess } from "@/lib/access-batch";
import CreerSystemeClient from "./CreerSystemeClient";
import DeleteSystemButton from "./DeleteSystemButton";

export default async function CreerSystemePage() {
  const allowed = await hasAllAccess(["systemes", "plaquette"]);

  if (!allowed) {
    redirect("/abonnements");
  }

  return (
    <>
      <CreerSystemeClient />
      <DeleteSystemButton />
    </>
  );
}
