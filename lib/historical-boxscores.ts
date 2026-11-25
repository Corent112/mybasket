export const BOX_FIELDS = [
  ["pts", "PTS"], ["p2m", "2R"], ["p2a", "2T"], ["p3m", "3R"], ["p3a", "3T"],
  ["ftm", "LFR"], ["fta", "LFT"], ["off_reb", "RO"], ["def_reb", "RD"],
  ["reb", "RT"], ["ast", "PD"], ["stl", "INT"], ["blk", "CTR"], ["turnovers", "BP"], ["pf", "F"], ["plus_minus", "+/−"],
] as const;
export type BoxField = typeof BOX_FIELDS[number][0];
export type ImportedBoxRow = { name: string; number: string; playerId: string; minutes: string; present?: boolean; stats: Partial<Record<BoxField, string>> };
export type ImportRosterPlayer = { id: string; name: string; number: number | null };
export const normalizeBoxText = (value: unknown) => String(value ?? "").normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const aliases: Record<string, BoxField> = {
 plusminus:"plus_minus",pm:"plus_minus",
 pts:"pts",points:"pts",p2m:"p2m","2r":"p2m","2pm":"p2m","2ptm":"p2m",p2a:"p2a","2t":"p2a","2pa":"p2a","2pta":"p2a",
 p3m:"p3m","3r":"p3m","3pm":"p3m","3ptm":"p3m",p3a:"p3a","3t":"p3a","3pa":"p3a","3pta":"p3a",
 ftm:"ftm",lfr:"ftm",fta:"fta",lft:"fta",oreb:"off_reb",offreb:"off_reb",off:"off_reb",ro:"off_reb",dreb:"def_reb",defreb:"def_reb",def:"def_reb",rd:"def_reb",reb:"reb",rt:"reb",tot:"reb",
 ast:"ast",pd:"ast",assists:"ast",stl:"stl",st:"stl",int:"stl",interceptions:"stl",blk:"blk",bs:"blk",ctr:"blk",to:"turnovers",tov:"turnovers",bp:"turnovers",turnovers:"turnovers",pf:"pf",f:"pf",fautes:"pf"
};

export function parseBoxTable(table: unknown[][]): ImportedBoxRow[] {
  const headerIndex=table.findIndex(row=>row.some(v=>["player","joueur","nom","name","nomprenom","fullname","playername","nomdujoueur"].includes(normalizeBoxText(v)))&&row.some(v=>normalizeBoxText(v)==="pts"||normalizeBoxText(v)==="points"));
  if(headerIndex<0)return [];
  const headers=table[headerIndex].map(value=>/^\s*\+\s*\/\s*[-−]\s*$/.test(String(value))?"plusminus":normalizeBoxText(value));
  return table.slice(headerIndex+1).flatMap(row=>{
    const get=(keys:string[])=>String(row[headers.findIndex(h=>keys.includes(h))]??"").trim();
    const name=get(["player","joueur","name","nomprenom","fullname","playername","nomdujoueur"]) || [get(["prenom","firstname"]),get(["nom","lastname"])].filter(Boolean).join(" ");
    if(!name||/^(total|totaux|equipe|team|coach|entraineur)(\b|$)/i.test(name))return [];
    const stats:ImportedBoxRow["stats"]={};
    headers.forEach((header,i)=>{
      const val=String(row[i]??"").trim();
      if(aliases[header]&&(header==="plusminus"||header==="pm"?/^[+-]?\d+$/.test(val):/^\d+$/.test(val)))stats[aliases[header]]=val;
      const pairs:Record<string,[BoxField,BoxField]>={"2pt":["p2m","p2a"],"2pts":["p2m","p2a"],"2p":["p2m","p2a"],"2pma":["p2m","p2a"],"2ptma":["p2m","p2a"],"3pt":["p3m","p3a"],"3pts":["p3m","p3a"],"3p":["p3m","p3a"],"3pma":["p3m","p3a"],"3ptma":["p3m","p3a"],lf:["ftm","fta"],ft:["ftm","fta"],ftma:["ftm","fta"]};
      const parts=val.match(/^(\d+)\s*[-/]\s*(\d+)$/);
      if(pairs[header]&&parts){const [made,attempted]=pairs[header];stats[made]=parts[1];stats[attempted]=parts[2];}
    });
    if(stats.reb==null&&stats.off_reb!=null&&stats.def_reb!=null)stats.reb=String(Number(stats.off_reb)+Number(stats.def_reb));
    const minutes=get(["min","minutes","tempsdejeu","time","mp"]);
    const absent=/^(dnp|np|dnd|absent|nonjoue|nonjouee)$/.test(normalizeBoxText(minutes||get(["status","statut","presence"])));
    return [{name,number:get(["n","no","numero","num","number"]),playerId:"",minutes:absent?"":minutes,present:!absent,stats}];
  });
}

export function matchBoxPlayer(row: ImportedBoxRow, roster: ImportRosterPlayer[]): string {
  const words=(v:string)=>v.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().match(/[a-z0-9]+/g)?.sort().join(" ");
  const names=roster.filter(p=>words(p.name)===words(row.name));
  if(names.length===1)return names[0].id;
  // Shirt numbers can change between matches, so the number alone is never sufficient.
  const matching=names.filter(p=>row.number!==""&&String(p.number)===row.number);
  return matching.length===1?matching[0].id:"";
}

export function parseBoxMinutes(value: string): number | null {
  const input=value.trim();
  if(!input)return null;
  const excelTime=input.match(/^0:(\d{2}):([0-5]\d)$/);
  if(excelTime)return Number(excelTime[1])*60+Number(excelTime[2]);
  const mmss=input.match(/^(\d{1,2}):([0-5]\d)$/);
  const seconds=mmss?Number(mmss[1])*60+Number(mmss[2]):/^\d{1,2}(?:[.,]\d+)?$/.test(input)?Math.round(Number(input.replace(",","."))*60):NaN;
  if(!Number.isFinite(seconds)||seconds<0||seconds>5999)throw new Error("Temps de jeu invalide. Utilise MM:SS ou des minutes.");
  return seconds;
}
export function formatBoxMinutes(seconds: number | null): string {
  return seconds==null?"":`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
}

type PdfBoxText = { str: string; x: number; y: number; width: number };
/** Recover cells from the PDF coordinates, rather than flattening the page into prose. */
export function parsePdfBoxPage(items: PdfBoxText[]): ImportedBoxRow[][] {
  const lines: { y: number; cells: PdfBoxText[] }[] = [];
  for (const item of items.filter(item=>item.str.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)) {
    const last=lines.at(-1);
    if(last&&Math.abs(last.y-item.y)<=2)last.cells.push(item);
    else lines.push({y:item.y,cells:[item]});
  }
  const tables: ImportedBoxRow[][]=[];
  let columns: PdfBoxText[]=[];
  let rows: unknown[][]=[];
  const flush=()=>{
    const parsed=parseBoxTable(rows);
    if(parsed.length)tables.push(parsed);
    rows=[];columns=[];
  };
  for(const line of lines) {
    const cells=line.cells.sort((a,b)=>a.x-b.x);
    const names=cells.map(cell=>normalizeBoxText(cell.str));
    if(names.some(name=>["player","joueur","nom","name","nomprenom","fullname","playername","nomdujoueur"].includes(name))
      &&names.some(name=>["pts","points"].includes(name))){
      flush();columns=cells;rows=[cells.map(cell=>cell.str)];continue;
    }
    if(!columns.length)continue;
    if(cells.some(cell=>/^(total|totaux|team total|équipe)$/i.test(cell.str.trim()))){flush();continue;}
    const row=columns.map(()=>"");
    for(const cell of cells){
      const nameColumn=columns.findIndex(c=>["player","joueur","nom","name","nomprenom","fullname","playername","nomdujoueur"].includes(normalizeBoxText(c.str)));
      const mid=cell.x+cell.width/2;
      const next=columns[nameColumn+1];
      // A name is usually left-aligned in a wide column; numeric cells are centered.
      const index=nameColumn>=0&&next&&cell.x>=columns[nameColumn].x-5&&mid<next.x-3
        ? nameColumn
        : columns.reduce((best,column,i)=>Math.abs(column.x+column.width/2-mid)<Math.abs(columns[best].x+columns[best].width/2-mid)?i:best,0);
      row[index]=[row[index],cell.str.trim()].filter(Boolean).join(" ");
    }
    const ptsIndex=columns.findIndex(column=>["pts","points"].includes(normalizeBoxText(column.str)));
    if(/^\d+$/.test(row[ptsIndex]))rows.push(row);
  }
  flush();
  return tables;
}
