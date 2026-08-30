import VideoRootFolderCard from "@/components/video/VideoRootFolderCard";

export default function Page() {
  return (
    <main style={{ padding: "2rem 1.5rem 3rem", maxWidth: 1080, margin: "0 auto" }}>
      <h1 style={{ fontWeight: 900, fontSize: "2rem", marginBottom: "1.4rem" }}>
        Paramètres
      </h1>

      <VideoRootFolderCard />
    </main>
  );
}
