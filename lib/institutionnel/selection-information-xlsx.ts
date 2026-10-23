import {orderInformationPlayers} from './selection-information';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';
/** Add a true XLSX cell fill while keeping SheetJS date formats and values intact. */
export function highlightInformationWorkbook(bytes:Uint8Array,watchedRows:number[]){
 const files=unzipSync(bytes),path='xl/styles.xml';let styles=strFromU8(files[path]);
 const fills=styles.match(/<fills\b([^>]*)>([\s\S]*?)<\/fills>/),xfs=styles.match(/<cellXfs\b([^>]*)>([\s\S]*?)<\/cellXfs>/);if(!fills||!xfs)throw Error('Styles Excel indisponibles.');
 const fillId=Number(fills[1].match(/count="(\d+)"/)?.[1]||0),base=(xfs[2].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)||[]);
 const nowrap=(xf:string)=>{if(xf.includes('<alignment'))return xf.replace(/<alignment\b([^>]*?)\s*\/>/,(_,attrs)=>`<alignment ${attrs.replace(/\b(?:wrapText|shrinkToFit)="[^"]*"/g,'')} wrapText="0" shrinkToFit="1"/>`);return xf.endsWith('/>')?xf.slice(0,-2)+'><alignment wrapText="0" shrinkToFit="1"/></xf>':xf.replace('</xf>','<alignment wrapText="0" shrinkToFit="1"/></xf>');};
 const originals=base.map(nowrap),green=originals.map(xf=>xf.replace(/\bfillId="\d+"/,`fillId="${fillId}"`).replace(/\bapplyFill="[^"]*"/g,'').replace('<xf ','<xf applyFill="1" '));
 styles=styles.replace(fills[0],`<fills count="${fillId+1}">${fills[2]}<fill><patternFill patternType="solid"><fgColor rgb="FFE5F3E8"/><bgColor indexed="64"/></patternFill></fill></fills>`).replace(xfs[0],`<cellXfs count="${originals.length+green.length}">${originals.join('')}${green.join('')}</cellXfs>`);files[path]=strToU8(styles);
 const watch=new Set(watchedRows);let sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
 sheet=sheet.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g,(whole,attrs,body)=>{const row=Number(attrs.match(/\br="(\d+)"/)?.[1]);if(!watch.has(row))return whole;return `<row${attrs}>${body.replace(/<c\b[^>]*>/g,(cell:string)=>{const id=Number(cell.match(/\bs="(\d+)"/)?.[1]||0);return cell.includes(' s=')?cell.replace(/\bs="\d+"/,`s="${originals.length+id}"`):cell.replace('<c ',`<c s="${originals.length+id}" `);})}</row>`;});
 sheet=sheet.replace('</worksheet>','<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>');files['xl/worksheets/sheet1.xml']=strToU8(sheet);return zipSync(files);
}
export function downloadInformationWorkbook(xlsx:typeof import('xlsx'),book:import('xlsx').WorkBook,watchIds:string[],players:any[]){
 const raw=new Uint8Array(xlsx.write(book,{type:'array',bookType:'xlsx',cellDates:true})),rows=orderInformationPlayers(players,watchIds).flatMap((player,index)=>watchIds.includes(String(player.id))?[index+6]:[]),bytes=highlightInformationWorkbook(raw,rows);
 const buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download='fiche-renseignements-selection.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
