/** Read photos as attachments, in the order chosen in the file picker. */
export async function readAttachedImages(files: File[], room: number) {
  const images = files.filter(file => /^image\/(jpeg|png|webp|gif|avif)$/i.test(file.type));
  const selected = images.slice(0, Math.max(0, room));
  const settled = await Promise.allSettled(selected.map(file => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject();
    reader.onerror = reader.onabort = () => reject();
    reader.readAsDataURL(file);
  })));
  const attached = settled.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  const warnings = [
    ...(files.length > images.length ? ["Formats acceptés : JPG, PNG, WebP, GIF et AVIF."] : []),
    ...(images.length > selected.length ? ["La fiche peut contenir 5 images jointes au maximum."] : []),
    ...(attached.length < selected.length ? ["Certaines images n’ont pas pu être lues."] : []),
  ];
  return { attached, warnings };
}
