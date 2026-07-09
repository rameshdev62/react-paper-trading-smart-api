import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestClient } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getRequestClient();
    const { data: positions, error } = await supabase
      .from("PaperPosition")
      .select("*")
      .eq("userId", user.userId)
      .neq("netQty", 0);

    if (error) throw error;

    const mapped = positions.map((pos) => ({
      id: pos.id,
      symbol: pos.symbol,
      buyQty: pos.buyQty,
      sellQty: pos.sellQty,
      netQty: pos.netQty,
      avgBuy: pos.avgBuyPrice,
      avgSell: pos.avgSellPrice,
      ltp: pos.ltp,
      invested: pos.invested,
      marketValue: pos.marketValue,
      unrealizedPl: pos.unrealizedPnl,
      realizedPl: pos.realizedPnl,
    }));

    return NextResponse.json(mapped);
  } catch (error: any) {
    console.error("[Paper Positions API] Error fetching positions:", error);
    return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
  }
}
