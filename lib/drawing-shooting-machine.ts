export type MachineObject = { id:string; kind:string; x:number; y:number; ballCount?:number; infiniteBalls?:boolean; collectsShots?:boolean };
export type MachineAction = { action:string; sourceMachineId?:string; targetMachineId?:string; returnMachineId?:string };
export function machineBallCount(machine: MachineObject) {
  const value = machine.ballCount ?? 10;
  return Number.isFinite(value) ? Math.max(0, Math.min(999, Math.round(value))) : 10;
}
export function machineReserves(objects: MachineObject[], actions: MachineAction[]) {
  const reserves = Object.fromEntries(objects.filter(o=>o.kind==='shootingMachine').map(o=>[o.id,machineBallCount(o)]));
  const unlimited = new Set(objects.filter(o=>o.infiniteBalls).map(o=>o.id));
  for(const action of actions) {
    if(action.sourceMachineId && action.sourceMachineId in reserves && !unlimited.has(action.sourceMachineId)) reserves[action.sourceMachineId]=Math.max(0,reserves[action.sourceMachineId]-1);
    const receiver = action.action==='shoot' ? action.returnMachineId : action.targetMachineId;
    if(receiver && receiver in reserves && !unlimited.has(receiver)) reserves[receiver]=Math.min(999,reserves[receiver]+1);
  }
  return reserves;
}
export function collectorForBasket(objects: MachineObject[], basket:{x:number;y:number}) {
  return objects.filter(o=>o.kind==='shootingMachine'&&o.collectsShots!==false&&Math.hypot(o.x-basket.x,o.y-basket.y)<=0.18).sort((a,b)=>Math.hypot(a.x-basket.x,a.y-basket.y)-Math.hypot(b.x-basket.x,b.y-basket.y))[0];
}
// Canvas-native symbol: exports and offline drawing do not require a loaded image.
export function drawShootingMachine(ctx:CanvasRenderingContext2D,s:number,count:number,color='#6B1A2C') {
  ctx.lineWidth=Math.max(1,s*.10);ctx.strokeStyle='#343434';ctx.fillStyle='#ffffff';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(-s*1.45,-s*1.5);ctx.lineTo(s*1.45,-s*1.5);ctx.lineTo(s*.7,s*.1);ctx.lineTo(-s*.7,s*.1);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.save();ctx.clip();ctx.strokeStyle='#9a9a9a';ctx.lineWidth=Math.max(.6,s*.04);
  for(let i=-5;i<=5;i++){ctx.beginPath();ctx.moveTo(i*s*.35,-s*1.5);ctx.lineTo(i*s*.2,s*.15);ctx.stroke();ctx.beginPath();ctx.moveTo(-s*1.5,i*s*.30);ctx.lineTo(s*1.5,i*s*.30);ctx.stroke();}ctx.restore();
  ctx.fillStyle=color;ctx.strokeStyle='#343434';ctx.beginPath();ctx.roundRect(-s*.85,-s*.05,s*1.7,s*1.35,s*.22);ctx.fill();ctx.stroke();
  for(const x of [-.7,.7]){ctx.fillStyle='#292929';ctx.beginPath();ctx.arc(x*s,s*1.45,s*.22,0,Math.PI*2);ctx.fill();}
  for(let i=0;i<Math.min(3,count);i++){ctx.fillStyle='#ec8744';ctx.strokeStyle='#5b3520';ctx.beginPath();ctx.arc((i-1)*s*.48,-s*.2,s*.24,0,Math.PI*2);ctx.fill();ctx.stroke();}
  ctx.strokeStyle='#D4A24C';ctx.lineWidth=Math.max(1.5,s*.12);ctx.beginPath();ctx.moveTo(0,s*.8);ctx.lineTo(0,s*1.95);ctx.moveTo(-s*.28,s*1.65);ctx.lineTo(0,s*1.95);ctx.lineTo(s*.28,s*1.65);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(9,Math.round(s*.65))}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(count===Infinity?'∞':String(count),0,s*.46);
}
