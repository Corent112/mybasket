import { Suspense } from "react";
import CreerExerciceClient from "./CreerExerciceClient";

export default function CreerExercicePage() {
  return (
    <Suspense fallback={null}>
      <CreerExerciceClient />
    </Suspense>
  );
}
