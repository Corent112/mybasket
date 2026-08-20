"use client";

import { useEffect, useReducer } from "react";
import { subscribeLocalVideos } from "@/lib/local-video-registry";

/** Force un re-render des composants quand la vidéo locale liée à un match change. */
export default function useLocalMatchVideoVersion() {
  const [version, bump] = useReducer((value: number) => value + 1, 0);

  useEffect(() => subscribeLocalVideos(() => bump()), []);

  return version;
}
