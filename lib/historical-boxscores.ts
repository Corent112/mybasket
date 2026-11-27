export const BOX_FIELDS = [
  ["pts", "Points"], ["p2m", "2 pts réussis"], ["p2a", "2 pts tentés"], ["p3m", "3 pts réussis"], ["p3a", "3 pts tentés"],
  ["ftm", "Lancers francs réussis"], ["fta", "Lancers francs tentés"], ["off_reb", "Rebonds offensifs"], ["def_reb", "Rebonds défensifs"],
  ["reb", "Rebonds totaux"], ["ast", "Passes décisives"], ["stl", "Interceptions"], ["blk", "Contres"], ["turnovers", "Ballons perdus"], ["pf", "FP"], ["plus_minus", "+/−"],
] as const;
export const EXTERNAL_BOX_FIELDS = [
  ["fgm", "Tirs réussis"], ["fga", "Tirs tentés"], ["fouls_drawn", "FPr"], ["eff", "Évaluation"],
] as const;
export const IMPORT_BOX_FIELDS = [...BOX_FIELDS, ...EXTERNAL_BOX_FIELDS] as const;
export const isSignedBoxField = (key: string) => key === "plus_minus" || key === "eff";
export type BoxField = typeof IMPORT_BOX_FIELDS[number][0];
export type ImportedBoxRow = { name: string; number: string; playerId: string; minutes: string; present?: boolean; starter?: boolean; stats: Partial<Record<BoxField, string>> };
export type ImportRosterPlayer = { id: string; name: string; number: number | null };
export const normalizeBoxText = (value: unknown) => String(value ?? "").normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const aliases: Record<string, BoxField> = {
 plusminus:"plus_minus",pm:"plus_minus",fgm:"fgm",fga:"fga",fpf:"fouls_drawn",foulsdrawn:"fouls_drawn",eff:"eff",eval:"eff",efficiency:"eff",
 pts:"pts",points:"pts",p2m:"p2m","2r":"p2m","2pm":"p2m","2ptm":"p2m",p2a:"p2a","2t":"p2a","2pa":"p2a","2pta":"p2a",
 p3m:"p3m","3r":"p3m","3pm":"p3m","3ptm":"p3m",p3a:"p3a","3t":"p3a","3pa":"p3a","3pta":"p3a",
 ftm:"ftm",lfr:"ftm",fta:"fta",lft:"fta",oreb:"off_reb",offreb:"off_reb",off:"off_reb",ro:"off_reb",dreb:"def_reb",defreb:"def_reb",def:"def_reb",rd:"def_reb",reb:"reb",rt:"reb",tot:"reb",
 ast:"ast",pd:"ast",assists:"ast",stl:"stl",st:"stl",int:"stl",interceptions:"stl",blk:"blk",bs:"blk","8s":"blk",ctr:"blk",to:"turnovers",tov:"turnovers",bp:"turnovers",turnovers:"turnovers",pf:"pf",f:"pf",fautes:"pf"
};

export function parseBoxTable(table: unknown[][]): ImportedBoxRow[] {
  const headerIndex=table.findIndex(row=>row.some(v=>["player","joueur","nom","name","nomprenom","fullname","playername","nomdujoueur"].includes(normalizeBoxText(v)))&&row.some(v=>normalizeBoxText(v)==="pts"||normalizeBoxText(v)==="points"));
  if(headerIndex<0)return [];
  const headers=table[headerIndex].map(value=>/^\s*\+\s*\/\s*[-−]\s*$/.test(String(value))?"plusminus":normalizeBoxText(value));
  return table.slice(headerIndex+1).flatMap(row=>{
    const get=(keys:string[])=>String(row[headers.findIndex(h=>keys.includes(h))]??"").trim();
    const name=get(["player","joueur","name","nomprenom","fullname","playername","nomdujoueur"]) || [get(["prenom","firstname"]),get(["nom","lastname"])].filter(Boolean).join(" ");
    if(!name||/^(totals?|totaux|equipe|team|coach|entraineur|opposition rebounds)(\b|$)/i.test(name))return [];
    const stats:ImportedBoxRow["stats"]={};
    headers.forEach((header,i)=>{
      const val=String(row[i]??"").trim()
        .replace(/\b[oO]+\b/g, () => "0")
        .replace(/^[(:]?(\d+)[):.]$/, "$1");
      if(aliases[header]&&(isSignedBoxField(aliases[header])?/^[+-]?\d+$/.test(val):/^\d+$/.test(val)))stats[aliases[header]]=val;
      const pairs:Record<string,[BoxField,BoxField]>={fgma:["fgm","fga"],"2pt":["p2m","p2a"],"2pts":["p2m","p2a"],"2p":["p2m","p2a"],"2pma":["p2m","p2a"],"2ptma":["p2m","p2a"],"3pt":["p3m","p3a"],"3pts":["p3m","p3a"],"3p":["p3m","p3a"],"3pma":["p3m","p3a"],"3ptma":["p3m","p3a"],lf:["ftm","fta"],ft:["ftm","fta"],ftma:["ftm","fta"]};
      const parts=val.match(/^(\d+)\s*[-/]\s*(\d+)$/);
      if(pairs[header]&&parts){const [made,attempted]=pairs[header];stats[made]=parts[1];stats[attempted]=parts[2];}
    });

    const minutes=get(["min","minutes","tempsdejeu","time","mp"]);
    const absent=/^(dnp|np|dnd|absent|nonjoue|nonjouee)$/.test(normalizeBoxText(minutes||get(["status","statut","presence"])));
    return [{name,number:get(["n","no","numero","num","number"]),playerId:"",minutes:absent?"":minutes,present:!absent,stats:completeBoxStats(stats)}];
  });
}

export function matchBoxPlayer(row: ImportedBoxRow, roster: ImportRosterPlayer[]): string {
  const words=(value:string)=>value.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase().match(/[a-z]+/g) ?? [];
  const name=words(row.name);
  if(!name.length)return "";
  const exact=roster.filter(p=>words(p.name).sort().join(" ")===name.slice().sort().join(" "));
  if(exact.length===1)return exact[0].id;
  const numberMatches=(p:ImportRosterPlayer)=>row.number.trim()!==""&&p.number!=null&&Number(row.number)===p.number;
  if(exact.length>1){
    const numbered=exact.filter(numberMatches);
    return numbered.length===1?numbered[0].id:"";
  }
  // A surname and an initial are common in external boxscores. Require the
  // jersey number as independent evidence and never match on number alone.
  const abbreviated=roster.filter(p=>{
    const full=words(p.name);
    return numberMatches(p)&&name.length===2&&full.length===2&&
      name.some((word,i)=>word.length>1&&full.includes(word)&&name[1-i].length===1&&full.some(other=>other!==word&&other.startsWith(name[1-i])));
  });
  return abbreviated.length===1?abbreviated[0].id:"";
}

export function suggestBoxPlayer(row: ImportedBoxRow, roster: ImportRosterPlayer[]): ImportRosterPlayer | undefined {
  const tokens = (name: string) => name.split(/\s+/).map(normalizeBoxText).filter(Boolean);
  const source = tokens(row.name);
  if (source.length < 2) return;
  const distance = (left: string, right: string) => {
    if (left === right) return 0;
    if (Math.abs(left.length - right.length) > 1 || Math.min(left.length, right.length) < 4) return 2;
    const [short, long] = left.length <= right.length ? [left, right] : [right, left];
    const index = [...short].findIndex((char, i) => char !== long[i]);
    if (index < 0) return 1;
    return short.slice(index + (short.length === long.length ? 1 : 0)) === long.slice(index + 1) ? 1 : 2;
  };
  const similar = roster.filter(player => {
    const candidate = tokens(player.name);
    if (candidate.length !== source.length) return false;
    const shared = source.filter(token => candidate.includes(token));
    if (!shared.length || shared.length !== source.length - 1) return false;
    return distance(source.find(token => !shared.includes(token)) ?? "", candidate.find(token => !shared.includes(token)) ?? "") === 1;
  });
  return similar.length === 1 ? similar[0] : undefined;
}

export function associateBoxRows(rows: ImportedBoxRow[], roster: ImportRosterPlayer[]): ImportedBoxRow[] {
  const mapped=rows.map(row=>({...row,playerId:matchBoxPlayer(row,roster)}));
  const counts=new Map<string,number>();
  for(const row of mapped)if(row.playerId)counts.set(row.playerId,(counts.get(row.playerId)??0)+1);
  return mapped.map(row=>counts.get(row.playerId)!>1?{...row,playerId:""}:row);
}

export function completeBoxStats(stats: ImportedBoxRow["stats"]): ImportedBoxRow["stats"] {
  const result={...stats};
  if(result.reb==null&&result.off_reb!=null&&result.def_reb!=null)result.reb=String(Number(result.off_reb)+Number(result.def_reb));
  if(result.pts==null&&result.p2m!=null&&result.p3m!=null&&result.ftm!=null)result.pts=String(2*Number(result.p2m)+3*Number(result.p3m)+Number(result.ftm));
  return result;
}

/** Repair one impossible shot pair only when the independent field-goal totals agree. */
export function reconcileBoxShotAttempts(stats: ImportedBoxRow["stats"]): ImportedBoxRow["stats"] {
  const { fgm, fga, p2m, p2a, p3m, p3a } = stats;
  if (![fgm, fga, p2m, p2a, p3m, p3a].every(value => value != null && /^\d+$/.test(value))) return stats;
  const totalMade = Number(fgm), totalAttempts = Number(fga);
  const twoMade = Number(p2m), twoAttempts = Number(p2a);
  const threeMade = Number(p3m), threeAttempts = Number(p3a);
  if (totalMade !== twoMade + threeMade || totalAttempts < totalMade) return stats;
  if (twoAttempts < twoMade && threeAttempts >= threeMade && totalAttempts - threeAttempts >= twoMade) {
    return { ...stats, p2a: String(totalAttempts - threeAttempts) };
  }
  if (threeAttempts < threeMade && twoAttempts >= twoMade && totalAttempts - twoAttempts >= threeMade) {
    return { ...stats, p3a: String(totalAttempts - twoAttempts) };
  }
  return stats;
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
export function parsePdfBoxPage(items: PdfBoxText[], lineTolerance = 2): ImportedBoxRow[][] {
  const lines: { y: number; cells: PdfBoxText[] }[] = [];
  for (const item of items.filter(item=>item.str.trim()).sort((a,b)=>b.y-a.y||a.x-b.x)) {
    const last=lines.at(-1);
    if(last&&Math.abs(last.y-item.y)<=lineTolerance)last.cells.push(item);
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
    if(cells.some(cell=>/^(totals?|totaux|team totals?|équipe|opposition rebounds)$/i.test(cell.str.trim()))){flush();continue;}
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
    const hasPoints = /^\d+$/.test(row[ptsIndex]);
    const hasShooting = row.filter(value => /^\d+\s*[-/]\s*\d+$/.test(value)).length >= 2;
    if(hasPoints || hasShooting || row.some(value=>/^(DNP|NP|DND|absent)$/i.test(String(value))))rows.push(row);
  }
  flush();
  return tables;
}
