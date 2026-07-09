import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const queryStr = searchParams.get("query") || "";

    if (queryStr.trim().length < 2) {
      return NextResponse.json([]);
    }

    // Query our cached Instrument Master table
    const { data: instruments, error } = await supabase
      .from("Instrument")
      .select("*")
      .or(`symbol.ilike.%${queryStr}%,name.ilike.%${queryStr}%`)
      .limit(10);

    if (error) throw error;

    return NextResponse.json(instruments);
  } catch (error: any) {
    console.error("[Market Search API] Error searching instruments:", error);
    return NextResponse.json({ error: "Failed to search instruments" }, { status: 500 });
  }
}
