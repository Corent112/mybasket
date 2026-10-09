export type AttendanceSignature = {image: string; signedAt: string; recordedBy: string};
export type AttendancePhoneLink = {hash:string;expiresAt:string;issuedBy:string;usedAt?:string};
export function attendanceMetadata(notes?:string|null):Record<string,any>{
 try{const value=JSON.parse(notes||"");if(value&&typeof value==="object"&&!Array.isArray(value)&&(typeof value.notes==="string"||value.mybasketAttendanceSignature||value.mybasketAttendancePhone||value.mybasketAttendancePrevious))return value;}catch{}
 return {notes:notes||""};
}
export function readAttendanceSignature(notes?: string | null): AttendanceSignature | null {
 const signature=attendanceMetadata(notes).mybasketAttendanceSignature;
 return typeof signature?.image==="string"&&/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature.image)&&typeof signature.signedAt==="string"?signature:null;
}
export function withAttendanceSignature(notes:string|null|undefined,signature:AttendanceSignature){return JSON.stringify({...attendanceMetadata(notes),mybasketAttendanceSignature:signature});}
export function withoutAttendanceSignature(notes:string|null|undefined):string{const value=attendanceMetadata(notes);delete value.mybasketAttendanceSignature;return JSON.stringify(value);}
export function saveAttendancePrevious(notes:string|null|undefined,status:string){const value=attendanceMetadata(notes);value.mybasketAttendancePrevious={status,signature:readAttendanceSignature(notes)};delete value.mybasketAttendancePhone;return JSON.stringify(value);}
export const ATTENDANCE_LABELS:Record<string,string>={unknown:"À renseigner",present:"Présent",absent:"Absent",excused:"Excusé",late:"Retard"};
