import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.userId;

    // Delete paper trading records in sequence
    const targets = ["PaperTrade", "PaperOrder", "PaperPosition", "PaperHolding", "PaperTransaction", "PaperAccount"];
    for (const table of targets) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("userId", userId);
      if (error) throw error;
    }

    return NextResponse.json({ message: "Paper trading data reset successfully" });
  } catch (error: any) {
    console.error("[Paper Reset API] Error resetting data:", error);
    return NextResponse.json({ error: "Failed to reset paper trading data" }, { status: 500 });
  }
}
