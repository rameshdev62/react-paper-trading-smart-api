import { NextRequest } from "next/server";
import { priceStore } from "@/lib/priceStore";
import { getAuthUser } from "@/lib/auth";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Query watchlist & holdings to lazy-initialize their prices in the central price cache
  try {
    const [watchlistRes, holdingsRes] = await Promise.all([
      supabase.from("Watchlist").select("token").eq("userId", user.userId),
      supabase.from("Holding").select("token").eq("userId", user.userId),
    ]);

    if (watchlistRes.error) throw watchlistRes.error;
    if (holdingsRes.error) throw holdingsRes.error;

    const watchlist = watchlistRes.data || [];
    const holdings = holdingsRes.data || [];

    const allUserTokens = new Set([
      ...watchlist.map((w) => w.token),
      ...holdings.map((h) => h.token),
    ]);

    for (const token of allUserTokens) {
      priceStore.getPrice(token);
    }
  } catch (dbErr) {
    console.error("[Market Stream API] Error initializing user tokens:", dbErr);
  }

  // Parse dynamic app mode from query parameters
  const searchParams = req.nextUrl.searchParams;
  const mode = searchParams.get("mode") || process.env.NEXT_PUBLIC_APP_MODE || "mock";

  console.log(`[Market Stream API] Starting stream with mode: ${mode}`);

  if (mode === "mock") {
    priceStore.startMockSimulation();
    const { stopLiveFeed } = require("@/lib/smartapi");
    stopLiveFeed();
  } else if (mode === "live") {
    priceStore.stopMockSimulation();
    const { startLiveFeed } = require("@/lib/smartapi");
    startLiveFeed(user.userId).catch((err: any) => {
      console.error("[Market Stream API] Failed to start live feed:", err);
    });
  }

  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    start(controller) {
      // Subscribe to the central PriceStore cache updates
      const unsubscribe = priceStore.subscribe((prices) => {
        try {
          const payload = `data: ${JSON.stringify(prices)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error("[Market Stream API] Failed to stream data:", err);
        }
      });

      // If client aborts (closes dashboard), remove subscription
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
        console.log("[Market Stream API] Client disconnected from stream.");
      });
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
