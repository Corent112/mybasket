import { useSyncExternalStore } from "react";
import { subscribeLocalVideos } from "@/lib/local-video-registry";

let version = 0;
subscribeLocalVideos(() => {
  version += 1;
});

export default function useLocalMatchVideoVersion() {
  return useSyncExternalStore(
    subscribeLocalVideos,
    () => version,
    () => 0,
  );
}
