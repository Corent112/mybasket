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
  const used=new Set<number>();
  const matches=new Set<string>();
  const compatible=(terminal:ScanTerminal,action:AiExerciseDiagram["actions"][number])=>{
    if(distance(action.to,terminal)>=.025)return false;
    if(terminal.kind==="bar")return action.action==="screen";
    if(action.action==="screen"||action.action==="freedraw")return false;
    if((terminal.styleConfidence??0)<.7)return true;
    return terminal.strokeStyle==="dashed"?action.action==="pass":terminal.strokeStyle==="wave"?action.action==="dribble":true;
  };
  for(const terminal of pending){
    const candidates=diagram.actions.map((action,index)=>({action,index})).filter(({action,index})=>!used.has(index)&&compatible(terminal,action));
    const match=candidates.find(({action})=>action.terminalId===terminal.id)??candidates.sort((a,b)=>distance(a.action.to,terminal)-distance(b.action.to,terminal))[0];
    if(match){used.add(match.index);matches.add(terminal.id);}
  }
  return pending.filter(terminal=>!matches.has(terminal.id));
}
