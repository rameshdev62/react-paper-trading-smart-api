import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { placeOrder } from "@/lib/paper/orderEngine";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { symbol, exchange, instrument, side, orderType, quantity, price, triggerPrice } = body;

    if (!symbol || !exchange || !instrument || !side || !orderType || !quantity || price === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });
    }

    const result = await placeOrder({
      userId: user.userId,
      symbol,
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
