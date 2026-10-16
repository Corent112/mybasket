import { BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, ALL_FORMATS } from 'mediabunny';

/** Finalize browser recordings as a regular, seekable H.264 MP4 (not fragmented MP4). */
export async function finalizeDrawingMp4(recording: Blob): Promise<Blob> {
  const input = new Input({ source: new BlobSource(recording), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('Aucune image enregistrée. Relancez l’export.');
    // AVC is copied losslessly when already present; other codecs must be converted.
    const conversion = await Conversion.init({ input, output, video: { codec: 'avc' }, audio: { discard: true } });
    if (!conversion.isValid || conversion.discardedTracks.some(track => track.track === video)) {
      throw new Error('Ce navigateur ne peut pas créer le MP4 H.264. Essayez avec Chrome ou Safari à jour.');
    }
    await conversion.execute();
    if (!target.buffer?.byteLength) throw new Error('Le fichier vidéo est vide. Relancez l’export.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
    input.dispose();
  }
}

export function drawingExportSize(width: number, height: number, quality: 'std' | 'hd' | 'fhd') {
  const longEdge = quality === 'fhd' ? 1920 : quality === 'hd' ? 1280 : 854;
  const scale = Math.min(1, longEdge / Math.max(width, height));
  return { width: Math.max(2, Math.round(width * scale / 2) * 2), height: Math.max(2, Math.round(height * scale / 2) * 2) };
}
