import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestClient } from "@/lib/db";
import { startLiveFeed, fetchShoonyaQuote } from "@/lib/shoonya";

export const dynamic = "force-dynamic";

// GET /api/watchlist?group=xxx — Get watchlist items, optionally filtered by group
// GET /api/watchlist?groups=true — Get distinct group names
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getRequestClient();

    const searchParams = req.nextUrl.searchParams;
    const group = searchParams.get("group");
    const groupsOnly = searchParams.get("groups");

    if (groupsOnly === "true") {
      const { data, error } = await supabase
        .from("Watchlist")
        .select("group")
        .eq("userId", user.userId);

      if (error) throw error;

      const counts: Record<string, number> = {};
      for (const row of data || []) {
        counts[row.group] = (counts[row.group] || 0) + 1;
      }
      const groups = Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json(groups);
    }

    let queryBuilder = supabase
      .from("Watchlist")
      .select("*")
      .eq("userId", user.userId);

    if (group) {
      queryBuilder = queryBuilder.eq("group", group);
    }

    const { data: watchlist, error } = await queryBuilder.order("addedAt", { ascending: false });
    if (error) throw error;

    return NextResponse.json(watchlist);
  } catch (error: any) {
    console.error("[Watchlist API] Error fetching watchlist:", error);
    return NextResponse.json({ error: "Failed to fetch watchlist" }, { status: 500 });
  }
}

// POST /api/watchlist — Add stock to watchlist
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getRequestClient();

    const { symbol, token, exchange, group, mode } = await req.json();
    if (!symbol || !token || !exchange) {
      return NextResponse.json({ error: "Missing symbol, token, or exchange" }, { status: 400 });
    }

    const targetGroup = group || "Default";
    const uuid = require("crypto").randomUUID();

    const { data, error } = await supabase
      .from("Watchlist")
      .upsert(
        {
          id: uuid,
          userId: user.userId,
          symbol,
          token,
          exchange,
          group: targetGroup,
        },
        {
          onConflict: "userId,token,exchange,group",
        }
      )
      .select();

    if (error) throw error;
    const item = data?.[0];

    // Lazy-initialize the new token in the price cache
    const { priceStore } = require("@/lib/priceStore");
    priceStore.getPrice(token);

    if (mode === "live" || process.env.NEXT_PUBLIC_APP_MODE === "live") {
      startLiveFeed(user.userId).catch((err: any) => {
        console.error("[Watchlist API] Failed to update live feed:", err);
      });

      // Immediately fetch live quote to populate priceStore
      try {
        const { cookies } = require("next/headers");
        const cookieStore = await cookies();
        const sessionCookie = cookieStore.get("shoonya_session")?.value;
        const headerToken = req.headers.get("x-shoonya-access-token");
        const headerUserId = req.headers.get("x-shoonya-user-id");

        let session: any = null;
        if (sessionCookie) {
          try {
            session = JSON.parse(sessionCookie);
          } catch { }
        }

        const accessToken = headerToken || session?.accessToken;
        const shoonyaUserId = headerUserId || session?.userId || process.env.SHOONYA_USER_ID;

        if (accessToken && shoonyaUserId) {
          console.log(`[Watchlist API] Fetching initial live quote for added instrument ${exchange}:${token}...`);
          const quoteData = await fetchShoonyaQuote(shoonyaUserId, exchange, token, accessToken);
          if (quoteData && quoteData.stat === "Ok") {
            const ltp = parseFloat(quoteData.lp || "0");
            const changePercent = parseFloat(quoteData.pc || "0");
            if (!isNaN(ltp) && ltp > 0) {
              priceStore.setPrice(token, ltp, changePercent);
              console.log(`[Watchlist API] Initialized priceStore for ${symbol} with Shoonya live LTP: ₹${ltp}`);
            }
          } else {
            console.warn(`[Watchlist API] Shoonya quote response not Ok:`, quoteData?.emsg);
          }
        }
      } catch (err: any) {
        console.error("[Watchlist API] Error fetching initial live quote:", err.message || err);
      }
    }

    return NextResponse.json({ message: "Added to watchlist successfully", item }, { status: 201 });
  } catch (error: any) {
    console.error("[Watchlist API] Error adding to watchlist:", error);
    return NextResponse.json({ error: "Failed to add to watchlist" }, { status: 500 });
  }
}

// DELETE /api/watchlist?token=xxx&exchange=xxx&group=xxx — Remove stock from watchlist
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getRequestClient();

    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");
    const exchange = searchParams.get("exchange");
    const group = searchParams.get("group") || "Default";
    const mode = searchParams.get("mode");

    if (!token || !exchange) {
      return NextResponse.json({ error: "Missing token or exchange parameter" }, { status: 400 });
    }

    const { error } = await supabase
      .from("Watchlist")
      .delete()
      .eq("userId", user.userId)
      .eq("token", token)
      .eq("exchange", exchange)
      .eq("group", group);

    if (error) throw error;

    if (mode === "live" || process.env.NEXT_PUBLIC_APP_MODE === "live") {
      startLiveFeed(user.userId).catch((err: any) => {
        console.error("[Watchlist API] Failed to update live feed:", err);
      });
    }

    return NextResponse.json({ message: "Removed from watchlist successfully" });
  } catch (error: any) {
    console.error("[Watchlist API] Error removing from watchlist:", error);
    return NextResponse.json({ error: error.message || "Failed to remove from watchlist" }, { status: 500 });
  }
}
