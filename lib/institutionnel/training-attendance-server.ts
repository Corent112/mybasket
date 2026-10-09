import sharp from "sharp";
export async function normalizeAttendanceSignature(signature:unknown){
 if(typeof signature!=="string"||signature.length>150000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature))throw new Error("Signature PNG invalide");
 const buffer=Buffer.from(signature.split(",")[1],"base64");
 if(!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error("Format PNG requis");
 const image=await sharp(buffer,{limitInputPixels:1000000}).resize(800,300,{fit:"inside",withoutEnlargement:true}).flatten({background:"white"}).png().toBuffer();
 return `data:image/png;base64,${image.toString("base64")}`;
}
export async function updateAttendanceRecord(db:any,existing:any,payload:any){
 let query=db.from("training_candidate_attendance").update(payload).eq("id",existing.id);
 query=existing.updated_at?query.eq("updated_at",existing.updated_at):(existing.notes==null?query.is("notes",null):query.eq("notes",existing.notes));
 query=existing.status==null?query.is("status",null):query.eq("status",existing.status);
 const result=await query.select("id").maybeSingle();
 if(result.error)throw new Error(result.error.message);
 if(!result.data)throw new Error("La présence a été modifiée entre-temps. Actualisez puis réessayez.");
}
