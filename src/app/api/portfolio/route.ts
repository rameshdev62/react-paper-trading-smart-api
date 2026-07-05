import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { priceStore } from "@/lib/priceStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user details
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { balance: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch holdings
    const holdings = await prisma.holding.findMany({
      where: { userId: user.userId },
    });

    // Fetch portfolio history log (last 30 logs for charts)
    const history = await prisma.portfolioHistory.findMany({
      where: { userId: user.userId },
      orderBy: { timestamp: "asc" },
      take: 50,
    });

    let totalHoldingsCost = 0;
    let totalHoldingsValue = 0;

    const holdingsWithLtp = holdings.map((h) => {
      const priceInfo = priceStore.getPrice(h.token);
      const ltp = priceInfo ? priceInfo.ltp : h.averagePrice;
      const currentVal = h.quantity * ltp;
      const costBasis = h.quantity * h.averagePrice;
      const unrealizedPl = currentVal - costBasis;
      const plPercentage = h.averagePrice > 0 ? (unrealizedPl / costBasis) * 100 : 0.0;

      totalHoldingsCost += costBasis;
      totalHoldingsValue += currentVal;

      return {
        id: h.id,
        symbol: h.symbol,
        token: h.token,
        exchange: h.exchange,
        quantity: h.quantity,
        averagePrice: h.averagePrice,
        ltp,
        currentValue: parseFloat(currentVal.toFixed(2)),
        costBasis: parseFloat(costBasis.toFixed(2)),
        unrealizedPl: parseFloat(unrealizedPl.toFixed(2)),
        plPercentage: parseFloat(plPercentage.toFixed(2)),
      };
    });

    const totalPortfolioValue = dbUser.balance + totalHoldingsValue;
    const totalUnrealizedPl = totalHoldingsValue - totalHoldingsCost;
    const overallPlPercentage = totalHoldingsCost > 0 ? (totalUnrealizedPl / totalHoldingsCost) * 100 : 0.0;

    return NextResponse.json({
      cashBalance: dbUser.balance,
      totalPortfolioValue: parseFloat(totalPortfolioValue.toFixed(2)),
      totalHoldingsCost: parseFloat(totalHoldingsCost.toFixed(2)),
      totalHoldingsValue: parseFloat(totalHoldingsValue.toFixed(2)),
      totalUnrealizedPl: parseFloat(totalUnrealizedPl.toFixed(2)),
      overallPlPercentage: parseFloat(overallPlPercentage.toFixed(2)),
      holdings: holdingsWithLtp,
      history,
    });
  } catch (error: any) {
    console.error("[Portfolio API] Error retrieving portfolio details:", error);
    return NextResponse.json({ error: "Failed to load portfolio details" }, { status: 500 });
  }
}
