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

    const account = await prisma.paperAccount.findUnique({
      where: { userId: user.userId },
    });

    const positions = await prisma.paperPosition.findMany({
      where: { userId: user.userId, netQty: { not: 0 } },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaysTrades = await prisma.paperTrade.findMany({
      where: {
        userId: user.userId,
        tradeTime: { gte: todayStart },
      },
      orderBy: { tradeTime: "desc" },
    });

    const openOrders = await prisma.paperOrder.findMany({
      where: {
        userId: user.userId,
        status: { in: ["PENDING", "OPEN"] },
      },
      orderBy: { createdAt: "desc" },
    });

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
