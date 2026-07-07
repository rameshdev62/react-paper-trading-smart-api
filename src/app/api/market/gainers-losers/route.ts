import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { priceStore } from "@/lib/priceStore";
import { validateCredentials } from "@/lib/smartapi";

export const dynamic = "force-dynamic";

// Fallback logic for mock mode or failures
async function getMockMovers() {
  const prices = priceStore.getAllPrices();
  const tokens = Object.keys(prices);

  const instruments = await prisma.instrument.findMany({
    where: {
      token: { in: tokens },
      symbol: { endsWith: "-EQ" },
    },
    select: {
      token: true,
      symbol: true,
      name: true,
      exchSeg: true,
    },
  });

  const list = instruments.map((inst) => {
    const priceInfo = prices[inst.token];
    return {
      token: inst.token,
      symbol: inst.symbol,
      name: inst.name,
      exchange: inst.exchSeg,
      ltp: priceInfo?.ltp || 0,
      changePercent: priceInfo?.changePercent || 0,
      open: priceInfo?.open || 0,
      close: priceInfo?.close || 0,
    };
  });

  const gainers = [...list]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, 5);

  const losers = [...list]
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, 5);

  return { gainers, losers, nifty50: list };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const mode = searchParams.get("mode") || "mock";

    if (mode === "live") {
      try {
        const clientCode = process.env.SMART_API_CLIENT_CODE;
        const password = process.env.SMART_API_PASSWORD;
        const apiKey = process.env.SMART_API_API_KEY;
        const totpSecret = process.env.SMART_API_TOTP_SECRET;

        if (clientCode && password && apiKey && totpSecret) {
          console.log("[Market Gainers/Losers API] Logging in for live market movers...");
          const { jwtToken } = await validateCredentials({
            clientCode,
            passwordHash: password,
            apiKey,
            totpSecret,
          });

          const headers = {
            "Content-Type": "application/json",
            "X-PrivateKey": apiKey,
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientIP": "127.0.0.1",
            "X-MACAddress": "00:00:00:00:00:00",
            "Authorization": `Bearer ${jwtToken}`,
          };

          console.log("[Market Gainers/Losers API] Fetching live data from Angel One...");
          const [gainersRes, losersRes] = await Promise.all([
            fetch("https://apiconnect.angelone.in/rest/secure/angelbroking/marketData/v1/gainersLosers", {
              method: "POST",
              headers,
              body: JSON.stringify({
                datatype: "PercPriceGainers",
                expirytype: "NEAR",
              }),
            }),
            fetch("https://apiconnect.angelone.in/rest/secure/angelbroking/marketData/v1/gainersLosers", {
              method: "POST",
              headers,
              body: JSON.stringify({
                datatype: "PercPriceLosers",
                expirytype: "NEAR",
              }),
            }),
          ]);

          if (gainersRes.ok && losersRes.ok) {
            const gainersData = await gainersRes.json();
            const losersData = await losersRes.json();

            if (gainersData.status && losersData.status) {
              const mapItem = (item: any) => ({
                token: item.symbolToken || "",
                symbol: item.tradingSymbol || "",
                name: item.tradingSymbol || "",
                exchange: "NFO",
                ltp: parseFloat(item.ltp || item.lastTradedPrice || 0),
                changePercent: parseFloat(item.percentChange || 0),
                open: 0,
                close: 0,
              });

              const gainers = (gainersData.data || []).map(mapItem).slice(0, 5);
              const losers = (losersData.data || []).map(mapItem).slice(0, 5);

              const mockData = await getMockMovers();
              return NextResponse.json({ gainers, losers, nifty50: mockData.nifty50 });
            }
          }
          console.warn("[Market Gainers/Losers API] Live API failed or returned non-ok status. Falling back to mock.");
        }
      } catch (liveErr: any) {
        console.error("[Market Gainers/Losers API] Error fetching live movers, falling back to mock:", liveErr.message || liveErr);
      }
    }

    // Fallback to mock movers if mock mode, no credentials, or live fetch fails
    const mockMovers = await getMockMovers();
    return NextResponse.json(mockMovers);
  } catch (error: any) {
    console.error("[Market Gainers/Losers API] Error:", error);
    return NextResponse.json({ error: "Failed to fetch top gainers and losers" }, { status: 500 });
  }
}
