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

    const status = req.nextUrl.searchParams.get("status");

    let queryBuilder = supabase
      .from("PaperOrder")
      .select("*")
      .eq("userId", user.userId);

    if (status) {
      queryBuilder = queryBuilder.eq("status", status);
    }

    const { data: orders, error } = await queryBuilder.order("createdAt", { ascending: false });
    if (error) throw error;

    const mapped = orders.map((o) => ({
      id: o.id,
      symbol: o.symbol,
      side: o.side,
      type: o.orderType,
      quantity: o.quantity,
      price: o.price,
      status: o.status,
      filledQty: o.filledQty,
      avgPrice: o.averagePrice || 0,
      createdAt: o.createdAt,
    }));

    return NextResponse.json(mapped);
  } catch (error: any) {
    console.error("[Paper Orders API] Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}
