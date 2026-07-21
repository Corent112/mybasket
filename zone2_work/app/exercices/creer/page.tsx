import { requireAccess } from "@/lib/require-access";
import CreerExerciceClient from "./CreerExerciceClient";

export default async function CreerExercicePage() {
  await requireAccess("exercices");

  return <CreerExerciceClient />;
}