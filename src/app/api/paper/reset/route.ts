import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = user.userId;

    const dbClient = await pool.connect();
    try {
      await dbClient.query("BEGIN");
      await dbClient.query('DELETE FROM "PaperTrade" WHERE "userId" = $1', [userId]);
      await dbClient.query('DELETE FROM "PaperOrder" WHERE "userId" = $1', [userId]);
      await dbClient.query('DELETE FROM "PaperPosition" WHERE "userId" = $1', [userId]);
      await dbClient.query('DELETE FROM "PaperHolding" WHERE "userId" = $1', [userId]);
      await dbClient.query('DELETE FROM "PaperTransaction" WHERE "userId" = $1', [userId]);
      await dbClient.query('DELETE FROM "PaperAccount" WHERE "userId" = $1', [userId]);
      await dbClient.query("COMMIT");
    } catch (txError) {
      await dbClient.query("ROLLBACK");
      throw txError;
    } finally {
      dbClient.release();
    }

    return NextResponse.json({ message: "Paper trading data reset successfully" });
  } catch (error: any) {
    console.error("[Paper Reset API] Error resetting data:", error);
    return NextResponse.json({ error: "Failed to reset paper trading data" }, { status: 500 });
  }
}
