import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "mybasket.fr",
    short_name: "mybasket.fr",
    description: "Les outils des coachs de basket",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fff8ef",
    theme_color: "#6b1a2c",
    icons: [
      { src: "/app-icons/mybasket-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icons/mybasket-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
