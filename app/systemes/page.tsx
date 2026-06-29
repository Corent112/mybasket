import { Suspense } from "react";
import SystemesClient from "./SystemesClient";

export default function Page() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 40 }}>
          Chargement...
        </main>
      }
    >
      <SystemesClient />
    </Suspense>
  );
}