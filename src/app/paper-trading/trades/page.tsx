"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Navbar } from "@/components/Navbar";
import { Loader2, ArrowLeftRight, LayoutDashboard, ClipboardList, TrendingUp, BookOpen, RefreshCw } from "lucide-react";

interface Trade {
  id: string;
  symbol: string;
  side: string;
  price: number;
  quantity: number;
  tradeTime: string;
}

const subNavLinks = [
  { href: "/paper-trading", label: "Dashboard", icon: LayoutDashboard },
  { href: "/paper-trading/orders", label: "Orders", icon: ClipboardList },
  { href: "/paper-trading/positions", label: "Positions", icon: TrendingUp },
  { href: "/paper-trading/holdings", label: "Holdings", icon: BookOpen },
  { href: "/paper-trading/trades", label: "Trades", icon: ArrowLeftRight },
];

export default function TradesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, loading } = useApp();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [fetching, setFetching] = useState(true);

  const fetchTrades = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/paper/trades", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch trades");
      const json = await res.json();
      setTrades(Array.isArray(json) ? json : json.trades || []);
    } catch {
      // silent
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
      return;
    }
    if (token) fetchTrades();
  }, [token, loading]);

  if (loading || !token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-screen">
      <Navbar />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto flex flex-col gap-6">
        <div className="flex border-b border-slate-800">
          {subNavLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                  isActive
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </a>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
            Trades
          </h1>
          <button
            onClick={fetchTrades}
            disabled={fetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 rounded-lg transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${fetching ? "animate-spin text-emerald-400" : ""}`} />
            Refresh
          </button>
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : trades.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
            <ArrowLeftRight className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs text-slate-500 font-semibold">No trades yet</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="divide-x divide-slate-800/40">
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Symbol</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Side</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Price</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Qty</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Trade Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {trades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="text-xs text-slate-200 font-semibold px-4 py-3">{trade.symbol}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-bold ${trade.side === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>
                          {trade.side}
                        </span>
                      </td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">
                        ₹{trade.price.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right">{trade.quantity}</td>
                      <td className="text-xs text-slate-400 px-4 py-3 text-right">
                        {new Date(trade.tradeTime).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
