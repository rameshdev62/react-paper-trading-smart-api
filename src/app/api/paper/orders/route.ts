import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = req.nextUrl.searchParams.get("status");

    let queryText = 'SELECT * FROM "PaperOrder" WHERE "userId" = $1';
    const params = [user.userId];
    if (status) {
      queryText += ' AND status = $2';
      params.push(status);
    }
    queryText += ' ORDER BY "createdAt" DESC';

    const result = await query(queryText, params);
    const orders = result.rows;

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
