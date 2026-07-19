import { generateSync } from "otplib";
import crypto from "crypto";
import WebSocket from "ws";
import { getServiceClient } from "./db";
import { priceStore } from "./priceStore";

const supabase = getServiceClient();

export class ShoonyaSessionExpiredError extends Error {
  constructor(message: string = "Shoonya session expired") {
    super(message);
    this.name = "ShoonyaSessionExpiredError";
  }
}

function checkResponse(res: any, data: any, context: string) {
  const isSessionExpired =
    res.status === 401 ||
    (data?.stat === "Not_Ok" &&
      data?.emsg &&
      (data.emsg.toLowerCase().includes("session expired") ||
       data.emsg.toLowerCase().includes("invalid session") ||
       data.emsg.toLowerCase().includes("session key") ||
       data.emsg.toLowerCase().includes("invalid session key")));

  if (isSessionExpired) {
    throw new ShoonyaSessionExpiredError(data?.emsg || `Shoonya session expired while ${context}`);
  }

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status} ${context}`);
  }
}

interface ShoonyaCredentials {
  userId: string;
  passwordHash: string;
  apiKey: string;
  totpSecret: string;
  vendorCode: string;
  imei?: string;
}

let activeLiveWebsocket: WebSocket | null = null;
let keepAliveInterval: NodeJS.Timeout | null = null;

// Helper to calculate SHA256 hex string
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// Validate credentials by attempting a live session login (QuickAuth)
export async function validateCredentials(params: ShoonyaCredentials): Promise<{ susertoken: string; actid: string }> {
  const { userId, passwordHash, apiKey, totpSecret, vendorCode, imei } = params;

  // Generate TOTP token
  let token = "";
  try {
    // Strip spaces if any in the TOTP secret
    token = generateSync({ secret: totpSecret.replace(/\s+/g, "") });
  } catch (err: any) {
    throw new Error(`Invalid TOTP secret format: ${err.message}`);
  }

  // Password must be SHA256 hashed (hex string)
  const hashedPassword = sha256(passwordHash);

  // AppKey must be SHA256 hashed string: uid + "|" + apiKey
  const hashedAppKey = sha256(`${userId}|${apiKey}`);

  const loginData = {
    apkversion: "1.0.0",
    uid: userId,
    pwd: hashedPassword,
    factor2: token,
    vc: vendorCode,
    appkey: hashedAppKey,
    imei: imei || "MAC_ADDR_FALLBACK",
    source: "API",
  };

  const payload = "jData=" + encodeURIComponent(JSON.stringify(loginData));

  console.log(`[Shoonya] Requesting login to Shoonya API at QuickAuth for uid: ${userId}...`);
  const response = await fetch("https://api.shoonya.com/NorenWClientTP/QuickAuth", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} connecting to Shoonya API`);
  }

  const resJson = await response.json() as any;

  if (resJson.stat !== "Ok") {
    throw new Error(resJson.emsg || "Failed to log in to Shoonya API. Check credentials.");
  }

  return {
    susertoken: resJson.susertoken,
    actid: resJson.actid || userId,
  };
}

// Start the live feed for a specific user
export async function startLiveFeed(
  userId: string,
  shoonyaSession?: { accessToken: string; susertoken: string; userId: string; accountId: string }
) {
  try {
    let clientCode = shoonyaSession?.userId;
    let actid = shoonyaSession?.accountId;
    let susertoken = shoonyaSession?.susertoken;

    if (!shoonyaSession) {
      // 1. Fetch credentials from environment variables
      const envClientCode = process.env.SHOONYA_USER_ID;
      const password = process.env.SHOONYA_PASSWORD;
      const apiKey = process.env.SHOONYA_API_KEY;
      const totpSecret = process.env.SHOONYA_TOTP_SECRET;
      const vendorCode = process.env.SHOONYA_VENDOR_CODE;
      const imei = process.env.SHOONYA_IMEI || "MAC_ADDR_FALLBACK";

      if (!envClientCode || !password || !apiKey || !totpSecret || !vendorCode) {
        console.log("[Shoonya] Shoonya API environment variables not configured. Live feed skipped.");
        return;
      }

      // 2. Perform login to get session token (susertoken)
      console.log(`[Shoonya] Initiating session login for client ${envClientCode}...`);
      const auth = await validateCredentials({
        userId: envClientCode,
        passwordHash: password,
        apiKey,
        totpSecret,
        vendorCode,
        imei,
      });
      clientCode = envClientCode;
      actid = auth.actid;
      susertoken = auth.susertoken;
    }

    console.log("[Shoonya] Login successful. Connecting WebSocket feed...");

    // 3. Stop existing live connection if any
    stopLiveFeed();

    // 4. Fetch the tokens we want to subscribe to (Watchlist & Holdings)
    const [watchlistRes, holdingsRes] = await Promise.all([
      supabase.from("Watchlist").select("token, exchange").eq("userId", userId),
      supabase.from("Holding").select("token, exchange").eq("userId", userId),
    ]);
    if (watchlistRes.error) throw watchlistRes.error;
    if (holdingsRes.error) throw holdingsRes.error;
    const watchlist = watchlistRes.data || [];
    const holdings = holdingsRes.data || [];

    const uniqueKeys = new Set<string>();

    // Always subscribe to NIFTY 50 by default
    uniqueKeys.add("NSE|26000");

    watchlist.forEach((w) => {
      if (w.token && w.exchange) {
        uniqueKeys.add(`${w.exchange}|${w.token}`);
      }
    });

    holdings.forEach((h) => {
      if (h.token && h.exchange) {
        uniqueKeys.add(`${h.exchange}|${h.token}`);
      }
    });

    const subscriptionKeys = Array.from(uniqueKeys);

    if (subscriptionKeys.length === 0) {
      console.log("[Shoonya] No tokens to subscribe to. Skipping WebSocket.");
      return;
    }

    // 5. Connect to WebSocket feed
    const wsUrl = "wss://api.shoonya.com/NorenWSAPI/";
    console.log(`[Shoonya WS] Connecting to live WebSocket endpoint: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    const activeToken = shoonyaSession?.accessToken || shoonyaSession?.susertoken || susertoken;

    ws.on("open", () => {
      console.log("[Shoonya WS] Socket connection opened. Sending auth payload...");

      const authPayload = {
        t: "a",
        uid: clientCode,
        actid: actid,
        accesstoken: activeToken,
        source: "API",
      };

      console.log(`[Shoonya WS] Transmitting auth packet: ${JSON.stringify(authPayload)}`);
      ws.send(JSON.stringify(authPayload));

      // Periodically send ping heartbeat every 3 seconds to keep socket alive
      console.log("[Shoonya WS] Starting keep-alive heartbeat pings every 3 seconds...");
      keepAliveInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          console.log("[Shoonya WS] → Sending ping heartbeat {'t':'h'}");
          ws.send(JSON.stringify({ t: "h" }));
        }
      }, 3000);
    });

    ws.on("message", (rawMsg) => {
      try {
        const msgStr = rawMsg.toString();
        console.log(`[Shoonya WS] ← Message received: ${msgStr}`);
        const msg = JSON.parse(msgStr);

        // Connection/Auth response acknowledgement (ak = auth ack, ck = conn ack)
        if ((msg.t === "ak" || msg.t === "ck") && msg.s === "OK") {
          console.log(`[Shoonya WS] Authenticated successfully! Subscribing to ${subscriptionKeys.length} instruments...`);

          const subPayload = {
            t: "t",
            k: subscriptionKeys.join("#"),
          };
          console.log(`[Shoonya WS] Transmitting subscribe packet: ${JSON.stringify(subPayload)}`);
          ws.send(JSON.stringify(subPayload));
        } else if ((msg.t === "ak" || msg.t === "ck") && msg.s !== "OK") {
          console.error(`[Shoonya WS] Authentication failed! Response:`, msg.emsg || JSON.stringify(msg));
        }

        // Handle touchline updates (tk = initial touchline response, tf = subsequent touchline changes)
        if ((msg.t === "tk" || msg.t === "tf") && msg.tk && msg.lp) {
          const token = msg.tk;
          const ltp = parseFloat(msg.lp);
          const changePercent = msg.pc ? parseFloat(msg.pc) : 0.0;

          if (!isNaN(ltp)) {
            console.log(`[Shoonya WS] Tick updated → Token: ${token}, LTP: ₹${ltp}, Change: ${changePercent}%`);
            priceStore.setPrice(token, ltp, changePercent);
          }
        }
      } catch (err: any) {
        console.error("[Shoonya WS] Error processing message:", err.message);
      }
    });

    ws.on("error", (err) => {
      console.error("[Shoonya WS] Socket error:", err);
    });

    ws.on("close", (code, reason) => {
      console.log(`[Shoonya WS] Socket closed. Code: ${code}, Reason: ${reason}`);
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    });

    activeLiveWebsocket = ws;
  } catch (error: any) {
    console.error("[Shoonya] Error starting live feed:", error.message || error);
  }
}

export function stopLiveFeed() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (activeLiveWebsocket) {
    try {
      activeLiveWebsocket.close();
      console.log("[Shoonya] Live WebSocket feed closed.");
    } catch { }
    activeLiveWebsocket = null;
  }
}

// ============================================================================
// Shoonya OAuth API Integration Functions
// ============================================================================

interface ShoonyaTokenParams {
  authCode: string;
  secretCode: string;
  clientId: string;
  userId: string;
}

interface ShoonyaTokenResponse {
  accessToken: string;
  userId: string;
  refreshToken: string;
  accountId: string;
  susertoken: string;
}

/**
 * Exchange the Shoonya OAuth auth_code for an Access Token.
 */
export async function getAccessToken(params: ShoonyaTokenParams): Promise<ShoonyaTokenResponse> {
  const { authCode, secretCode, clientId, userId } = params;

  const dataToHash = clientId + secretCode + authCode;
  const appVerifier = crypto
    .createHash("sha256")
    .update(dataToHash, "utf8")
    .digest("hex");

  const values = {
    code: authCode,
    checksum: appVerifier,
    uid: userId,
  };

  const payload = "jData=" + JSON.stringify(values);

  const response = await fetch("https://api.shoonya.com/NorenWClientAPI/GenAcsTok", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status} exchanging Shoonya token`);
  }

  const result = await response.json() as any;

  if (result.stat && result.stat !== "Ok") {
    throw new Error(result.emsg || "Token exchange failed");
  }

  return {
    accessToken: result.access_token,
    userId: result.USERID,
    refreshToken: result.refresh_token || "",
    accountId: result.actid,
    susertoken: result.susertoken,
  };
}

export function getOAuthHeaders(accessToken: string) {
  return {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=utf-8",
  };
}

// ─────────────────────────────────────────────────────────────────
// Shared logger: prints method, URL, HTTP status and stat/emsg
// ─────────────────────────────────────────────────────────────────
function shoonyaLog(fn: string, url: string, status: number, data: any) {
  const stat  = data?.stat  ?? "–";
  const emsg  = data?.emsg  ? ` | emsg: ${data.emsg}` : "";
  const icon  = stat === "Ok" ? "✓" : "✗";
  console.log(`[Shoonya] ${icon} ${fn} → POST ${url} | HTTP ${status} | stat: ${stat}${emsg}`);
}

export async function fetchShoonyaLimits(userId: string, accountId: string, accessToken: string) {
  const url     = "https://api.shoonya.com/NorenWClientAPI/Limits";
  const payload = "jData=" + JSON.stringify({ uid: userId, actid: accountId });
  console.log(`[Shoonya] → fetchShoonyaLimits  uid=${userId} actid=${accountId}`);
  const res  = await fetch(url, { method: "POST", headers: getOAuthHeaders(accessToken), body: payload });
  const data = await res.json();
  shoonyaLog("fetchShoonyaLimits", url, res.status, data);
  checkResponse(res, data, "fetching limits");
  return data;
}

export async function fetchShoonyaHoldings(userId: string, accountId: string, accessToken: string) {
  const url     = "https://api.shoonya.com/NorenWClientAPI/Holdings";
  const payload = "jData=" + JSON.stringify({ uid: userId, actid: accountId, prd: "C" });
  console.log(`[Shoonya] → fetchShoonyaHoldings  uid=${userId} actid=${accountId}`);
  const res  = await fetch(url, { method: "POST", headers: getOAuthHeaders(accessToken), body: payload });
  const data = await res.json();
  shoonyaLog("fetchShoonyaHoldings", url, res.status, data);
  checkResponse(res, data, "fetching holdings");
  return data;
}

export async function fetchShoonyaPositions(userId: string, accountId: string, accessToken: string) {
  const url     = "https://api.shoonya.com/NorenWClientAPI/PositionBook";
  const payload = "jData=" + JSON.stringify({ uid: userId, actid: accountId });
  console.log(`[Shoonya] → fetchShoonyaPositions  uid=${userId} actid=${accountId}`);
  const res  = await fetch(url, { method: "POST", headers: getOAuthHeaders(accessToken), body: payload });
  const data = await res.json();
  shoonyaLog("fetchShoonyaPositions", url, res.status, data);
  checkResponse(res, data, "fetching positions");
  return data;
}

export async function fetchShoonyaOrders(userId: string, accessToken: string) {
  const url     = "https://api.shoonya.com/NorenWClientAPI/OrderBook";
  const payload = "jData=" + JSON.stringify({ ordersource: "API", uid: userId });
  console.log(`[Shoonya] → fetchShoonyaOrders  uid=${userId}`);
  const res  = await fetch(url, { method: "POST", headers: getOAuthHeaders(accessToken), body: payload });
  const data = await res.json();
  shoonyaLog("fetchShoonyaOrders", url, res.status, data);
  checkResponse(res, data, "fetching orders");
  return data;
}

export async function fetchShoonyaQuote(userId: string, exchange: string, token: string, accessToken: string) {
  const url     = "https://api.shoonya.com/NorenWClientAPI/GetQuotes";
  const payload = "jData=" + JSON.stringify({ uid: userId, exch: exchange, token });
  console.log(`[Shoonya] → fetchShoonyaQuote  uid=${userId} exch=${exchange} token=${token}`);
  const res  = await fetch(url, { method: "POST", headers: getOAuthHeaders(accessToken), body: payload });
  const data = await res.json();
  const ltp  = data?.lp ?? "–";
  const pc   = data?.pc ?? "–";
  shoonyaLog("fetchShoonyaQuote", url, res.status, data);
  checkResponse(res, data, `fetching quote for ${exchange}:${token}`);
  if (data?.stat === "Ok") {
    console.log(`[Shoonya]   LTP ${exchange}:${token} = ₹${ltp}  (${pc >= 0 ? "+" : ""}${pc}%)`);
  }
  return data;
}

// Force Turbopack Cache Invalidation

