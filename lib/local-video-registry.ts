import type { LocalMatchVideo } from "./local-match-project";

const videos = new Map<string, LocalMatchVideo>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

export const setLocalMatchVideo = (video: LocalMatchVideo) => {
  const current = videos.get(video.matchId);
  if (current?.url && current.url !== video.url) URL.revokeObjectURL(current.url);
  videos.set(video.matchId, video);
  notify();
};

export const getLocalMatchVideo = (matchId: string | null | undefined) =>
  matchId ? videos.get(String(matchId)) ?? null : null;

export const getLocalMatchVideoUrl = (matchId: string | null | undefined) =>
  getLocalMatchVideo(matchId)?.url ?? null;

export const removeLocalMatchVideo = (matchId: string) => {
  const current = videos.get(matchId);
  if (current?.url) URL.revokeObjectURL(current.url);
  videos.delete(matchId);
  notify();
};

export const subscribeLocalVideos = (listener: () => void) => {
  listeners.add(listener);

  // React useEffect attend une fonction de nettoyage qui retourne void.
  // Set.delete() retourne un boolean : on l'encapsule donc dans un bloc.
  return () => {
    listeners.delete(listener);
  };
};

export const connectedMatchIds = () => [...videos.keys()];
