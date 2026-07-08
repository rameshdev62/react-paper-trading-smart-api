import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await query(
      'SELECT * FROM "PaperTrade" WHERE "userId" = $1 ORDER BY "tradeTime" DESC LIMIT 50',
      [user.userId]
    );
    const trades = result.rows;

    return NextResponse.json(trades);
  } catch (error: any) {
    console.error("[Paper Trades API] Error fetching trades:", error);
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}
