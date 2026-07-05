import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const trades = await prisma.paperTrade.findMany({
      where: { userId: user.userId },
      orderBy: { tradeTime: "desc" },
      take: 50,
    });

    return NextResponse.json(trades);
  } catch (error: any) {
    console.error("[Paper Trades API] Error fetching trades:", error);
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 });
  }
}
