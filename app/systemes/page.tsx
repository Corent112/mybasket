import { Suspense } from "react";
import LibrarySessionCartPreview from "@/components/library/SessionCartPreview";
import SystemesClient from "./SystemesClient";

export default function Page() {
  return (
    <Suspense fallback={<main style={{ padding: 40 }}>Chargement...</main>}>
      <SystemesClient />
      <LibrarySessionCartPreview />
    </Suspense>
  );
}
