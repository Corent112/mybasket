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
export async function downloadInformationWorkbook(xlsx:typeof import('xlsx'),book:import('xlsx').WorkBook,watchIds:string[],players:any[],logoUrl?:string|null){
 const raw=new Uint8Array(xlsx.write(book,{type:'array',bookType:'xlsx',cellDates:true})),rows=orderInformationPlayers(players,watchIds).flatMap((player,index)=>watchIds.includes(String(player.id))?[index+6]:[]),styled=highlightInformationWorkbook(raw,rows);
 let bytes:Uint8Array=formatInformationWorkbook(styled);if(logoUrl){const {imageData}=await import('./trombinoscope-pdf');const data=await imageData(logoUrl);if(!data)throw Error('Le logo de l’institution ne peut pas être chargé. Réessaie.');const {jsPDF}=await import('jspdf'),props=new jsPDF().getImageProperties(data),jpeg=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));bytes=embedInformationLogo(bytes,jpeg,props.width,props.height);}
 const buffer=new ArrayBuffer(bytes.length);new Uint8Array(buffer).set(bytes);const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),link=document.createElement('a');link.href=url;link.download='fiche-renseignements-selection.xlsx';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}


/** Embed the actual institution logo in the workbook, not a link to a remote image. */
export function embedInformationLogo(bytes:Uint8Array,jpeg:Uint8Array,width:number,height:number){
 const files=unzipSync(bytes),ns='http://schemas.openxmlformats.org/package/2006/relationships';
 files['xl/media/institution-logo.jpeg']=new Uint8Array(jpeg);
 const ratio=Math.min(110/width,90/height),cx=Math.round(width*ratio*9525),cy=Math.round(height*ratio*9525);
 files['xl/drawings/institution-logo.xml']=strToU8(`<?xml version="1.0" encoding="UTF-8"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>47625</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>47625</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo institution"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
 files['xl/drawings/_rels/institution-logo.xml.rels']=strToU8(`<Relationships xmlns="${ns}"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/institution-logo.jpeg"/></Relationships>`);
 const relPath='xl/worksheets/_rels/sheet1.xml.rels',relation='<Relationship Id="institutionLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/institution-logo.xml"/>';
 files[relPath]=strToU8(files[relPath]?strFromU8(files[relPath]).replace('</Relationships>',relation+'</Relationships>'):`<Relationships xmlns="${ns}">${relation}</Relationships>`);
 files['xl/worksheets/sheet1.xml']=strToU8(strFromU8(files['xl/worksheets/sheet1.xml']).replace('</worksheet>','<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="institutionLogo"/></worksheet>'));
 let types=strFromU8(files['[Content_Types].xml']);if(!types.includes('Extension="jpeg"'))types=types.replace('</Types>','<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');types=types.replace('</Types>','<Override PartName="/xl/drawings/institution-logo.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');files['[Content_Types].xml']=strToU8(types);return zipSync(files);
}

export function formatInformationWorkbook(bytes:Uint8Array){
 const files=unzipSync(bytes);let styles=strFromU8(files['xl/styles.xml']);
 const xfs=styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)!,base=xfs[1].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)||[];
 const fonts=styles.match(/<fonts\b[^>]*>([\s\S]*?)<\/fonts>/)!,fontId=(fonts[1].match(/<font>/g)||[]).length;
 styles=styles.replace(fonts[0],`<fonts count="${fontId+1}">${fonts[1]}<font><b/><sz val="11"/><color rgb="FF701B32"/><name val="Arial"/></font></fonts>`);
 const fills=styles.match(/<fills\b[^>]*>([\s\S]*?)<\/fills>/)!,fillId=(fills[1].match(/<fill>/g)||[]).length;
 styles=styles.replace(fills[0],`<fills count="${fillId+1}">${fills[1]}<fill><patternFill patternType="solid"><fgColor rgb="FFDEDEDE"/><bgColor indexed="64"/></patternFill></fill></fills>`);
 const borders=styles.match(/<borders\b[^>]*>([\s\S]*?)<\/borders>/)!,borderId=(borders[1].match(/<border(?:\s[^>]*)?>/g)||[]).length;
 styles=styles.replace(borders[0],`<borders count="${borderId+1}">${borders[1]}<border>${['left','right','top','bottom'].map(side=>`<${side} style="thin"><color rgb="FFBFC1C5"/></${side}>`).join('')}<diagonal/></border></borders>`);
 const grids=base.map(xf=>xf.replace(/borderId="\d+"/,`borderId="${borderId}"`).replace('<xf ','<xf applyBorder="1" '));
 const headings=base.map(xf=>xf.replace(/fontId="\d+"/,`fontId="${fontId}"`).replace(/fillId="\d+"/,`fillId="${fillId}"`).replace(/borderId="\d+"/,`borderId="${borderId}"`).replace(/applyFill="[^"]*"/g,'').replace('<xf ','<xf applyFont="1" applyBorder="1" applyFill="1" '));
 styles=styles.replace(xfs[0],`<cellXfs count="${base.length*3}">${base.join('')}${grids.join('')}${headings.join('')}</cellXfs>`);files['xl/styles.xml']=strToU8(styles);
 let sheet=strFromU8(files['xl/worksheets/sheet1.xml']);sheet=sheet.replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g,(whole,attrs,body)=>{const row=Number(attrs.match(/\br="(\d+)"/)?.[1]);if(row<5)return whole;return `<row${attrs}>${body.replace(/<c\b[^>]*>/g,(cell:string)=>{const id=Number(cell.match(/\bs="(\d+)"/)?.[1]||0),next=id+base.length*(row===5?2:1);return cell.includes(' s=')?cell.replace(/\bs="\d+"/,`s="${next}"`):cell.replace('<c ',`<c s="${next}" `);})}</row>`;});
 if(!sheet.includes('<sheetPr'))sheet=sheet.replace(/(<worksheet\b[^>]*>)/,'$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
 files['xl/worksheets/sheet1.xml']=strToU8(sheet);return zipSync(files);
}
