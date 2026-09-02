import { Suspense } from "react";
import SystemesWorkspace from "./SystemesWorkspace";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 40 }}>
          Chargement...
        </main>
      }
    >
      <SystemesWorkspace />
    </Suspense>
  );
}
