import { generateSync } from "otplib";
import { query } from "./db";
import { priceStore } from "./priceStore";

interface LoginResponse {
  status: boolean;
  message: string;
  data: {
    jwtToken: string;
    refreshToken: string;
    feedToken: string;
  };
}

let activeLiveWebsocket: { close: () => void } | null = null;

// Validate credentials by attempting a live session login
export async function validateCredentials(params: {
  clientCode: string;
  passwordHash: string;
  apiKey: string;
  totpSecret: string;
}): Promise<{ jwtToken: string; feedToken: string }> {
  const { clientCode, passwordHash, apiKey, totpSecret } = params;

  // Generate TOTP token
  let token = "";
  try {
    token = generateSync({ secret: totpSecret });
  } catch {
    throw new Error("Invalid TOTP secret format. Please check your key.");
  }

  // Perform login POST request to Angel One
  const loginUrl = "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword";

  const response = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-PrivateKey": apiKey,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
    },
    body: JSON.stringify({
      clientcode: clientCode,
      password: passwordHash,
      totp: token,
    }),
  });

  const data = (await response.json()) as LoginResponse;

  if (!response.ok || !data.status) {
    throw new Error(data.message || "Failed to log in to Angel One. Check credentials.");
  }

  return {
    jwtToken: data.data.jwtToken,
    feedToken: data.data.feedToken,
  };
}

// Start the live feed for a specific user
export async function startLiveFeed(userId: string) {
  try {
    // 1. Fetch credentials from environment variables
    const clientCode = process.env.SMART_API_CLIENT_CODE;
    const password = process.env.SMART_API_PASSWORD;
    const apiKey = process.env.SMART_API_API_KEY;
    const totpSecret = process.env.SMART_API_TOTP_SECRET;

    if (!clientCode || !password || !apiKey || !totpSecret) {
      console.log("[SmartAPI] Smart API environment variables not configured. Live feed skipped.");
      return;
    }

    // 2. Perform login to get JWT and Feed Token
    console.log(`[SmartAPI] Logging in user ${clientCode} to Angel One...`);
    const { jwtToken, feedToken } = await validateCredentials({
      clientCode,
      passwordHash: password,
      apiKey,
      totpSecret,
    });

    console.log("[SmartAPI] Login successful. Connecting WebSocket v2...");

    // 3. Stop existing live connection if any
    if (activeLiveWebsocket) {
      try {
        activeLiveWebsocket.close();
      } catch { }
      activeLiveWebsocket = null;
    }

    // 4. Fetch the tokens we want to subscribe to (Watchlist & Holdings)
    const [watchlistRes, holdingsRes] = await Promise.all([
      query('SELECT token FROM "Watchlist" WHERE "userId" = $1', [userId]),
      query('SELECT token FROM "Holding" WHERE "userId" = $1', [userId]),
    ]);
    const watchlist = watchlistRes.rows;
    const holdings = holdingsRes.rows;

    const subscriptionTokens = Array.from(
      new Set([
        ...Object.keys(priceStore.getAllPrices()),
        ...watchlist.map((w) => w.token),
        ...holdings.map((h) => h.token),
      ])
    );

    if (subscriptionTokens.length === 0) {
      console.log("[SmartAPI] No tokens to subscribe to. Skipping WebSocket.");
      return;
    }

    // Import WebSocketV2 dynamically to prevent server build issues
    const { WebSocketV2 } = await import("smartapi-javascript");

    // Initialize Web Socket client
    const ws = new WebSocketV2({
      jwttoken: jwtToken,
      apikey: apiKey,
      clientcode: clientCode,
      feedtype: feedToken,
    });

    ws.connect()
      .then(() => {
        console.log(`[SmartAPI] Connected! Subscribing to ${subscriptionTokens.length} tokens...`);

        // Mode 1: LTP, Exchange Type 1: NSE
        // Since we filtered for NSE and BSE segment, we chunk subscriptions by exchange
        const nseTokens = subscriptionTokens.filter(t => t.length < 6); // standard NSE tokens are usually < 6 digits
        const bseTokens = subscriptionTokens.filter(t => t.length >= 6); // standard BSE tokens are 6 digits (e.g. 500325)

        if (nseTokens.length > 0) {
          ws.fetchData({
            correlationID: "paper_nse_1",
            action: 1, // Subscribe
            mode: 1,   // LTP
            exchangeType: 1, // NSE
            tokens: nseTokens,
          });
        }

        if (bseTokens.length > 0) {
          ws.fetchData({
            correlationID: "paper_bse_1",
            action: 1, // Subscribe
            mode: 1,   // LTP
            exchangeType: 3, // BSE segment index type
            tokens: bseTokens,
          });
        }

        // Listen for tick updates
        ws.on("tick", (tick: { token: string; last_traded_price: number; change_percent?: number }) => {
          if (tick && tick.token && tick.last_traded_price) {
            const ltp = tick.last_traded_price / 100; // API usually returns price in paise
            const changePercent = tick.change_percent || 0.0;
            
            // Clean up token from double quotes if wrapped by the SDK
            const cleanToken = tick.token.replace(/^"|"$/g, "");
            
            // Update our central price cache
            priceStore.setPrice(cleanToken, ltp, changePercent);
          }
        });

        activeLiveWebsocket = ws;
      })
      .catch((err: unknown) => {
        console.error("[SmartAPI] WebSocket connection failed:", err);
      });
  } catch (error: unknown) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error("[SmartAPI] Error starting live feed:", errMessage);
  }
}

export function stopLiveFeed() {
  if (activeLiveWebsocket) {
    try {
      activeLiveWebsocket.close();
      console.log("[SmartAPI] Live WebSocket feed closed.");
    } catch { }
    activeLiveWebsocket = null;
  }
}

