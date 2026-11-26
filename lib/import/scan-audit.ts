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
  const pending=diagram.scanAudit.terminals.filter(terminal=>!diagram.scanAudit?.dismissed?.includes(terminal.id));

  const compatible=(terminal:ScanTerminal,action:AiExerciseDiagram["actions"][number])=>{
    if(distance(action.to,terminal)>=.025)return false;
    if(terminal.kind==="bar")return action.action==="screen";
    if(action.action==="screen"||action.action==="freedraw")return false;
    if((terminal.styleConfidence??0)<.7)return true;
    return terminal.strokeStyle==="dashed"?action.action==="pass":terminal.strokeStyle==="wave"?action.action==="dribble":true;
  };
  const candidates = pending.map(terminal => diagram.actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => compatible(terminal, action))
    .sort((a, b) => Number(b.action.terminalId === terminal.id) - Number(a.action.terminalId === terminal.id)
      || distance(a.action.to, terminal) - distance(b.action.to, terminal))
    .map(({ index }) => index));
  const assigned = new Map<number, number>();
  function match(terminalIndex: number, visited: Set<number>): boolean {
    for (const index of candidates[terminalIndex]) {
      if (visited.has(index)) continue;
      visited.add(index);
      const holder = assigned.get(index);
      if (holder === undefined || match(holder, visited)) {
        assigned.set(index, terminalIndex);
        return true;
      }
    }
    return false;
  }
  return pending.filter((_, index) => !match(index, new Set()));
}
