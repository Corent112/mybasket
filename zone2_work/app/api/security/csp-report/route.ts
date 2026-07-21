import { NextResponse } from "next/server";
import { logSecurityEvent } from "@/lib/security/audit";
import { getClientIp } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get("user-agent");

  let body: unknown = null;

  try {
    body = await request.json();
  } catch {
    body = null;
  }

  await logSecurityEvent({
    type: "csp_report",
    ip,
    userAgent,
    metadata: { body },
  });

  return NextResponse.json({ ok: true });
}
