import type { AiExerciseDiagram } from './types';
export type ReviewSnapshot={diagrams:AiExerciseDiagram[];current:number};
export type ReviewHistory={present:ReviewSnapshot;past:ReviewSnapshot[];future:ReviewSnapshot[];group:number|null};
export type ReviewHistoryAction={type:'edit';change:(diagrams:AiExerciseDiagram[])=>AiExerciseDiagram[];group:number|null}|{type:'phase';index:number}|{type:'undo'|'redo'};
export function initialReviewHistory(diagrams:AiExerciseDiagram[],current=0):ReviewHistory{return{present:{diagrams,current:Math.min(current,Math.max(0,diagrams.length-1))},past:[],future:[],group:null}}
/** A drag is one edit, even if it emits hundreds of pointer moves. */
export function reviewHistoryReducer(state:ReviewHistory,action:ReviewHistoryAction):ReviewHistory{
 if(action.type==='phase')return{...state,present:{...state.present,current:Math.max(0,Math.min(action.index,state.present.diagrams.length-1))}};
 if(action.type==='undo'){const target=state.past.at(-1);return target?{present:target,past:state.past.slice(0,-1),future:[state.present,...state.future],group:null}:state}
 if(action.type==='redo'){const target=state.future[0];return target?{present:target,past:[...state.past,state.present].slice(-50),future:state.future.slice(1),group:null}:state}
 if(action.type!=='edit')return state;
 const diagrams=action.change(state.present.diagrams);
 if(diagrams===state.present.diagrams||(diagrams.length===state.present.diagrams.length&&diagrams.every((row,index)=>row===state.present.diagrams[index])))return state;
 return{present:{diagrams,current:Math.min(state.present.current,Math.max(0,diagrams.length-1))},past:action.group!==null&&action.group===state.group?state.past:[...state.past,state.present].slice(-50),future:[],group:action.group};
}
