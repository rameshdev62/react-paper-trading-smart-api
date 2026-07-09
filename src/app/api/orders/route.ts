import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestClient } from "@/lib/db";
import { placeOrder } from "@/lib/engine";

export const dynamic = "force-dynamic";

// GET /api/orders: Fetch all orders for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getRequestClient();
    const { data: orders, error } = await supabase
      .from("Order")
      .select("*")
      .eq("userId", user.userId)
      .order("createdAt", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json(orders);
  } catch (error: any) {
    console.error("[Orders API] Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

// POST /api/orders: Place a new paper trade order
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { symbol, token, exchange, quantity, price, orderType, transactionType, productType } = body;

    // Basic Validation
    if (!symbol || !token || !exchange || !quantity || !orderType || !transactionType || !productType) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than 0" }, { status: 400 });
    }

    if ((orderType === "LIMIT" || orderType === "SL") && (!price || price <= 0)) {
      return NextResponse.json({ error: "Price must be greater than 0 for Limit/SL orders" }, { status: 400 });
    }

    const order = await placeOrder({
      userId: user.userId,
      symbol,
      token,
      exchange,
      quantity: parseInt(quantity),
      price: orderType === "MARKET" ? 0 : parseFloat(price),
      orderType,
      transactionType,
      productType,
    });

    return NextResponse.json({
      message: order.status === "COMPLETED" ? "Order executed successfully" : "Order placed successfully",
      order,
    }, { status: 201 });
  } catch (error: any) {
    console.error("[Orders API] Error placing order:", error);
    return NextResponse.json({ error: error.message || "Failed to place order" }, { status: 500 });
  }
}
