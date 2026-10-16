const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'lib/drawing-video-export.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = new Module(filename, module);
mod.filename = filename; mod.paths = Module._nodeModulePaths(root); mod._compile(compiled, filename);
const { drawingExportSize, finalizeDrawingMp4 } = mod.exports;
function atoms(buffer) {
  const result = []; let offset = 0;
  while (offset + 8 <= buffer.length) {
    let size = buffer.readUInt32BE(offset); const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (size === 1) size = Number(buffer.readBigUInt64BE(offset + 8));
    if (!size) size = buffer.length - offset;
    assert(size >= 8 && offset + size <= buffer.length);
    result.push(type); offset += size;
  }
  return result;
}
(async () => {
  assert.deepEqual(drawingExportSize(3001, 1801, 'hd'), { width: 1280, height: 768 });
  for (const quality of ['std', 'hd', 'fhd']) {
    const size = drawingExportSize(953, 701, quality);
    assert.equal(size.width % 2, 0); assert.equal(size.height % 2, 0);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawing-video-'));
  try {
    const input = path.join(dir, 'fragmented.mp4'); const output = path.join(dir, 'final.mp4');
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '1', '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p', '-movflags', 'frag_keyframe+empty_moov', input]);
    const original = fs.readFileSync(input);
    assert(atoms(original).includes('moof'));
    const result = await finalizeDrawingMp4(new Blob([original], { type: 'video/mp4' }));
    assert.equal(result.type, 'video/mp4');
    const bytes = Buffer.from(await result.arrayBuffer()); fs.writeFileSync(output, bytes);
    const boxes = atoms(bytes);
    assert(!boxes.includes('moof'), 'Output must not be fragmented');
    assert(boxes.indexOf('moov') < boxes.indexOf('mdat'), 'Index must precede video data');
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { encoding: 'utf8' }));
    assert.equal(probe.streams[0].codec_name, 'h264'); assert.equal(probe.streams[0].pix_fmt, 'yuv420p');
    assert.equal(probe.streams[0].width, 640); assert.equal(probe.streams[0].nb_frames, '30');
    assert(Number(probe.format.duration) >= 0.99 && Number(probe.format.duration) <= 1.1);
    execFileSync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-']);
    await assert.rejects(() => finalizeDrawingMp4(new Blob(['not a video'])));
    console.log('Drawing export: real fragmented H.264 finalized, fast-start MP4, duration, dimensions and decode verified.');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
