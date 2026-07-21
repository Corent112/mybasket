import { NextRequest, NextResponse } from "next/server";
export async function POST(req: NextRequest) {
  const { exportUrl, recipient, channel, title } = await req.json();
  if (!exportUrl) return NextResponse.json({ error: "MP4 indisponible" }, { status: 400 });
  const message = `${title || "Montage MyBasket"} - ${exportUrl}`;
  if (channel === "email") return NextResponse.json({ url: `mailto:${encodeURIComponent(recipient || "")}?subject=${encodeURIComponent(title || "Montage MyBasket")}&body=${encodeURIComponent(message)}` });
  if (channel === "whatsapp") return NextResponse.json({ url: `https://wa.me/${String(recipient || "").replace(/\D/g, "")}?text=${encodeURIComponent(message)}` });
  return NextResponse.json({ url: exportUrl });
}
