import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabase } from "@/lib/db";
import { priceStore } from "@/lib/priceStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch positions where net quantity is positive (representing long holdings)
    const { data: positions, error: posError } = await supabase
      .from("PaperPosition")
      .select("*")
      .eq("userId", user.userId)
      .gt("netQty", 0);

    if (posError) throw posError;

    const holdings = await Promise.all(
      (positions || []).map(async (pos) => {
        let ltp = pos.ltp || 0;
        
        // Resolve token to fetch real-time price
        const { data: instruments, error: instError } = await supabase
          .from("Instrument")
          .select("token")
          .eq("symbol", pos.symbol)
          .limit(1);

        if (instError) throw instError;
        const inst = instruments?.[0];

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
