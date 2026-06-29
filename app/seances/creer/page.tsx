import { Suspense } from "react";
import CreerSeanceClient from "./CreerSeanceClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CreerSeanceClient />
    </Suspense>
  );
}