import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { createAccount } from "@/lib/paper/margin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accountRes = await query('SELECT * FROM "PaperAccount" WHERE "userId" = $1', [user.userId]);
    let account = accountRes.rows[0];
    if (!account) {
      account = await createAccount(user.userId);
    }

    const positionsRes = await query(
      'SELECT * FROM "PaperPosition" WHERE "userId" = $1 AND "netQty" <> 0',
      [user.userId]
    );
    const positions = positionsRes.rows;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const tradesRes = await query(
      'SELECT * FROM "PaperTrade" WHERE "userId" = $1 AND "tradeTime" >= $2 ORDER BY "tradeTime" DESC',
      [user.userId, todayStart]
    );
    const todaysTrades = tradesRes.rows;

    const ordersRes = await query(
      'SELECT * FROM "PaperOrder" WHERE "userId" = $1 AND status IN (\'PENDING\', \'OPEN\') ORDER BY "createdAt" DESC',
      [user.userId]
    );
    const openOrders = ordersRes.rows;

    return NextResponse.json({
      account,
      positions,
      todaysTrades,
      openOrders,
    });
  } catch (error: any) {
    console.error("[Paper Dashboard API] Error loading dashboard:", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
