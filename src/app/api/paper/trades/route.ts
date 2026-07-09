import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: trades, error } = await supabase
      .from("PaperTrade")
      .select("*")
      .eq("userId", user.userId)
      .order("tradeTime", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json(trades);
  } catch (error: any) {
    console.error("[Paper Trades API] Error fetching trades:", error);
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}
