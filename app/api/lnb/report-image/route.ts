const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!/^\/images\/Basketball\/(Team|Person)\/\d+\/(logoBlack|logoWhite|photo)\/(sm|md|lg|or)\.(png|jpe?g|webp)$/i.test(path)) {
    return new Response(null, { status: 400 });
  }
  try {
    const image = await fetch(`https://assets.altrstat.xyz${path}`, { redirect: "error", signal: AbortSignal.timeout(5000) });
    const type = image.headers.get("content-type")?.split(";")[0] || "";
    if (!image.ok || !["image/png", "image/jpeg", "image/webp"].includes(type)
      || !image.body || Number(image.headers.get("content-length")) > MAX_BYTES) {
      return new Response(null, { status: 404 });
    }
    const reader = image.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    return new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
