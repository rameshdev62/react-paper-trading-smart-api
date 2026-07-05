import { generateSync } from "otplib";
import { prisma } from "./db";
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

let activeLiveWebsocket: any = null;

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
  } catch (err) {
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
    // 1. Fetch credentials from DB
    const creds = await prisma.credentials.findUnique({
      where: { userId },
    });

    if (!creds) {
      console.log(`[SmartAPI] No credentials configured for user ${userId}. Live feed skipped.`);
      return;
    }

    // 2. Perform login to get JWT and Feed Token
    console.log(`[SmartAPI] Logging in user ${creds.clientCode} to Angel One...`);
    const { jwtToken } = await validateCredentials({
      clientCode: creds.clientCode,
      passwordHash: creds.password, // This is stored directly
      apiKey: creds.apiKey,
      totpSecret: creds.totpSecret,
    });

    console.log("[SmartAPI] Login successful. Connecting WebSocket v2...");

    // 3. Stop existing live connection if any
    if (activeLiveWebsocket) {
      try {
        activeLiveWebsocket.close();
      } catch (e) {}
      activeLiveWebsocket = null;
    }

    // 4. Fetch the tokens we want to subscribe to (Watchlist & Holdings)
    const watchlist = await prisma.watchlist.findMany({ where: { userId } });
    const holdings = await prisma.holding.findMany({ where: { userId } });
    
    const subscriptionTokens = Array.from(
      new Set([
        "2885", // Always subscribe to RELIANCE baseline
        "3045", // Always subscribe to SBIN
        ...watchlist.map((w) => w.token),
        ...holdings.map((h) => h.token),
      ])
    );

    if (subscriptionTokens.length === 0) {
      console.log("[SmartAPI] No tokens to subscribe to. Skipping WebSocket.");
      return;
    }

    // Import WebSocketV2 dynamically to prevent server build issues
    const { WebSocketV2 } = require("smartapi-javascript");

    // Initialize Web Socket client
    const ws = new WebSocketV2({
      jwttoken: jwtToken,
      apikey: creds.apiKey,
      clientcode: creds.clientCode,
      feedtype: "order_feed", // or 'mfeed' / 'sfeed' based on documentation
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
        ws.on("tick", (tick: any) => {
          if (tick && tick.token && tick.last_traded_price) {
            const ltp = tick.last_traded_price / 100; // API usually returns price in paise
            const changePercent = tick.change_percent || 0.0;
            
            // Update our central price cache
            priceStore.setPrice(tick.token, ltp, changePercent);
          }
        });

        activeLiveWebsocket = ws;
      })
      .catch((err: any) => {
        console.error("[SmartAPI] WebSocket connection failed:", err);
      });
  } catch (error: any) {
    console.error("[SmartAPI] Error starting live feed:", error.message || error);
  }
}

export function stopLiveFeed() {
  if (activeLiveWebsocket) {
    try {
      activeLiveWebsocket.close();
      console.log("[SmartAPI] Live WebSocket feed closed.");
    } catch (e) {}
    activeLiveWebsocket = null;
  }
}
