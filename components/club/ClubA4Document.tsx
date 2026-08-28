"use client";
import type {ReactNode} from "react";
export default function ClubA4Document({title,subtitle,children,onClose}:{title:string;subtitle?:string;children:ReactNode;onClose?:()=>void}){
 return <div className="a4screen"><div className="bar">{onClose&&<button onClick={onClose}>Retour</button>}<button onClick={()=>window.print()}>Imprimer / Enregistrer PDF</button></div><article className="a4"><header><strong>MYBASKET</strong><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></header><main>{children}</main><footer>MyBasket · document club</footer></article><style jsx global>{`
 .a4screen{background:#eee;padding:16px;min-height:100vh}.bar{width:min(210mm,100%);margin:0 auto 10px;display:flex;justify-content:flex-end;gap:8px}.bar button{border:0;background:#6b1a2c;color:#fff;border-radius:8px;padding:9px 12px;font-weight:800}
 .a4{box-sizing:border-box;width:210mm;min-height:297mm;margin:auto;background:#fff;padding:12mm 13mm;color:#231d1f;font-family:Roboto,Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column}.a4>header{display:flex;justify-content:space-between;gap:10mm;border-bottom:2px solid #6b1a2c;padding-bottom:4mm;margin-bottom:5mm}.a4>header strong{color:#6b1a2c}.a4 h1{font-size:18pt;margin:0}.a4 header p{font-size:8.5pt;margin:1mm 0 0}.a4 main{flex:1;min-width:0}.a4>footer{border-top:1px solid #ddd;margin-top:5mm;padding-top:2.5mm;font-size:7pt;color:#777}
 .a4 table{width:100%!important;max-width:100%!important;border-collapse:collapse;table-layout:fixed;font-size:8pt}.a4 th,.a4 td{border:1px solid #ccc;padding:2mm;vertical-align:top;overflow-wrap:anywhere;word-wrap:break-word}.a4 thead{display:table-header-group}.a4 tr{break-inside:avoid;page-break-inside:avoid}.a4 img,.a4 svg{max-width:100%!important;height:auto}.a4 *{box-sizing:border-box}
 @page{size:A4 portrait;margin:0}
 @media print{body{background:white!important}.a4screen{padding:0;background:white}.bar{display:none!important}.a4{width:210mm;min-height:297mm;margin:0;padding:12mm 13mm;overflow:visible}.a4 table{page-break-inside:auto}.a4 thead{display:table-header-group}.a4 tr{page-break-inside:avoid}}
 `}</style></div>
}
