import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { fetchShoonyaQuote } from "@/lib/shoonya";
import { priceStore } from "@/lib/priceStore";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const exchange = searchParams.get("exchange");
    const token = searchParams.get("token");

    if (!exchange || !token) {
      return NextResponse.json({ error: "exchange and token parameters are required" }, { status: 400 });
    }

    // Try to get session credentials from cookies or headers
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
    const shoonyaUserId = headerUserId || session?.userId;

    if (!accessToken || !shoonyaUserId) {
      return NextResponse.json({ error: "No active Shoonya session found" }, { status: 401 });
    }
    const quoteData = await fetchShoonyaQuote(shoonyaUserId, exchange, token, accessToken);

    if (quoteData.stat !== "Ok") {
      console.error(`[Shoonya Quote API] Failed to retrieve quote for ${exchange}:${token} - Response:`, quoteData.emsg);
      return NextResponse.json({ error: quoteData.emsg || "Failed to fetch quote from Shoonya" }, { status: 400 });
    }

    const ltp = parseFloat(quoteData.lp || "0");
    const changePercent = parseFloat(quoteData.pc || "0");

    console.log(`[Shoonya Quote API] Fetched LTP for ${exchange}:${token} - LTP: ₹${ltp}, Change: ${changePercent}%`);

    if (!isNaN(ltp)) {
      priceStore.setPrice(token, ltp, changePercent);
    }

    return NextResponse.json({
      exchange,
      token,
      ltp,
      changePercent,
      open: parseFloat(quoteData.o || "0"),
      close: parseFloat(quoteData.c || "0"),
      high: parseFloat(quoteData.h || "0"),
      low: parseFloat(quoteData.l || "0"),
      volume: parseFloat(quoteData.v || "0"),
      tradingSymbol: quoteData.tsym || "",
    });
  } catch (error: any) {
    console.error("[Quote API] Error:", error.message || error);
    if (error.name === "ShoonyaSessionExpiredError" || error.message?.includes("401") || error.message?.includes("Session Expired")) {
      return NextResponse.json({ error: "Shoonya session expired" }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
