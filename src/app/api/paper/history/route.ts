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
      'SELECT * FROM "PaperTransaction" WHERE "userId" = $1 ORDER BY "createdAt" DESC',
      [user.userId]
    );
    const transactions = result.rows;

    return NextResponse.json(transactions);
  } catch (error: any) {
    console.error("[Paper History API] Error fetching transactions:", error);
    return NextResponse.json({ error: "Failed to fetch transaction history" }, { status: 500 });
  }
}
