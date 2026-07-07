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
  refreshPortfolio: () => Promise<void>;
  refreshOrders: () => Promise<void>;
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
  const [refreshingPortfolio, setRefreshingPortfolio] = useState(false);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Effects are declared below helper functions to avoid lint immutability issues

  const getHeaders = () => {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    router.push("/dashboard");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    router.push("/login");
  };

  const fetchWatchlist = async () => {
    try {
      const [watchlistRes, groupsRes] = await Promise.all([
        fetch("/api/watchlist", { headers: getHeaders() }),
        fetch("/api/watchlist?groups=true", { headers: getHeaders() }),
      ]);
      if (watchlistRes.ok) {
        setWatchlist(await watchlistRes.json());
      }
      if (groupsRes.ok) {
        setGroups(await groupsRes.json());
      }
    } catch (err) {
      console.error("Fetch watchlist error:", err);
    }
  };

  const fetchPortfolio = async () => {
    setRefreshingPortfolio(true);
    try {
      const res = await fetch("/api/portfolio", { headers: getHeaders() });
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
      const res = await fetch("/api/orders", { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
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

    // Defer state updates to avoid synchronous setState inside useEffect
    setTimeout(() => {
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
      if (storedMode) {
        setAppMode(storedMode);
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
  }, [token]);

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
        login,
        logout,
        addToWatchlist,
        removeFromWatchlist,
        createGroup,
        renameGroup,
        deleteGroup,
        submitOrder,
        cancelOrder,
        refreshPortfolio: fetchPortfolio,
        refreshOrders: fetchOrders,
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
