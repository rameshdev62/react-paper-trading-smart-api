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

    const userId = user.userId;

    // Fetch all required data in parallel
    const [dbUser, orders, holdings, history] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { balance: true } }),
      prisma.order.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      prisma.holding.findMany({ where: { userId } }),
      prisma.portfolioHistory.findMany({ where: { userId }, orderBy: { timestamp: "asc" } }),
    ]);

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Win/Loss Statistics ──────────────────────────────────────────────
    const completedSells = orders.filter(
      (o) => o.status === "COMPLETED" && o.transactionType === "SELL"
    );
    const completedBuys = orders.filter(
      (o) => o.status === "COMPLETED" && o.transactionType === "BUY"
    );

    // Build a map of average buy price per symbol from completed buys
    const buyMap: Record<string, { totalCost: number; totalQty: number }> = {};
    for (const buy of completedBuys) {
      const key = `${buy.symbol}:${buy.exchange}`;
      if (!buyMap[key]) buyMap[key] = { totalCost: 0, totalQty: 0 };
      buyMap[key].totalCost += buy.price * buy.quantity;
      buyMap[key].totalQty += buy.quantity;
    }

    let wins = 0;
    let losses = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;
    let totalRealizedPl = 0;

    for (const sell of completedSells) {
      const key = `${sell.symbol}:${sell.exchange}`;
      const buyInfo = buyMap[key];
      const avgBuyPrice = buyInfo && buyInfo.totalQty > 0 ? buyInfo.totalCost / buyInfo.totalQty : 0;
      const pl = (sell.price - avgBuyPrice) * sell.quantity;
      totalRealizedPl += pl;

      if (pl >= 0) {
        wins++;
        totalWinAmount += pl;
      } else {
        losses++;
        totalLossAmount += Math.abs(pl);
      }
    }

    const totalTrades = completedSells.length + completedBuys.length;
    const winRate = completedSells.length > 0 ? (wins / completedSells.length) * 100 : 0;
    const avgWin = wins > 0 ? totalWinAmount / wins : 0;
    const avgLoss = losses > 0 ? totalLossAmount / losses : 0;
    const profitFactor = totalLossAmount > 0 ? totalWinAmount / totalLossAmount : totalWinAmount > 0 ? Infinity : 0;

    // ─── Unrealized P&L from holdings ─────────────────────────────────────
    let totalUnrealizedPl = 0;
    let totalHoldingsValue = 0;
    let totalHoldingsCost = 0;

    const holdingsBreakdown = holdings.map((h) => {
      const priceInfo = priceStore.getPrice(h.token);
      const ltp = priceInfo ? priceInfo.ltp : h.averagePrice;
      const currentValue = h.quantity * ltp;
      const costBasis = h.quantity * h.averagePrice;
      const unrealizedPl = currentValue - costBasis;
      const plPercent = costBasis > 0 ? (unrealizedPl / costBasis) * 100 : 0;

      totalUnrealizedPl += unrealizedPl;
      totalHoldingsValue += currentValue;
      totalHoldingsCost += costBasis;

      return {
        symbol: h.symbol,
        exchange: h.exchange,
        quantity: h.quantity,
        averagePrice: h.averagePrice,
        ltp,
        currentValue: parseFloat(currentValue.toFixed(2)),
        costBasis: parseFloat(costBasis.toFixed(2)),
        unrealizedPl: parseFloat(unrealizedPl.toFixed(2)),
        plPercent: parseFloat(plPercent.toFixed(2)),
      };
    });

    // Sort for top performers
    const sortedHoldings = [...holdingsBreakdown].sort((a, b) => b.plPercent - a.plPercent);
    const topPerformers = sortedHoldings.slice(0, 3);
    const worstPerformers = sortedHoldings.slice(-3).reverse();

    // ─── Holdings allocation (pie chart) ─────────────────────────────────
    const totalPortfolioValue = dbUser.balance + totalHoldingsValue;
    const allocation: Array<{ symbol: string; value: number; percent: number }> = holdingsBreakdown.map((h) => ({
      symbol: h.symbol,
      value: h.currentValue,
      percent: totalPortfolioValue > 0 ? parseFloat(((h.currentValue / totalPortfolioValue) * 100).toFixed(2)) : 0,
    }));

    // Add cash as a slice
    const cashPercent = totalPortfolioValue > 0 ? parseFloat(((dbUser.balance / totalPortfolioValue) * 100).toFixed(2)) : 100;
    allocation.push({
      symbol: "Cash",
      value: parseFloat(dbUser.balance.toFixed(2)),
      percent: cashPercent,
    });

    // ─── Equity Curve ────────────────────────────────────────────────────
    const equityCurve = history.map((h) => ({
      timestamp: h.timestamp,
      totalValue: parseFloat(h.totalValue.toFixed(2)),
      cashBalance: parseFloat(h.cashBalance.toFixed(2)),
    }));

    // ─── Daily P&L (bar chart) ───────────────────────────────────────────
    const dailyPl: Record<string, number> = {};
    for (const sell of completedSells) {
      if (!sell.completedAt) continue;
      const day = new Date(sell.completedAt).toISOString().split("T")[0];
      const key = `${sell.symbol}:${sell.exchange}`;
      const buyInfo = buyMap[key];
      const avgBuyPrice = buyInfo && buyInfo.totalQty > 0 ? buyInfo.totalCost / buyInfo.totalQty : 0;
      const pl = (sell.price - avgBuyPrice) * sell.quantity;
      dailyPl[day] = (dailyPl[day] || 0) + pl;
    }

    const dailyPlArray = Object.entries(dailyPl)
      .map(([date, pnl]) => ({ date, pnl: parseFloat(pnl.toFixed(2)) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ─── Orders for CSV export ───────────────────────────────────────────
    const ordersForExport = orders.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      exchange: o.exchange,
      transactionType: o.transactionType,
      orderType: o.orderType,
      productType: o.productType,
      quantity: o.quantity,
      price: o.price,
      status: o.status,
      rejectReason: o.rejectReason || "",
      createdAt: o.createdAt,
      completedAt: o.completedAt || "",
    }));

    return NextResponse.json({
      winLoss: {
        totalTrades,
        totalSells: completedSells.length,
        wins,
        losses,
        winRate: parseFloat(winRate.toFixed(2)),
        avgWin: parseFloat(avgWin.toFixed(2)),
        avgLoss: parseFloat(avgLoss.toFixed(2)),
        profitFactor: profitFactor === Infinity ? "∞" : parseFloat((profitFactor as number).toFixed(2)),
      },
      pnl: {
        totalRealizedPl: parseFloat(totalRealizedPl.toFixed(2)),
        totalUnrealizedPl: parseFloat(totalUnrealizedPl.toFixed(2)),
        netPl: parseFloat((totalRealizedPl + totalUnrealizedPl).toFixed(2)),
      },
      equityCurve,
      dailyPl: dailyPlArray,
      allocation,
      topPerformers,
      worstPerformers,
      ordersForExport,
    });
  } catch (error: any) {
    console.error("[Analytics API] Error:", error);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
