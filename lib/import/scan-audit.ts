import type { AiExerciseDiagram, AiPoint } from './types';
export type ScanTerminal = AiPoint & { id: string; kind: 'arrow'|'bar'; confidence: number; strokeStyle?: 'dashed'|'wave'|'solid'|'unknown'; styleConfidence?: number };
export type DiagramScanAudit = {
  version: 'mybasket-diagram-v1';
  sourceCorners?: AiPoint[];
  terminals: ScanTerminal[];
  dismissed?: string[];
  passes: number;
  warnings: string[];
  failure?: import("../ai/diagram-assistant/errors").DiagramDiagnostic;
};
const distance=(a:AiPoint,b:AiPoint)=>Math.hypot(a.x-b.x,(a.y-b.y)*1.4);
/** Recomputed after every edit/deletion: a missing line cannot disappear from the audit. */
export function unresolvedScanTerminals(diagram: AiExerciseDiagram | undefined): ScanTerminal[] {
  if(!diagram?.scanAudit)return [];
  return diagram.scanAudit.terminals.filter(terminal=>!diagram.scanAudit?.dismissed?.includes(terminal.id)
    && !diagram.actions.some(action=>distance(action.to,terminal)<.025 && (
      action.terminalId===terminal.id || (terminal.kind==='bar'?action.action==='screen':action.action!=='screen'&&action.action!=='freedraw')
    )))??[];
}
