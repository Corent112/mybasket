import { NextResponse } from "next/server";

const SOURCE =
  "https://media.istockphoto.com/id/1479094313/fr/vectoriel/syst%C3%A8me-musculaire-corps-humain-anatomie-masculine-athletyc-fitness-trainig-gym-workout.jpg?s=612x612&w=0&k=20&c=wWpSyCpOKr-K1pHfoq9XX4zPlETaf1qylvhlBbQgk-s%3D";

export async function GET() {
  const response = await fetch(SOURCE, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    next: { revalidate: 86400 },
  });

  if (!response.ok) {
    return new NextResponse("Image indisponible", { status: 502 });
  }

  return new NextResponse(await response.arrayBuffer(), {
    headers: {
      "Content-Type": response.headers.get("content-type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
