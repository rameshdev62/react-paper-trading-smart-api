"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string | null;
  email: string;
  balance: number;
}

interface WatchlistItem {
  id: string;
  symbol: string;
  token: string;
  exchange: string;
  group: string;
}

interface WatchlistGroup {
  name: string;
  count: number;
}

interface Holding {
  id: string;
  symbol: string;
  token: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  currentValue: number;
  costBasis: number;
  unrealizedPl: number;
  plPercentage: number;
}

interface Order {
  id: string;
  symbol: string;
  token: string;
  exchange: string;
  quantity: number;
  price: number;
  orderType: string;
  transactionType: string;
  productType: string;
  status: string;
  rejectReason: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface PriceData {
  ltp: number;
  changePercent: number;
  open: number;
  close: number;
}

interface AppContextType {
  user: User | null;
  token: string | null;
  watchlist: WatchlistItem[];
  groups: WatchlistGroup[];
  holdings: Holding[];
  orders: Order[];
  prices: Record<string, PriceData>;
  portfolioSummary: {
    cashBalance: number;
    totalPortfolioValue: number;
    totalHoldingsCost: number;
    totalHoldingsValue: number;
    totalUnrealizedPl: number;
    overallPlPercentage: number;
  } | null;
  loading: boolean;
  appMode: "mock" | "live";
  setAppMode: (mode: "mock" | "live") => void;
  shoonyaSession: {
    accessToken: string;
    userId: string;
    accountId: string;
    susertoken: string;
  } | null;
  loginToShoonya: (authCode?: string, secretCode?: string, clientId?: string, userId?: string, auto?: boolean) => Promise<void>;
  disconnectShoonya: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  addToWatchlist: (symbol: string, token: string, exchange: string, group?: string) => Promise<void>;
  removeFromWatchlist: (token: string, exchange: string, group?: string) => Promise<void>;
  createGroup: (name: string) => Promise<void>;
  renameGroup: (oldName: string, newName: string) => Promise<void>;
  deleteGroup: (name: string) => Promise<void>;
  submitOrder: (orderData: {
    symbol: string;
    token: string;
    exchange: string;
    quantity: number;
    price: number;
    orderType: "MARKET" | "LIMIT" | "SL";
    transactionType: "BUY" | "SELL";
    productType: "INTRADAY" | "DELIVERY";
  }) => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  refreshWatchlist: () => Promise<void>;
  refreshWatchlistLtp: () => Promise<void>;
  refreshingWatchlistLtp: boolean;
  refreshPortfolio: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshingWatchlist: boolean;
  refreshingPortfolio: boolean;
  refreshingOrders: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [groups, setGroups] = useState<WatchlistGroup[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [portfolioSummary, setPortfolioSummary] = useState<AppContextType["portfolioSummary"]>(null);
  const [loading, setLoading] = useState(true);
  const [appMode, setAppMode] = useState<"mock" | "live">("mock");
  const [shoonyaSession, setShoonyaSession] = useState<AppContextType["shoonyaSession"]>(null);
  const [refreshingWatchlist, setRefreshingWatchlist] = useState(false);
  const [refreshingPortfolio, setRefreshingPortfolio] = useState(false);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Effects are declared below helper functions to avoid lint immutability issues

  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    if (appMode === "live" && shoonyaSession) {
      headers["x-shoonya-access-token"] = shoonyaSession.accessToken;
      headers["x-shoonya-user-id"] = shoonyaSession.userId;
      headers["x-shoonya-account-id"] = shoonyaSession.accountId;
    }
    return headers;
  };

  const login = async (email: string, password: string) => {
    console.log("[AppContext] Logging in via server-side handler for:", email);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[AppContext] Server-side login failed:", data.error);
      throw new Error(data.error || "Login failed");
    }

    console.log("[AppContext] Server-side login successful! User:", data.user.name);

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    router.push("/dashboard");
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout API error:", err);
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("shoonya_session");
    setToken(null);
    setUser(null);
    setShoonyaSession(null);
    setAppMode("mock");
    document.cookie = "shoonya_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.push("/login");
  };

  const loginToShoonya = async (authCode?: string, secretCode?: string, clientId?: string, userId?: string, auto?: boolean) => {
    const res = await fetch("/api/shoonya/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto, authCode, secretCode, clientId, userId }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to authenticate with Shoonya");
    }

    if (data.session) {
      setShoonyaSession(data.session);
      localStorage.setItem("shoonya_session", JSON.stringify(data.session));
      localStorage.setItem("appMode", "live");
      setAppMode("live");
      router.refresh();
    }
  };

  const disconnectShoonya = () => {
    setShoonyaSession(null);
    localStorage.removeItem("shoonya_session");
    localStorage.setItem("appMode", "mock");
    setAppMode("mock");
    document.cookie = "shoonya_session=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
    router.refresh();
  };

  const fetchWatchlist = async () => {
    setRefreshingWatchlist(true);
    try {
      const [watchlistRes, groupsRes] = await Promise.all([
        fetch(`/api/watchlist?mode=${appMode}`, { headers: getHeaders() }),
        fetch(`/api/watchlist?groups=true&mode=${appMode}`, { headers: getHeaders() }),
      ]);
      if (watchlistRes.status === 401 || groupsRes.status === 401) {
        if (appMode === "live") {
          console.warn("[AppContext] Shoonya session expired or unauthorized on fetchWatchlist, disconnecting...");
          disconnectShoonya();
          return;
        }
      }
      if (watchlistRes.ok) {
        setWatchlist(await watchlistRes.json());
      }
      if (groupsRes.ok) {
        setGroups(await groupsRes.json());
      }
    } catch (err) {
      console.error("Fetch watchlist error:", err);
    } finally {
      setRefreshingWatchlist(false);
    }
  };

  const [refreshingWatchlistLtp, setRefreshingWatchlistLtp] = useState(false);

  const refreshWatchlistLtp = async () => {
    if (appMode !== "live" || !shoonyaSession) {
      // In mock mode, just re-fetch watchlist data (no Shoonya call)
      await fetchWatchlist();
      return;
    }
    setRefreshingWatchlistLtp(true);
    try {
      // Fetch current watchlist items from state
      const items = watchlist.filter((w) => w.token && w.exchange);
      if (items.length === 0) return;

      console.log(`[Watchlist LTP Refresh] Fetching LTPs for ${items.length} items via Shoonya GetQuotes...`);

      await Promise.allSettled(
        items.map(async (item) => {
          try {
            const res = await fetch(
              `/api/market/quote?exchange=${item.exchange}&token=${item.token}`,
              { headers: getHeaders() }
            );
            if (res.ok) {
              const data = await res.json();
              console.log(`[Watchlist LTP Refresh] ${item.symbol} (${item.exchange}:${item.token}) LTP: ₹${data.ltp}`);
            } else {
              const err = await res.json();
              console.warn(`[Watchlist LTP Refresh] ${item.symbol}: ${err.error}`);
            }
          } catch (e: any) {
            console.warn(`[Watchlist LTP Refresh] ${item.symbol} failed:`, e.message);
          }
        })
      );
    } finally {
      setRefreshingWatchlistLtp(false);
    }
  };

  const fetchPortfolio = async () => {
    setRefreshingPortfolio(true);
    try {
      const res = await fetch(`/api/portfolio?mode=${appMode}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setHoldings(data.holdings);
        setPortfolioSummary({
          cashBalance: data.cashBalance,
          totalPortfolioValue: data.totalPortfolioValue,
          totalHoldingsCost: data.totalHoldingsCost,
          totalHoldingsValue: data.totalHoldingsValue,
          totalUnrealizedPl: data.totalUnrealizedPl,
          overallPlPercentage: data.overallPlPercentage,
        });

        // Update user balance in context
        if (user && user.balance !== data.cashBalance) {
          const updatedUser = { ...user, balance: data.cashBalance };
          setUser(updatedUser);
          localStorage.setItem("user", JSON.stringify(updatedUser));
        }
      } else if (res.status === 401 && appMode === "live") {
        console.warn("[AppContext] Shoonya session expired or unauthorized on fetchPortfolio, disconnecting...");
        disconnectShoonya();
      }
    } catch (err) {
      console.error("Fetch portfolio error:", err);
    } finally {
      setRefreshingPortfolio(false);
    }
  };

  const fetchOrders = async () => {
    setRefreshingOrders(true);
    try {
      const res = await fetch(`/api/orders?mode=${appMode}`, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      } else if (res.status === 401 && appMode === "live") {
        console.warn("[AppContext] Shoonya session expired or unauthorized on fetchOrders, disconnecting...");
        disconnectShoonya();
      }
    } catch (err) {
      console.error("Fetch orders error:", err);
    } finally {
      setRefreshingOrders(false);
    }
  };

  const addToWatchlist = async (symbol: string, token: string, exchange: string, group?: string) => {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ symbol, token, exchange, group, mode: appMode }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to add to watchlist");
    }
    await fetchWatchlist();
  };

  const removeFromWatchlist = async (token: string, exchange: string, group?: string) => {
    const params = new URLSearchParams({ token, exchange, mode: appMode });
    if (group) params.set("group", group);
    const res = await fetch(`/api/watchlist?${params}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to remove from watchlist");
    }
    await fetchWatchlist();
  };

  const createGroup = async (_name: string) => {
    // Groups are created implicitly when the first item is added.
    // This just refetches to ensure the UI is up to date.
    await fetchWatchlist();
  };

  const renameGroup = async (oldName: string, newName: string) => {
    const res = await fetch("/api/watchlist/rename", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ oldName, newName }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to rename group");
    }
    await fetchWatchlist();
  };

  const deleteGroup = async (name: string) => {
    if (name === "Default") {
      throw new Error("Cannot delete the Default group");
    }
    const params = new URLSearchParams({ group: name, mode: appMode });
    const res = await fetch(`/api/watchlist/groups?${params}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to delete group");
    }
    await fetchWatchlist();
  };

  const submitOrder = async (orderData: {
    symbol: string;
    token: string;
    exchange: string;
    quantity: number;
    price: number;
    orderType: "MARKET" | "LIMIT" | "SL";
    transactionType: "BUY" | "SELL";
    productType: "INTRADAY" | "DELIVERY";
  }) => {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(orderData),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Order execution failed");

    await fetchPortfolio();
    await fetchOrders();
  };

  const cancelOrder = async (orderId: string) => {
    const res = await fetch("/api/orders/cancel", {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ orderId }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Cancellation failed");

    await fetchPortfolio();
    await fetchOrders();
  };



  const handleSetMode = (mode: "mock" | "live") => {
    localStorage.setItem("appMode", mode);
    setAppMode(mode);
    // Refresh page state to restart feeds
    router.refresh();
  };

  // Initialize Auth State from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    const storedMode = localStorage.getItem("appMode") as "mock" | "live";
    const storedShoonya = localStorage.getItem("shoonya_session");

    // Defer state updates to avoid synchronous setState inside useEffect
    setTimeout(() => {
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
      if (storedMode) {
        setAppMode(storedMode);
      }
      if (storedShoonya) {
        try {
          setShoonyaSession(JSON.parse(storedShoonya));
        } catch {}
      }
      setLoading(false);
    }, 0);
  }, []);

  // Fetch initial data once token is set
  useEffect(() => {
    if (token) {
      fetchWatchlist();
      fetchPortfolio();
      fetchOrders();
    } else {
      // Defer state updates to avoid synchronous setState inside useEffect
      setTimeout(() => {
        setWatchlist([]);
        setHoldings([]);
        setOrders([]);
        setPortfolioSummary(null);
      }, 0);
    }
  }, [token, appMode]);

  // Connect to Real-time price feed via SSE
  useEffect(() => {
    if (!token) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    console.log("[AppContext] Connecting to market data SSE stream...");

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const sse = new EventSource(`/api/market/stream?token=${encodeURIComponent(token)}&mode=${appMode}`);
    eventSourceRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const rawPrices = JSON.parse(event.data) as Record<string, PriceData>;
        setPrices(rawPrices);
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    sse.onerror = (err) => {
      console.error("SSE connection error. Retrying...", err);
      sse.close();
    };

    return () => {
      sse.close();
      eventSourceRef.current = null;
    };
  }, [token, appMode]);

  return (
    <AppContext.Provider
      value={{
        user,
        token,
        watchlist,
        groups,
        holdings,
        orders,
        prices,
        portfolioSummary,
        loading,
        appMode,
        setAppMode: handleSetMode,
        shoonyaSession,
        loginToShoonya,
        disconnectShoonya,
        login,
        logout,
        addToWatchlist,
        removeFromWatchlist,
        createGroup,
        renameGroup,
        deleteGroup,
        submitOrder,
        cancelOrder,
        refreshWatchlist: fetchWatchlist,
        refreshWatchlistLtp,
        refreshPortfolio: fetchPortfolio,
        refreshOrders: fetchOrders,
        refreshingWatchlist,
        refreshingWatchlistLtp,
        refreshingPortfolio,
        refreshingOrders,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
