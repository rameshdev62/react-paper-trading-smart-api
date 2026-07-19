import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestClient } from "@/lib/db";
import { priceStore } from "@/lib/priceStore";
import { cookies } from "next/headers";
import { fetchShoonyaLimits, fetchShoonyaHoldings } from "@/lib/shoonya";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get("mode") || "mock";

    if (mode === "live") {
      const cookieStore = await cookies();
      const cookieVal = cookieStore.get("shoonya_session")?.value;
      let session: any = null;
      if (cookieVal) {
        try {
          session = JSON.parse(cookieVal);
        } catch {}
      }

      const headerAccessToken = req.headers.get("x-shoonya-access-token");
      const headerUserId = req.headers.get("x-shoonya-user-id");
      const headerAccountId = req.headers.get("x-shoonya-account-id");

      if (headerAccessToken && headerUserId && headerAccountId) {
        session = {
          accessToken: headerAccessToken,
          userId: headerUserId,
          accountId: headerAccountId,
        };
      }

      if (!session || !session.accessToken) {
        return NextResponse.json({ error: "Shoonya session not connected" }, { status: 401 });
      }

      const supabase = await getRequestClient();
      const [userRes, holdingsRes] = await Promise.all([
        supabase.from("User").select("balance").eq("id", user.userId).limit(1),
        supabase.from("Holding").select("*").eq("userId", user.userId),
      ]);

      if (userRes.error) throw userRes.error;
      if (holdingsRes.error) throw holdingsRes.error;

      const dbUser = userRes.data?.[0];
      const cashBalance = dbUser ? dbUser.balance : 1000000.0;
      const rawHoldings = holdingsRes.data || [];
      let totalHoldingsCost = 0;
      let totalHoldingsValue = 0;

      const holdings = rawHoldings.map((h: any) => {
        const quantity = h.quantity;
        const averagePrice = h.averagePrice;
        
        const priceInfo = priceStore.getPrice(h.token);
        const ltp = priceInfo ? priceInfo.ltp : averagePrice;
        const currentVal = quantity * ltp;
        const costBasis = quantity * averagePrice;
        const unrealizedPl = currentVal - costBasis;
        const plPercentage = averagePrice > 0 ? (unrealizedPl / costBasis) * 100 : 0.0;

        totalHoldingsCost += costBasis;
        totalHoldingsValue += currentVal;

        return {
          id: h.id,
          symbol: h.symbol,
          token: h.token || "",
          exchange: h.exchange || "NSE",
          quantity,
          averagePrice,
          ltp,
          currentValue: parseFloat(currentVal.toFixed(2)),
          costBasis: parseFloat(costBasis.toFixed(2)),
          unrealizedPl: parseFloat(unrealizedPl.toFixed(2)),
          plPercentage: parseFloat(plPercentage.toFixed(2)),
        };
      });

      const totalPortfolioValue = cashBalance + totalHoldingsValue;
      const totalUnrealizedPl = totalHoldingsValue - totalHoldingsCost;
      const overallPlPercentage = totalHoldingsCost > 0 ? (totalUnrealizedPl / totalHoldingsCost) * 100 : 0.0;

      return NextResponse.json({
        cashBalance,
        totalPortfolioValue: parseFloat(totalPortfolioValue.toFixed(2)),
        totalHoldingsCost: parseFloat(totalHoldingsCost.toFixed(2)),
        totalHoldingsValue: parseFloat(totalHoldingsValue.toFixed(2)),
        totalUnrealizedPl: parseFloat(totalUnrealizedPl.toFixed(2)),
        overallPlPercentage: parseFloat(overallPlPercentage.toFixed(2)),
        holdings,
        history: [],
      });
    }

    const supabase = await getRequestClient();
    // Fetch user details, holdings, and history in parallel
    const [userRes, holdingsRes, historyRes] = await Promise.all([
      supabase.from("User").select("balance").eq("id", user.userId).limit(1),
      supabase.from("Holding").select("*").eq("userId", user.userId),
      supabase.from("PortfolioHistory")
        .select("*")
        .eq("userId", user.userId)
        .order("timestamp", { ascending: true })
        .limit(50),
    ]);

    if (userRes.error) throw userRes.error;
    if (holdingsRes.error) throw holdingsRes.error;
    if (historyRes.error) throw historyRes.error;

    const dbUser = userRes.data?.[0];
    const holdings = holdingsRes.data || [];
    const history = historyRes.data || [];

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
    if (error.name === "ShoonyaSessionExpiredError" || error.message?.includes("401") || error.message?.includes("Session Expired")) {
      return NextResponse.json({ error: "Shoonya session expired" }, { status: 401 });
    }
    return NextResponse.json({ error: "Failed to load portfolio details" }, { status: 500 });
  }
}
