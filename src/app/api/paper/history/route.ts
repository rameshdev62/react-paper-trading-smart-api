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

    const { data: transactions, error } = await supabase
      .from("PaperTransaction")
      .select("*")
      .eq("userId", user.userId)
      .order("createdAt", { ascending: false });

    if (error) throw error;

    return NextResponse.json(transactions);
  } catch (error: any) {
    console.error("[Paper History API] Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transaction history" }, { status: 500 });
  }
}
