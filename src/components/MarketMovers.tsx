"use client";

import React, { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCw, Loader2, LineChart, List } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { toTradingViewSymbol } from "./TradingViewChart";

interface MoverStock {
  token: string;
  symbol: string;
  name: string;
  exchange: string;
  ltp: number;
  changePercent: number;
  open: number;
  close: number;
}

interface MarketMoversProps {
  onSelectInstrument?: (inst: { symbol: string; token: string; exchange: string }) => void;
}

const MoverRow: React.FC<{
  stock: MoverStock;
  onClick?: () => void;
}> = ({ stock, onClick }) => {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPrice = useRef(stock.ltp);

  useEffect(() => {
    if (stock.ltp > prevPrice.current) {
      setFlash("up");
      const timer = setTimeout(() => setFlash(null), 800);
      prevPrice.current = stock.ltp;
      return () => clearTimeout(timer);
    } else if (stock.ltp < prevPrice.current) {
      setFlash("down");
      const timer = setTimeout(() => setFlash(null), 800);
      prevPrice.current = stock.ltp;
      return () => clearTimeout(timer);
    }
  }, [stock.ltp]);

  const isPositive = stock.changePercent >= 0;

  const bgFlashClass = 
    flash === "up" 
      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
      : flash === "down" 
      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
      : "bg-transparent border border-transparent";

  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/40 cursor-pointer transition-all duration-300 group ${bgFlashClass}`}
    >
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-100 tracking-wide">{stock.symbol.replace("-EQ", "")}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 font-semibold uppercase">
            {stock.exchange === "nse_cm" || stock.exchange === "NSE" ? "NSE" : "BSE"}
          </span>
        </div>
        <span className="text-[10px] text-slate-500 truncate max-w-[150px] mt-0.5">{stock.name}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0 text-right">
        <div className="flex flex-col items-end">
          <span className="text-xs font-bold text-slate-200 font-mono">{stock.ltp ? `₹${stock.ltp.toFixed(2)}` : "-"}</span>
          <span
            className={`text-[10px] font-bold mt-0.5 flex items-center gap-0.5 ${
              isPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%
          </span>
        </div>
        <a
          href={`https://www.tradingview.com/chart/3NjDmwlc/?symbol=${encodeURIComponent(toTradingViewSymbol(stock.symbol, stock.exchange === "nse_cm" || stock.exchange === "NSE" ? "NSE" : "BSE"))}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open TradingView Chart"
          className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/5 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <LineChart className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
};

export const MarketMovers: React.FC<MarketMoversProps> = ({ onSelectInstrument }) => {
  const { prices, token, appMode } = useApp();
  const [activeTab, setActiveTab] = useState<"gainers" | "losers" | "nifty50">("gainers");
  const [gainers, setGainers] = useState<MoverStock[]>([]);
  const [losers, setLosers] = useState<MoverStock[]>([]);
  const [nifty50, setNifty50] = useState<MoverStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const fetchMovers = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`/api/market/gainers-losers?mode=${appMode}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch market movers");
      const data = await res.json();
      setGainers(data.gainers || []);
      setLosers(data.losers || []);
      setNifty50(data.nifty50 || []);
      setError("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to load market trends");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchMovers();
    }
  }, [token, appMode]);

  const getLiveMovers = (list: MoverStock[], sortType: "gainers" | "losers" | "nifty50") => {
    const liveList = list.map((item) => {
      const livePrice = prices[item.token];
      if (livePrice) {
        return {
          ...item,
          ltp: livePrice.ltp,
          changePercent: livePrice.changePercent,
        };
      }
      return item;
    });

    return [...liveList].sort((a, b) => {
      if (sortType === "nifty50") {
        return a.symbol.localeCompare(b.symbol);
      }
      return sortType === "gainers"
        ? b.changePercent - a.changePercent
        : a.changePercent - b.changePercent;
    });
  };

  const displayedList = activeTab === "gainers" 
    ? getLiveMovers(gainers, "gainers") 
    : activeTab === "losers"
    ? getLiveMovers(losers, "losers")
    : getLiveMovers(nifty50, "nifty50");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4 h-full min-h-[420px]">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">Market Movers</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Top gainers and losers of the day</p>
        </div>
        <button
          onClick={() => fetchMovers(true)}
          disabled={loading || refreshing}
          className="p-1.5 rounded-lg border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-all cursor-pointer disabled:opacity-50"
          title="Refresh Movers"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-emerald-400" : ""}`} />
        </button>
      </div>

      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setActiveTab("gainers")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            activeTab === "gainers"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Gainers
        </button>
        <button
          onClick={() => setActiveTab("losers")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            activeTab === "losers"
              ? "border-rose-500 text-rose-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          Losers
        </button>
        <button
          onClick={() => setActiveTab("nifty50")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 cursor-pointer transition-all ${
            activeTab === "nifty50"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <List className="w-3.5 h-3.5" />
          Nifty 50
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-[320px] scrollbar-thin">
        {loading && !refreshing ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
            <span className="text-[11px] text-slate-500 mt-2 font-semibold">Fetching trends...</span>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-4 text-center text-rose-400 text-xs">
            <p className="font-semibold mb-1">Failed to load movers</p>
            <p className="text-[10px] text-slate-500">{error}</p>
          </div>
        ) : displayedList.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20 text-xs text-slate-500">
            No data available
          </div>
        ) : (
          displayedList.map((stock) => (
            <MoverRow
              key={stock.token}
              stock={stock}
              onClick={() =>
                onSelectInstrument &&
                onSelectInstrument({
                  symbol: stock.symbol,
                  token: stock.token,
                  exchange: stock.exchange === "nse_cm" || stock.exchange === "NSE" ? "NSE" : "BSE",
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
};
