import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { supabase } from "@/lib/db";
import { placeOrder } from "@/lib/paper/orderEngine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { symbol, side, orderType, quantity, triggerPrice } = body;
    let price = body.price;

    if (!symbol || !side || !orderType || !quantity) {
      return NextResponse.json({ error: "Missing required fields: symbol, side, orderType, quantity" }, { status: 400 });
    }

    if (quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });
    }

    if ((orderType === "LIMIT" || orderType === "SL") && (price === undefined || parseFloat(price) <= 0)) {
      return NextResponse.json({ error: "Price must be greater than 0 for Limit/SL orders" }, { status: 400 });
    }

    // Default price to 0 for MARKET order if not provided
    if (orderType === "MARKET" && price === undefined) {
      price = 0;
    }

    const targetSymbol = symbol.trim().toUpperCase();

    const { data: instruments, error: instError } = await supabase
      .from("Instrument")
      .select("*")
      .or(`symbol.eq."${targetSymbol}",symbol.eq."${targetSymbol}-EQ",name.eq."${targetSymbol}"`)
      .limit(1);

    if (instError) throw instError;
    let dbInstrument = instruments?.[0] || null;

    if (!dbInstrument) {
      // Fallback
      dbInstrument = {
        id: "",
        token: "2885", // default fallback (e.g. RELIANCE token)
        symbol: targetSymbol.endsWith("-EQ") ? targetSymbol : targetSymbol + "-EQ",
        name: targetSymbol,
        expiry: null,
        strike: null,
        lotsize: null,
        exchSeg: "NSE",
        tickSize: null,
      };
    }

    const exchange = body.exchange || dbInstrument.exchSeg || "NSE";
    const instrument = body.instrument || dbInstrument.symbol || targetSymbol;

    const result = await placeOrder({
      userId: user.userId,
      symbol: instrument,
      exchange,
      instrument,
      side,
      orderType,
      quantity: parseInt(quantity),
      price: parseFloat(price),
      triggerPrice: triggerPrice ? parseFloat(triggerPrice) : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("[Paper Order API] Error placing order:", error);
    return NextResponse.json({ error: error.message || "Failed to place order" }, { status: 500 });
  }
}
