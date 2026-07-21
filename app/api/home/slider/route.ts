import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("admin_slider")
    .select("id,title,subtitle,image_url,button_label,button_href,sort_order")
    .eq("placement", "home")
    .eq("status", "active")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ slides: [] });
  }

  return NextResponse.json({ slides: data || [] });
}
