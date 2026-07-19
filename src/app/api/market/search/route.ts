import { NextRequest, NextResponse } from "next/server";
import { searchInstruments } from "@/lib/instruments";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const queryStr = searchParams.get("query") || "";

    if (queryStr.trim().length < 2) {
      return NextResponse.json([]);
    }

    // Query our local CSV helper
    const instruments = await searchInstruments(queryStr, 10);

    return NextResponse.json(instruments);
  } catch (error: any) {
    console.error("[Market Search API] Error searching instruments:", error);
    return NextResponse.json({ error: "Failed to search instruments" }, { status: 500 });
  }
}
