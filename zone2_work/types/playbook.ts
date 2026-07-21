export type CourtType = "half" | "full";

export type PlayerStyle =
  | "circle"
  | "square"
  | "defense"
  | "ball"
  | "coach";

export type DrawAction =
  | "select"
  | "move"
  | "pass"
  | "screen"
  | "cut"
  | "dribble"
  | "shoot"
  | "giveball";

export type MiscTool =
  | "text"
  | "cone"
  | "zone"
  | "erase"
  | "triangle"
  | "square"
  | "circle"
  | "handoff"
  | "freedraw"
  | null;

export type EditorAction = DrawAction;
export type EditorMisc = MiscTool;

export type PlacedPlayer = {
  id: string;
  style: PlayerStyle;
  label: string;
  x: number;
  y: number;
  color: string;
};

export type Phase = {
  id: string;
  players: PlacedPlayer[];
  strokes: string[];
};

export type Play = {
  id: string;
  title: string;
  courtType: CourtType;
  phases: Phase[];
  currentPhase: number;
  createdAt?: string;
  updatedAt: string;
};

export type EditorState = {
  title: string;
  courtType: CourtType;
  phases: Phase[];
  currentPhase: number;
  activeAction: EditorAction;
  activeMisc: EditorMisc;
  selectedColor: string;
};

export const DEFAULT_EDITOR: EditorState = {
  title: "Nouvelle plaquette",
  courtType: "half",
  phases: [
    {
      id: "phase-1",
      players: [],
      strokes: [],
    },
  ],
  currentPhase: 0,
  activeAction: "select",
  activeMisc: null,
  selectedColor: "#6B1A2C",
};
