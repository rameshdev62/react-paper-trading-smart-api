"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Navbar } from "@/components/Navbar";
import { PaperTradeForm } from "@/components/PaperTradeForm";
import { Loader2, LayoutDashboard, ClipboardList, TrendingUp, BookOpen, ArrowLeftRight, Wallet, Grip, DollarSign, BarChart3, RefreshCw } from "lucide-react";

interface DashboardData {
  account: {
    balance: number;
    availableBalance: number;
    usedMargin: number;
    totalPnl: number;
    realizedPnl: number;
    unrealizedPnl: number;
  };
  positions: Array<Record<string, unknown>>;
  todayTrades: Array<{
    id: string;
    symbol: string;
    side: string;
    price: number;
    quantity: number;
    tradeTime: string;
  }>;
  openOrders: Array<{
    id: string;
    symbol: string;
    side: string;
    type: string;
    quantity: number;
    price: number;
    status: string;
    createdAt: string;
  }>;
}

const subNavLinks = [
  { href: "/paper-trading", label: "Dashboard", icon: LayoutDashboard },
  { href: "/paper-trading/orders", label: "Orders", icon: ClipboardList },
  { href: "/paper-trading/positions", label: "Positions", icon: TrendingUp },
  { href: "/paper-trading/holdings", label: "Holdings", icon: BookOpen },
  { href: "/paper-trading/trades", label: "Trades", icon: ArrowLeftRight },
];

function SubNav() {
  const pathname = usePathname();

  return (
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
  );
}

export default function PaperTradingPage() {
  const router = useRouter();
  const { token, loading } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboard = async () => {
    try {
      const res = await fetch("/api/paper/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      const json = await res.json();
      setData(json);
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
      return;
    }
    if (token) fetchDashboard();
  }, [token, loading]);

  if (loading || !token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  const formatINR = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const account = data?.account;

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-screen">
      <Navbar />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto flex flex-col gap-6">
        <SubNav />

        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-emerald-400" />
            Paper Trading Dashboard
          </h1>
          <button
            onClick={fetchDashboard}
            disabled={fetching}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 rounded-lg transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${fetching ? "animate-spin text-emerald-400" : ""}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 px-4 py-3 rounded-lg text-xs font-semibold">
            {error}
          </div>
        )}

        {fetching && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <>
            {account && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400" /> Balance
                  </span>
                  <span className="text-xl font-bold text-slate-100">{formatINR(account.balance)}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Available Margin
                  </span>
                  <span className="text-xl font-bold text-slate-100">{formatINR(account.availableBalance)}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Grip className="w-3.5 h-3.5 text-amber-400" /> Used Margin
                  </span>
                  <span className="text-xl font-bold text-slate-100">{formatINR(account.usedMargin)}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5 text-emerald-400" /> Total P&L
                  </span>
                  <span className={`text-xl font-bold ${account.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatINR(account.totalPnl)}
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 flex flex-col gap-6">
                {data?.todayTrades && data.todayTrades.length > 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-800">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Today&apos;s Trades</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="divide-x divide-slate-800/40">
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Symbol</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Side</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Price</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Qty</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {data.todayTrades.map((trade) => (
                            <tr key={trade.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="text-xs text-slate-200 font-semibold px-4 py-3">{trade.symbol}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`text-xs font-bold ${
                                    trade.side === "BUY" ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {trade.side}
                                </span>
                              </td>
                              <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">{formatINR(trade.price)}</td>
                              <td className="text-xs text-slate-200 px-4 py-3 text-right">{trade.quantity}</td>
                              <td className="text-xs text-slate-400 px-4 py-3 text-right">
                                {new Date(trade.tradeTime).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
                    <ArrowLeftRight className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 font-semibold">No trades today</p>
                  </div>
                )}

                {data?.openOrders && data.openOrders.length > 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-800">
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Open Orders</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="divide-x divide-slate-800/40">
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Symbol</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Side</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-left">Type</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Qty</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Price</th>
                            <th className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-4 py-3 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {data.openOrders.map((order) => (
                            <tr key={order.id} className="hover:bg-slate-800/30 transition-colors">
                              <td className="text-xs text-slate-200 font-semibold px-4 py-3">{order.symbol}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`text-xs font-bold ${
                                    order.side === "BUY" ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {order.side}
                                </span>
                              </td>
                              <td className="text-xs text-slate-200 px-4 py-3">{order.type}</td>
                              <td className="text-xs text-slate-200 px-4 py-3 text-right">{order.quantity}</td>
                              <td className="text-xs text-slate-200 px-4 py-3 text-right font-mono">{formatINR(order.price)}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                  {order.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-lg">
                    <ClipboardList className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-500 font-semibold">No open orders</p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-1">
                <PaperTradeForm />
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
