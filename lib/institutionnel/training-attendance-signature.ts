export type AttendanceSignature = {image: string; signedAt: string; recordedBy: string};
export function readAttendanceSignature(notes?: string | null): AttendanceSignature | null {
  try {const value=JSON.parse(notes||"");const signature=value?.mybasketAttendanceSignature;return typeof signature?.image==="string"&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature.image)&&typeof signature.signedAt==="string"?signature:null;}catch{return null;}
}
export function withAttendanceSignature(notes: string | null | undefined, signature: AttendanceSignature) {
  let original=notes||"";
  try {const value=JSON.parse(original);if(value?.mybasketAttendanceSignature)original=String(value.notes||"");}catch{}
  return JSON.stringify({notes:original,mybasketAttendanceSignature:signature});
}
export const ATTENDANCE_LABELS: Record<string,string>={unknown:"À renseigner",present:"Présent",absent:"Absent",excused:"Excusé",late:"Retard"};

export function withoutAttendanceSignature(notes: string | null | undefined): string {
  try {
    const value=JSON.parse(notes||"");
    if(!value||typeof value!=="object"||Array.isArray(value)||!("mybasketAttendanceSignature" in value))return notes||"";
    delete value.mybasketAttendanceSignature;
    return Object.keys(value).length===1&&typeof value.notes==="string"?value.notes:JSON.stringify(value);
  }catch{return notes||"";}
}
