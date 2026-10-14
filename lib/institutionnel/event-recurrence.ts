export type EventRecurrence = { frequency:'none'|'daily'|'weekly'|'monthly'; endMode:'count'|'until'; count:number; until:string; weekdays:number[] };
export const MAX_EVENT_DATES=500;
const DAY=86400000;
function date(value:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Choisis une date valide.');const parsed=new Date(`${value}T00:00:00Z`);if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw new Error('Choisis une date valide.');return parsed;}
export function shiftEventDate(value:string,days:number){return new Date(date(value).getTime()+days*DAY).toISOString().slice(0,10);}
export function defaultEventRecurrence(start:string):EventRecurrence{return {frequency:'none',endMode:'count',count:10,until:shiftEventDate(start,30),weekdays:[date(start).getUTCDay()]};}
export function buildEventOccurrenceDates(start:string,recurrence:EventRecurrence):string[]{
 const first=date(start);if(recurrence.frequency==='none')return [start];
 const count=recurrence.endMode==='count'?recurrence.count:MAX_EVENT_DATES+1;
 if(recurrence.endMode==='count'&&(!Number.isInteger(count)||count<1||count>MAX_EVENT_DATES))throw new Error(`Choisis entre 1 et ${MAX_EVENT_DATES} événements.`);
 const last=recurrence.endMode==='until'?date(recurrence.until):null;
 if(last&&last<first)throw new Error('La fin de répétition doit être après la date de début.');
 const weekdays=new Set(recurrence.weekdays.filter(day=>Number.isInteger(day)&&day>=0&&day<=6));
 if(recurrence.frequency==='weekly'&&!weekdays.size)throw new Error('Coche au moins un jour de la semaine.');
 const dates:string[]=[];
 for(let cursor=new Date(first),scanned=0;scanned<60000;cursor=new Date(cursor.getTime()+DAY),scanned++){
  if(last&&cursor>last)break;
  const matches=recurrence.frequency==='daily'||(recurrence.frequency==='weekly'&&weekdays.has(cursor.getUTCDay()))||(recurrence.frequency==='monthly'&&cursor.getUTCDate()===first.getUTCDate());
  if(matches){dates.push(cursor.toISOString().slice(0,10));if(dates.length>MAX_EVENT_DATES)throw new Error(`Limite de ${MAX_EVENT_DATES} événements : raccourcis la période.`);if(recurrence.endMode==='count'&&dates.length===count)break;}
 }
 if(!dates.length)throw new Error('Aucune date ne correspond aux jours choisis dans cette période.');
 if(recurrence.endMode==='count'&&dates.length!==count)throw new Error('Période de répétition trop longue.');
 return dates;
}
export function buildEventCalendarDates(start:string,end:string,recurrence:EventRecurrence):string[]{
 const days=Math.round((date(end).getTime()-date(start).getTime())/DAY)+1;
 if(days<1)throw new Error('La date de fin doit être après la date de début.');
 if(days>MAX_EVENT_DATES)throw new Error(`Limite de ${MAX_EVENT_DATES} journées à la fois.`);
 const settings=recurrence.frequency!=='none'&&recurrence.endMode==='until'?{...recurrence,until:shiftEventDate(recurrence.until,-days+1)}:recurrence;
 const dates=new Set<string>();
 for(const beginning of buildEventOccurrenceDates(start,settings)){for(let offset=0;offset<days;offset++){dates.add(shiftEventDate(beginning,offset));if(dates.size>MAX_EVENT_DATES)throw new Error(`Limite de ${MAX_EVENT_DATES} journées : réduis la répétition.`);}}
 return [...dates].sort();
}
