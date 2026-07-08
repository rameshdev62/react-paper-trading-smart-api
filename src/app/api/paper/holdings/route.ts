import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { priceStore } from "@/lib/priceStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch positions where net quantity is positive (representing long holdings)
    const positionsRes = await query(
      'SELECT * FROM "PaperPosition" WHERE "userId" = $1 AND "netQty" > 0',
      [user.userId]
    );
    const positions = positionsRes.rows;

    const holdings = await Promise.all(
      positions.map(async (pos) => {
        let ltp = pos.ltp || 0;
        
        // Resolve token to fetch real-time price
        const instRes = await query(
          'SELECT token FROM "Instrument" WHERE symbol = $1 LIMIT 1',
          [pos.symbol]
        );
        const inst = instRes.rows[0];

        if (inst) {
          const priceInfo = priceStore.getPrice(inst.token);
          if (priceInfo) {
            ltp = priceInfo.ltp;
          }
        }

        const quantity = pos.netQty;
        const avgPrice = pos.avgBuyPrice;
        const currentValue = quantity * ltp;
        const pl = currentValue - (quantity * avgPrice);

        return {
          id: pos.id,
          symbol: pos.symbol,
          quantity,
          avgPrice,
          currentPrice: ltp,
          currentValue,
          pl,
        };
      })
    );

    return NextResponse.json(holdings);
  } catch (error: any) {
    console.error("[Paper Holdings API] Error fetching holdings:", error);
    return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
  }
}
