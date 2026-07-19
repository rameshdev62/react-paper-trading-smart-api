import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Map timeframes to Shoonya interval strings
const timeframeIntervalMap: Record<string, string> = {
  "15m": "15",
  "1h": "60",
  "2h": "60", // Fetch hourly and aggregate
  "3h": "60", // Fetch hourly and aggregate
};

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const exchange = searchParams.get("exchange") || "NSE";
    const token = searchParams.get("token") || "3045";
    const timeframe = searchParams.get("timeframe") || "1h"; // 15m, 1h, 2h, 3h

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

    const isLive = accessToken && shoonyaUserId;

    if (!isLive) {
      // MOCK MODE: Return realistic mock historical candles
      const mockCandles = generateMockCandles(timeframe, token);
      return NextResponse.json({ source: "mock", candles: mockCandles });
    }

    // LIVE MODE: Fetch candles from Shoonya API
    const mappedInterval = timeframeIntervalMap[timeframe] || "60";
    const et = Math.floor(Date.now() / 1000);
    // Fetch 30 days for hourly / multi-hourly, 10 days for 15m to avoid payload size issues
    const daysToFetch = timeframe === "15m" ? 10 : 30;
    const st = et - daysToFetch * 24 * 60 * 60;

    const payload = {
      uid: shoonyaUserId,
      exch: exchange,
      token: token,
      st: st.toString(),
      et: et.toString(),
      intrv: mappedInterval,
    };

    console.log(`[History API] Fetching historical series from Shoonya...`, payload);

    let shoonyaRes;
    try {
      shoonyaRes = await fetch("https://api.shoonya.com/NorenWClientTP/TPSeries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jData: payload,
          jKey: accessToken,
        }),
      });
    } catch (fetchErr: any) {
      console.warn("[History API] Connection to Shoonya TPSeries failed:", fetchErr.message);
      return NextResponse.json({
        source: "mock-fallback",
        reason: "Shoonya API connection failed: " + fetchErr.message,
        candles: generateMockCandles(timeframe, token)
      });
    }

    if (!shoonyaRes.ok) {
      console.warn(`[History API] Shoonya TPSeries server returned HTTP error ${shoonyaRes.status}`);
      return NextResponse.json({
        source: "mock-fallback",
        reason: `Shoonya historical server returned HTTP error ${shoonyaRes.status} (Bad Gateway/Maintenance)`,
        candles: generateMockCandles(timeframe, token)
      });
    }

    const data = await shoonyaRes.json();

    if (data.stat === "Not_Ok") {
      console.warn(`[History API] Shoonya returned Not_Ok:`, data.reason);
      // Fallback to mock candles if Shoonya historical query is rejected (e.g. no subscription or token issue)
      return NextResponse.json({ 
        source: "mock-fallback", 
        reason: data.reason || "Shoonya API historical query failed",
        candles: generateMockCandles(timeframe, token) 
      });
    }

    if (!Array.isArray(data)) {
      console.warn(`[History API] Shoonya response is not an array:`, data);
      return NextResponse.json({ 
        source: "mock-fallback", 
        reason: "Unexpected API response format",
        candles: generateMockCandles(timeframe, token) 
      });
    }

    // Parse Shoonya Noren response to standard Candle format
    // Shoonya returns newest first. We reverse it to make it chronological.
    let candles: Candle[] = data
      .reverse()
      .map((item: any) => ({
        time: item.time, // "dd-mm-yyyy HH:MM:SS"
        open: parseFloat(item.into || "0"),
        high: parseFloat(item.inth || "0"),
        low: parseFloat(item.intl || "0"),
        close: parseFloat(item.intc || "0"),
        volume: parseInt(item.intv || "0"),
      }))
      .filter((c) => !isNaN(c.open) && c.open > 0);

    // Aggregate candles if timeframe is 2h or 3h
    if (timeframe === "2h" || timeframe === "3h") {
      const groupSize = timeframe === "2h" ? 2 : 3;
      candles = aggregateCandles(candles, groupSize);
    }

    return NextResponse.json({ source: "live", candles });
  } catch (error: any) {
    console.error("[History API] Error fetching history:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch historical data" }, { status: 500 });
  }
}

// Helper to aggregate hourly candles into multi-hour candles
function aggregateCandles(rawCandles: Candle[], groupSize: number): Candle[] {
  const aggregated: Candle[] = [];
  for (let i = 0; i < rawCandles.length; i += groupSize) {
    const chunk = rawCandles.slice(i, i + groupSize);
    if (chunk.length === 0) continue;

    const first = chunk[0];
    const last = chunk[chunk.length - 1];

    let high = first.high;
    let low = first.low;
    let volume = 0;

    for (const c of chunk) {
      if (c.high > high) high = c.high;
      if (c.low < low) low = c.low;
      volume += c.volume;
    }

    aggregated.push({
      time: first.time,
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
    });
  }
  return aggregated;
}

// Generate realistic mock candles containing occurrences of the pattern
function generateMockCandles(timeframe: string, token: string): Candle[] {
  const count = 300;
  const candles: Candle[] = [];
  
  // Create a pseudo-random baseline price based on token number
  let price = 200 + (parseInt(token) % 600);
  const now = new Date();
  
  // Determine duration step per candle
  let minuteStep = 15;
  if (timeframe === "1h") minuteStep = 60;
  if (timeframe === "2h") minuteStep = 120;
  if (timeframe === "3h") minuteStep = 180;

  // Generate background candles
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getTime() - (count - i) * minuteStep * 60 * 1000);
    
    // Add small random noise
    const change = price * (Math.random() - 0.5) * 0.008;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + price * Math.random() * 0.005;
    const low = Math.min(open, close) - price * Math.random() * 0.005;
    const volume = Math.floor(Math.random() * 50000) + 10000;
    
    candles.push({
      time: formatDateString(date),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });
    
    price = close;
  }

  // Inject pattern occurrences at indices: 50, 120, 210
  // Morning Star Pinbar Bullish Reversal pattern:
  // C1: Large Red Candle
  // C2: Small Green Pinbar (Low is lowest, High reaches C1 open/mid, Open/Close form small body near bottom)
  // C3: Big Green Breakout (Closes above C1 high)
  
  const injectPattern = (index: number) => {
    if (index >= candles.length - 10) return;
    
    const basePrice = candles[index - 1].close;
    
    // C1: Large Bearish (Red)
    const o1 = basePrice;
    const c1 = basePrice * 0.98; // -2% body
    const h1 = o1 + basePrice * 0.001;
    const l1 = c1 - basePrice * 0.002;
    
    candles[index] = {
      time: candles[index].time,
      open: parseFloat(o1.toFixed(2)),
      high: parseFloat(h1.toFixed(2)),
      low: parseFloat(l1.toFixed(2)),
      close: parseFloat(c1.toFixed(2)),
      volume: 45000,
    };
    
    // C2: Small Pinbar (Green)
    const o2 = c1 - basePrice * 0.003;
    const c2 = o2 + basePrice * 0.002; // small green body
    const l2 = c1 - basePrice * 0.015; // deep lower wick (Stoploss!)
    const h2 = c2 + basePrice * 0.003; // small upper wick
    
    candles[index + 1] = {
      time: candles[index + 1].time,
      open: parseFloat(o2.toFixed(2)),
      high: parseFloat(h2.toFixed(2)),
      low: parseFloat(l2.toFixed(2)),
      close: parseFloat(c2.toFixed(2)),
      volume: 60000,
    };
    
    // C3: Big Bullish Breakout (Green)
    const o3 = c2;
    const c3 = o1 * 1.025; // Closes 2.5% above C1 open (breakout!)
    const h3 = c3 + basePrice * 0.002;
    const l3 = o3 - basePrice * 0.002;
    
    candles[index + 2] = {
      time: candles[index + 2].time,
      open: parseFloat(o3.toFixed(2)),
      high: parseFloat(h3.toFixed(2)),
      low: parseFloat(l3.toFixed(2)),
      close: parseFloat(c3.toFixed(2)),
      volume: 85000,
    };

    // Make next 10 candles tick upwards so the strategy hits Target (to show success)
    let followPrice = c3;
    for (let j = 3; j < 12; j++) {
      const nextIdx = index + j;
      if (nextIdx >= candles.length) break;
      const nextOpen = followPrice;
      const nextClose = nextOpen * (1 + Math.random() * 0.008); // general upward tick
      const nextHigh = Math.max(nextOpen, nextClose) + basePrice * 0.002;
      const nextLow = Math.min(nextOpen, nextClose) - basePrice * 0.001;
      
      candles[nextIdx] = {
        time: candles[nextIdx].time,
        open: parseFloat(nextOpen.toFixed(2)),
        high: parseFloat(nextHigh.toFixed(2)),
        low: parseFloat(nextLow.toFixed(2)),
        close: parseFloat(nextClose.toFixed(2)),
        volume: 30000,
      };
      followPrice = nextClose;
    }
  };

  // Inject 3 successful occurrences
  injectPattern(50);
  injectPattern(130);
  injectPattern(220);

  // Inject 1 failed occurrence at index 170 (hits stoploss afterward)
  const injectFailedPattern = (index: number) => {
    if (index >= candles.length - 10) return;
    const basePrice = candles[index - 1].close;
    
    // C1: Large Bearish
    const o1 = basePrice;
    const c1 = basePrice * 0.98;
    const h1 = o1 + basePrice * 0.001;
    const l1 = c1 - basePrice * 0.002;
    
    candles[index] = {
      time: candles[index].time,
      open: parseFloat(o1.toFixed(2)),
      high: parseFloat(h1.toFixed(2)),
      low: parseFloat(l1.toFixed(2)),
      close: parseFloat(c1.toFixed(2)),
      volume: 45000,
    };
    
    // C2: Small Pinbar
    const o2 = c1 - basePrice * 0.003;
    const c2 = o2 + basePrice * 0.002;
    const l2 = c1 - basePrice * 0.01; // stoploss level
    const h2 = c2 + basePrice * 0.003;
    
    candles[index + 1] = {
      time: candles[index + 1].time,
      open: parseFloat(o2.toFixed(2)),
      high: parseFloat(h2.toFixed(2)),
      low: parseFloat(l2.toFixed(2)),
      close: parseFloat(c2.toFixed(2)),
      volume: 60000,
    };
    
    // C3: Big Bullish
    const o3 = c2;
    const c3 = o1 * 1.015; // Closes above C1 high
    const h3 = c3 + basePrice * 0.002;
    const l3 = o3 - basePrice * 0.002;
    
    candles[index + 2] = {
      time: candles[index + 2].time,
      open: parseFloat(o3.toFixed(2)),
      high: parseFloat(h3.toFixed(2)),
      low: parseFloat(l3.toFixed(2)),
      close: parseFloat(c3.toFixed(2)),
      volume: 85000,
    };

    // Make next 5 candles drop below Stoploss (l2)
    let followPrice = c3;
    for (let j = 3; j < 8; j++) {
      const nextIdx = index + j;
      if (nextIdx >= candles.length) break;
      const nextOpen = followPrice;
      const nextClose = nextOpen * 0.97; // steep drop
      const nextHigh = Math.max(nextOpen, nextClose) + basePrice * 0.001;
      const nextLow = Math.min(nextOpen, nextClose) - basePrice * 0.004;
      
      candles[nextIdx] = {
        time: candles[nextIdx].time,
        open: parseFloat(nextOpen.toFixed(2)),
        high: parseFloat(nextHigh.toFixed(2)),
        low: parseFloat(nextLow.toFixed(2)),
        close: parseFloat(nextClose.toFixed(2)),
        volume: 35000,
      };
      followPrice = nextClose;
    }
  };

  injectFailedPattern(90);

  return candles;
}

function formatDateString(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${d}-${m}-${y} ${h}:${min}:${s}`;
}
