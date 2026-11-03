// Same-tab fallback for drawing transfers when persistent browser storage is full/blocked.
// The original values remain readable by legacy screens whenever localStorage works.
const keyFor=(key:string)=>`mybasket:drawing-session:${key}`;
export const drawingSessionStorage={
 getItem(key:string):string|null{
  if(typeof window==='undefined')return null;
  try{const raw=window.sessionStorage.getItem(keyFor(key));if(raw!==null){const value=JSON.parse(raw);if(value===null||typeof value==='string')return value;}}catch{}
  try{return window.localStorage.getItem(key)}catch{return null}
 },
 setItem(key:string,value:string){
  if(typeof window==='undefined')throw Error('Stockage du dessin indisponible');
  const text=String(value);
  try{window.localStorage.setItem(key,text);window.sessionStorage.removeItem(keyFor(key));return;}catch{}
  window.sessionStorage.setItem(keyFor(key),JSON.stringify(text));
 },
 removeItem(key:string){
  if(typeof window==='undefined')return;
  try{window.localStorage.removeItem(key);window.sessionStorage.removeItem(keyFor(key));return;}catch{}
  try{window.sessionStorage.setItem(keyFor(key),'null')}catch{}
 }
};
