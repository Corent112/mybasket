export type AiSessionScanExercise = {
  title: string;
  durationMinutes: number | null;
  explanation: string;
  instructions: string;
  variants: string;
  who: string;
  confidence: number;
};

export type AiSessionScan = {
  title: string;
  theme: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
  location: string;
  exercises: AiSessionScanExercise[];
  confidence: {
    text: number;
    structure: number;
  };
  warnings: string[];
};
