import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/watchlist?group=xxx — Get watchlist items, optionally filtered by group
// GET /api/watchlist?groups=true — Get distinct group names
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const group = searchParams.get("group");
    const groupsOnly = searchParams.get("groups");

    if (groupsOnly === "true") {
      const result = await prisma.watchlist.groupBy({
        by: ["group"],
        where: { userId: user.userId },
        _count: { group: true },
        orderBy: { group: "asc" },
      });
      const groups = result.map((r) => ({ name: r.group, count: r._count.group }));
      return NextResponse.json(groups);
    }

    const where: any = { userId: user.userId };
    if (group) {
      where.group = group;
    }

    const watchlist = await prisma.watchlist.findMany({
      where,
      orderBy: { addedAt: "desc" },
    });

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

    const { symbol, token, exchange, group, mode } = await req.json();
    if (!symbol || !token || !exchange) {
      return NextResponse.json({ error: "Missing symbol, token, or exchange" }, { status: 400 });
    }

    const targetGroup = group || "Default";

    const item = await prisma.watchlist.upsert({
      where: {
        userId_token_exchange_group: {
          userId: user.userId,
          token,
          exchange,
          group: targetGroup,
        },
      },
      update: {},
      create: {
        userId: user.userId,
        symbol,
        token,
        exchange,
        group: targetGroup,
      },
    });

    // Lazy-initialize the new token in the price cache
    const { priceStore } = require("@/lib/priceStore");
    priceStore.getPrice(token);

    if (mode === "live" || process.env.NEXT_PUBLIC_APP_MODE === "live") {
      const { startLiveFeed } = require("@/lib/smartapi");
      startLiveFeed(user.userId).catch((err: any) => {
        console.error("[Watchlist API] Failed to update live feed:", err);
      });
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

    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");
    const exchange = searchParams.get("exchange");
    const group = searchParams.get("group") || "Default";
    const mode = searchParams.get("mode");

    if (!token || !exchange) {
      return NextResponse.json({ error: "Missing token or exchange parameter" }, { status: 400 });
    }

    await prisma.watchlist.delete({
      where: {
        userId_token_exchange_group: {
          userId: user.userId,
          token,
          exchange,
          group,
        },
      },
    });

    if (mode === "live" || process.env.NEXT_PUBLIC_APP_MODE === "live") {
      const { startLiveFeed } = require("@/lib/smartapi");
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
