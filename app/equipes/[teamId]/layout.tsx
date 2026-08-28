import type {ReactNode} from "react";
import TeamUnifiedChrome from "@/components/workspace/TeamUnifiedChrome";

export default function TeamLayout({children}:{children:ReactNode}){
  return <TeamUnifiedChrome>{children}</TeamUnifiedChrome>;
}
