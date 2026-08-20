export type AiShootingGridResult = {
  sourceSpot: string;
  matchedRowId: string | null;
  made: number | null;
  attempted: number | null;
  confidence: number;
};

export type AiShootingGridPlayer = {
  sourceName: string;
  matchedPlayerId: string | null;
  matchConfidence: number;
  results: AiShootingGridResult[];
};

export type AiShootingGridImport = {
  sessionDate: string | null;
  notes: string;
  players: AiShootingGridPlayer[];
  confidence: {
    text: number;
    mapping: number;
  };
  warnings: string[];
};

export type ShootingGridImportDraft = AiShootingGridImport;
