import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { validateCredentials } from "@/lib/shoonya";
import { priceStore } from "@/lib/priceStore";
import { getInstrumentsByTokens, getNifty50Instruments } from "@/lib/instruments";

export const dynamic = "force-dynamic";

// Fallback logic for mock mode or failures
async function getMockMovers() {
  const prices = priceStore.getAllPrices();
  const tokens = Object.keys(prices);

  // Get actual Nifty 50 instruments from local CSV helper
  const niftyInstruments = await getNifty50Instruments();
  const nifty50 = niftyInstruments.map((inst) => {
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

  let gainers: any[] = [];
  let losers: any[] = [];

  if (tokens.length > 0) {
    const allInstruments = await getInstrumentsByTokens(tokens);
    const instruments = allInstruments.filter(inst => inst.symbol.endsWith("-EQ"));

    const list = instruments.map((inst: any) => {
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

    gainers = [...list]
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 5);

    losers = [...list]
      .sort((a, b) => a.changePercent - b.changePercent)
      .slice(0, 5);
  }

  return { gainers, losers, nifty50 };
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
        const clientCode = process.env.SHOONYA_USER_ID;
        const password = process.env.SHOONYA_PASSWORD;
        const apiKey = process.env.SHOONYA_API_KEY;
        const totpSecret = process.env.SHOONYA_TOTP_SECRET;
        const vendorCode = process.env.SHOONYA_VENDOR_CODE;

        if (clientCode && password && apiKey && totpSecret && vendorCode) {
          console.log("[Market Gainers/Losers API] Validating Shoonya credentials...");
          await validateCredentials({
            userId: clientCode,
            passwordHash: password,
            apiKey,
            totpSecret,
            vendorCode,
          });

          const liveData = await getMockMovers();
          return NextResponse.json(liveData);
        }
      } catch (liveErr: any) {
        console.error("[Market Gainers/Losers API] Error validating Shoonya credentials, falling back to mock:", liveErr.message || liveErr);
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
