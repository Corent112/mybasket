import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import { getDocumentProxy, extractTextItems } from "unpdf";
import { parseBoxTable, parsePdfBoxPage, matchBoxPlayer, associateBoxRows, completeBoxStats, parseBoxMinutes } from "../lib/historical-boxscores.ts";

const headers=["N°","Joueur","MIN","PTS","2 PTS","3PT","LF","RO","RD","PD","INT","CTR","BP","F","+/-"];
const line=["4","Désirat Étienne","20:23","15","3/5","2/5","3/4","2","4","3","1","0","2","2","-3"];
const rows=parseBoxTable([headers,line,["5","Absent Joueur","DNP"],["","TOTAL","","15"]]);
assert.equal(rows.length,2);
const csv=[headers,line].map(row=>row.join(";")).join("\n");
const book=XLSX.read(csv,{type:"string",raw:true});
const csvRows=parseBoxTable(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,raw:false,defval:""}));
assert.equal(csvRows[0].stats.p2m,"3");
assert.equal(csvRows[0].minutes,"20:23");
assert.equal(rows[0].stats.p2a,"5");
assert.equal(rows[0].stats.p3m,"2");
assert.equal(rows[0].stats.reb,"6");
assert.equal(rows[0].stats.plus_minus,"-3");
assert.equal(rows[1].present,false);
assert.equal(matchBoxPlayer(rows[0],[{id:"id",name:"Etienne Desirat",number:4}]),"id");
assert.equal(matchBoxPlayer(rows[0],[{id:"other",name:"Autre Joueur",number:4}]),"");
const roster=[{id:"id",name:"Etienne Desirat",number:4},{id:"other",name:"Eric Desirat",number:8}];
assert.equal(matchBoxPlayer({...rows[0],name:"Désirat E."},roster),"id");
assert.equal(matchBoxPlayer({...rows[0],name:"Désirat E.",number:""},roster),"");
assert.deepEqual(associateBoxRows([rows[0],rows[0]],roster).map(row=>row.playerId),["",""]);
assert.equal(completeBoxStats({p2m:"3",p3m:"2",ftm:"3"}).pts,"15");
assert.equal(completeBoxStats({p2m:"3",p3m:"2"}).pts,undefined);
assert.equal(parseBoxMinutes("20:23"),1223);
assert.equal(parseBoxMinutes(""),null);
assert.equal(parseBoxMinutes("0"),0);
assert.equal(parseBoxMinutes("0:20:23"),1223);
assert.throws(()=>parseBoxMinutes("20:99"));

const pdf=new jsPDF({orientation:"landscape"});
const positions=[10,25,80,100,120,140,160,180,200,220,240,250,260,270,280];
pdf.setFontSize(9);
headers.forEach((value,i)=>pdf.text(value,positions[i],20));
line.forEach((value,i)=>pdf.text(value,positions[i],28));
pdf.text("TOTAL",25,36);
const proxy=await getDocumentProxy(new Uint8Array(pdf.output("arraybuffer")));
try {
  const {items}=await extractTextItems(proxy);
  const tables=parsePdfBoxPage(items[0]);
  assert.equal(tables.length,1);
  assert.equal(tables[0].length,1);
  assert.equal(tables[0][0].name,"Désirat Étienne");
  assert.equal(tables[0][0].stats.p2m,"3");
  assert.equal(tables[0][0].stats.ast,"3");
  assert.equal(tables[0][0].stats.plus_minus,"-3");
} finally {
  await proxy.loadingTask.destroy();
}
console.log("Historical boxscore CSV-style rows, PDF coordinates, player matching, DNP and minutes passed.");
