"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Navbar } from "@/components/Navbar";
import { Loader2, TrendingUp, LayoutDashboard, ClipboardList, BookOpen, ArrowLeftRight, RefreshCw } from "lucide-react";

interface Position {
  id: string;
  symbol: string;
  buyQty: number;
  sellQty: number;
  netQty: number;
  avgBuy: number;
  avgSell: number;
  ltp: number;
  invested: number;
  marketValue: number;
  unrealizedPl: number;
  realizedPl: number;
}

const subNavLinks = [
  { href: "/paper-trading", label: "Dashboard", icon: LayoutDashboard },
  { href: "/paper-trading/orders", label: "Orders", icon: ClipboardList },
  { href: "/paper-trading/positions", label: "Positions", icon: TrendingUp },
  { href: "/paper-trading/holdings", label: "Holdings", icon: BookOpen },
  { href: "/paper-trading/trades", label: "Trades", icon: ArrowLeftRight },
];

export default function PositionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, loading } = useApp();
  const [positions, setPositions] = useState<Position[]>([]);
  const [fetching, setFetching] = useState(true);

  const fetchPositions = async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/paper/positions", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch positions");
      const json = await res.json();
      setPositions(Array.isArray(json) ? json : json.positions || []);
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
    if (token) fetchPositions();
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
            <TrendingUp className="w-5 h-5 text-emerald-400" />
            Positions
          </h1>
          <button
            onClick={fetchPositions}
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
        ) : positions.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
            <TrendingUp className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-xs text-slate-500 font-semibold">No open positions</p>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="divide-x divide-slate-800/40">
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Symbol</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Buy Qty</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Sell Qty</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Net Qty</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Avg Buy</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Avg Sell</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">LTP</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Invested</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Market Value</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Unrealized P&L</th>
                    <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Realized P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {positions.map((pos) => (
                    <tr key={pos.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="text-xs text-slate-200 font-semibold px-4 py-3">{pos.symbol}</td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">{pos.buyQty}</td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">{pos.sellQty}</td>
                      <td className={`text-xs font-bold px-4 py-3 text-right font-mono ${pos.netQty >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {pos.netQty}
                      </td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">
                        ₹{pos.avgBuy.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">
                        ₹{pos.avgSell.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">
                        ₹{pos.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">
                        ₹{pos.invested.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">
                        ₹{pos.marketValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`text-xs font-bold px-4 py-3 text-right font-mono ${pos.unrealizedPl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ₹{pos.unrealizedPl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`text-xs font-bold px-4 py-3 text-right font-mono ${pos.realizedPl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ₹{pos.realizedPl.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
