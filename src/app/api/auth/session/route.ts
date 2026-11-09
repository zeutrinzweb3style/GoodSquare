import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ data: { authenticated: false, profile: null } });
  }

  const supabase = createServiceRoleClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("address", session.sub)
    .maybeSingle();

  return NextResponse.json({
    data: { authenticated: true, address: session.sub, profile: profile ?? null },
  });
}
