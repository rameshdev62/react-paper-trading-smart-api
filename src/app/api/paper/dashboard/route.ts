import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestClient } from "@/lib/db";
import { createAccount } from "@/lib/paper/margin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getRequestClient();

    const { data: accounts, error: accountError } = await supabase
      .from("PaperAccount")
      .select("*")
      .eq("userId", user.userId);

    if (accountError) throw accountError;
    let account = accounts?.[0] || null;
    if (!account) {
      account = await createAccount(user.userId);
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [positionsRes, tradesRes, ordersRes] = await Promise.all([
      supabase.from("PaperPosition").select("*").eq("userId", user.userId).neq("netQty", 0),
      supabase.from("PaperTrade")
        .select("*")
        .eq("userId", user.userId)
        .gte("tradeTime", todayStart.toISOString())
        .order("tradeTime", { ascending: false }),
      supabase.from("PaperOrder")
        .select("*")
        .eq("userId", user.userId)
        .in("status", ["PENDING", "OPEN"])
        .order("createdAt", { ascending: false }),
    ]);

    if (positionsRes.error) throw positionsRes.error;
    if (tradesRes.error) throw tradesRes.error;
    if (ordersRes.error) throw ordersRes.error;

    const positions = positionsRes.data || [];
    const todaysTrades = tradesRes.data || [];
    const openOrders = ordersRes.data || [];

    return NextResponse.json({
      account,
      positions,
      todaysTrades,
      openOrders,
    });
  } catch (error: any) {
    console.error("[Paper Dashboard API] Error loading dashboard:", error);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
