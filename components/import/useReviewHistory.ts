'use client';
import { useCallback,useReducer,useRef } from 'react';
import type { AiExerciseDiagram } from '@/lib/import/types';
import { initialReviewHistory,reviewHistoryReducer } from '@/lib/import/review-history';
export function useReviewHistory(initial:AiExerciseDiagram[],index:number){
 const[state,dispatch]=useReducer(reviewHistoryReducer,undefined,()=>initialReviewHistory(initial,index));
 const group=useRef<number|null>(null),sequence=useRef(0);
 const setDiagrams=useCallback((change:(rows:AiExerciseDiagram[])=>AiExerciseDiagram[])=>dispatch({type:'edit',change,group:group.current}),[]);
 const beginGesture=useCallback(()=>{group.current=++sequence.current},[]),endGesture=useCallback(()=>{group.current=null},[]);
 return{diagrams:state.present.diagrams,current:state.present.current,setDiagrams,setCurrent:(index:number)=>dispatch({type:'phase',index}),canUndo:state.past.length>0,canRedo:state.future.length>0,undo:()=>dispatch({type:'undo'}),redo:()=>dispatch({type:'redo'}),beginGesture,endGesture};
}
