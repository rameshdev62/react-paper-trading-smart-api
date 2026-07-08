import { NextRequest, NextResponse } from "next/server";
import { query as dbQuery } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const queryStr = searchParams.get("query") || "";

    if (queryStr.trim().length < 2) {
      return NextResponse.json([]);
    }

    // Query our cached Instrument Master table
    const result = await dbQuery(
      'SELECT * FROM "Instrument" WHERE symbol ILIKE $1 OR name ILIKE $2 LIMIT 10',
      [`%${queryStr}%`, `%${queryStr}%`]
    );
    const instruments = result.rows;

    return NextResponse.json(instruments);
  } catch (error: any) {
    console.error("[Market Search API] Error searching instruments:", error);
    return NextResponse.json({ error: "Failed to search instruments" }, { status: 500 });
  }
}
