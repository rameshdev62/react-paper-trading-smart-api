"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Loader2,
  Download,
  RefreshCw,
  BarChart3,
  PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
  AlertTriangle,
} from "lucide-react";

interface WinLossStats {
  totalTrades: number;
  totalSells: number;
  wins: number;
  losses: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | string;
}

interface PnlSummary {
  totalRealizedPl: number;
  totalUnrealizedPl: number;
  netPl: number;
}

interface EquityPoint {
  timestamp: string;
  totalValue: number;
  cashBalance: number;
}

interface DailyPl {
  date: string;
  pnl: number;
}

interface AllocationSlice {
  symbol: string;
  value: number;
  percent: number;
}

interface HoldingPerformance {
  symbol: string;
  exchange: string;
  quantity: number;
  averagePrice: number;
  ltp: number;
  currentValue: number;
  costBasis: number;
  unrealizedPl: number;
  plPercent: number;
}

interface OrderExport {
  id: string;
  symbol: string;
  exchange: string;
  transactionType: string;
  orderType: string;
  productType: string;
  quantity: number;
  price: number;
  status: string;
  rejectReason: string;
  createdAt: string;
  completedAt: string;
}

interface AnalyticsData {
  winLoss: WinLossStats;
  pnl: PnlSummary;
  equityCurve: EquityPoint[];
  dailyPl: DailyPl[];
  allocation: AllocationSlice[];
  topPerformers: HoldingPerformance[];
  worstPerformers: HoldingPerformance[];
  ordersForExport: OrderExport[];
}

const PIE_COLORS = [
  "#10b981", "#06b6d4", "#8b5cf6", "#f59e0b", "#ef4444",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
  "#64748b", // Cash (last)
];

const fmt = (val: number) =>
  "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export const AnalyticsDashboard: React.FC = () => {
  const { token } = useApp();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/analytics", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      setData(await res.json());
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportOrders = () => {
    if (!data) return;
    const headers = ["ID", "Symbol", "Exchange", "Side", "Type", "Product", "Qty", "Price", "Status", "Reject Reason", "Created At", "Completed At"];
    const rows = data.ordersForExport.map((o) => [
      o.id, o.symbol, o.exchange, o.transactionType, o.orderType, o.productType,
      String(o.quantity), String(o.price), o.status, o.rejectReason,
      new Date(o.createdAt).toLocaleString(), o.completedAt ? new Date(o.completedAt).toLocaleString() : "",
    ]);
    downloadCSV(`orders_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
  };

  const handleExportTrades = () => {
    if (!data) return;
    // Export only completed trades
    const completedOrders = data.ordersForExport.filter((o) => o.status === "COMPLETED");
    const headers = ["Symbol", "Exchange", "Side", "Type", "Qty", "Price", "Completed At"];
    const rows = completedOrders.map((o) => [
      o.symbol, o.exchange, o.transactionType, o.orderType,
      String(o.quantity), String(o.price),
      o.completedAt ? new Date(o.completedAt).toLocaleString() : "",
    ]);
    downloadCSV(`trades_${new Date().toISOString().split("T")[0]}.csv`, headers, rows);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/10 border border-rose-500/25 text-rose-400 px-4 py-3 rounded-lg text-xs font-semibold">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { winLoss, pnl, equityCurve, dailyPl, allocation, topPerformers, worstPerformers } = data;
  const isNetPositive = pnl.netPl >= 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header with refresh and export buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          Performance Analytics
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportOrders}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 rounded-lg transition-all cursor-pointer"
          >
            <Download className="w-3 h-3" />
            Export Orders CSV
          </button>
          <button
            onClick={handleExportTrades}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-cyan-400 hover:bg-cyan-500/10 border border-slate-800 hover:border-cyan-500/20 rounded-lg transition-all cursor-pointer"
          >
            <Download className="w-3 h-3" />
            Export Trades CSV
          </button>
          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 rounded-lg transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin text-emerald-400" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ─── P&L Summary Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Realized P&L</span>
            <div className={`p-1.5 rounded-md ${pnl.totalRealizedPl >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
              {pnl.totalRealizedPl >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            </div>
          </div>
          <h3 className={`text-xl font-extrabold tracking-wide ${pnl.totalRealizedPl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(pnl.totalRealizedPl)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">From closed positions</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Unrealized P&L</span>
            <div className={`p-1.5 rounded-md ${pnl.totalUnrealizedPl >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
              {pnl.totalUnrealizedPl >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            </div>
          </div>
          <h3 className={`text-xl font-extrabold tracking-wide ${pnl.totalUnrealizedPl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(pnl.totalUnrealizedPl)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Open holdings at LTP</p>
        </div>

        <div className={`bg-slate-900 border rounded-xl p-5 shadow-lg ${isNetPositive ? "border-emerald-500/30" : "border-rose-500/30"}`}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Net P&L</span>
            <div className={`p-1.5 rounded-md ${isNetPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
              {isNetPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            </div>
          </div>
          <h3 className={`text-2xl font-extrabold tracking-wide ${isNetPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(pnl.netPl)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1">Realized + Unrealized</p>
        </div>
      </div>

      {/* ─── Win/Loss Stats ──────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
        <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-400" />
          Win / Loss Statistics
        </h3>
        {winLoss.totalTrades === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs font-semibold">
            No completed trades yet. Place and close some trades to see statistics.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Trades</span>
              <span className="text-lg font-extrabold text-slate-100">{winLoss.totalTrades}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Win Rate</span>
              <div className="flex items-center gap-2">
                <span className={`text-lg font-extrabold ${winLoss.winRate >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                  {winLoss.winRate}%
                </span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden max-w-[100px]">
                  <div
                    className={`h-full rounded-full transition-all ${winLoss.winRate >= 50 ? "bg-emerald-500" : "bg-rose-500"}`}
                    style={{ width: `${Math.min(winLoss.winRate, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Wins / Losses</span>
              <span className="text-lg font-extrabold text-slate-100">
                <span className="text-emerald-400">{winLoss.wins}</span>
                <span className="text-slate-600 mx-1">/</span>
                <span className="text-rose-400">{winLoss.losses}</span>
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Profit Factor</span>
              <span className={`text-lg font-extrabold ${(typeof winLoss.profitFactor === "string" || winLoss.profitFactor >= 1) ? "text-emerald-400" : "text-rose-400"}`}>
                {winLoss.profitFactor}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Avg Win</span>
              <span className="text-sm font-bold text-emerald-400">{fmt(winLoss.avgWin)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Avg Loss</span>
              <span className="text-sm font-bold text-rose-400">{fmt(winLoss.avgLoss)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Equity Curve ────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
        <div>
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Equity Curve
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Portfolio value over time</p>
        </div>
        {equityCurve.length < 2 ? (
          <div className="py-12 text-center text-slate-500 text-xs font-semibold">
            Not enough data points yet. Complete some trades to build the equity curve.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityCurve} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="timestamp"
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                />
                <YAxis
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={["dataMin - 5000", "dataMax + 5000"]}
                  tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "bold", fontSize: "11px" }}
                  itemStyle={{ color: "#10b981", fontSize: "12px", fontWeight: "bold" }}
                  labelFormatter={(v) => new Date(v).toLocaleString("en-IN")}
                  formatter={(v: any) => [fmt(parseFloat(v)), "Portfolio Value"]}
                />
                <Area type="monotone" dataKey="totalValue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#equityGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ─── Daily P&L Bar Chart ──────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
        <div>
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            Daily Realized P&L
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Profit and loss from closed trades per day</p>
        </div>
        {dailyPl.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs font-semibold">
            No daily P&L data yet. Close some trades to see daily performance.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPl} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getDate()}/${d.getMonth() + 1}`;
                  }}
                />
                <YAxis
                  stroke="#475569"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `₹${v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}K` : v}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                  labelStyle={{ color: "#94a3b8", fontWeight: "bold", fontSize: "11px" }}
                  itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                  formatter={(v: any) => [fmt(parseFloat(v)), "P&L"]}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {dailyPl.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? "#10b981" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ─── Bottom Row: Allocation Pie + Top/Worst Performers ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Holdings Allocation Pie Chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
          <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-purple-400" />
            Portfolio Allocation
          </h3>
          {allocation.length <= 1 ? (
            <div className="py-12 text-center text-slate-500 text-xs font-semibold">
              No holdings to display. Your portfolio is 100% cash.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="value"
                    nameKey="symbol"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {allocation.map((_, index) => (
                      <Cell key={`pie-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                    itemStyle={{ fontSize: "12px", fontWeight: "bold" }}
                    formatter={(v: any, name: any) => [fmt(parseFloat(v)), name]}
                  />
                  <Legend
                    iconSize={8}
                    iconType="circle"
                    formatter={(value: string) => (
                      <span className="text-[11px] text-slate-400 font-semibold">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top & Worst Performers */}
        <div className="flex flex-col gap-4">
          {/* Top Performers */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex-1">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              Top Performers
            </h3>
            {topPerformers.length === 0 ? (
              <p className="text-xs text-slate-500 font-semibold text-center py-4">No holdings yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {topPerformers.map((h) => (
                  <div key={h.symbol} className="flex items-center justify-between px-3 py-2 bg-slate-800/30 rounded-lg">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-200">{h.symbol}</span>
                      <span className="text-[10px] text-slate-500">{h.exchange} · Qty: {h.quantity}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-xs font-bold ${h.unrealizedPl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {fmt(h.unrealizedPl)}
                      </span>
                      <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${h.plPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {h.plPercent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {h.plPercent >= 0 ? "+" : ""}{h.plPercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Worst Performers */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex-1">
            <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
              Worst Performers
            </h3>
            {worstPerformers.length === 0 ? (
              <p className="text-xs text-slate-500 font-semibold text-center py-4">No holdings yet</p>
            ) : (
              <div className="flex flex-col gap-2">
                {worstPerformers.map((h) => (
                  <div key={h.symbol} className="flex items-center justify-between px-3 py-2 bg-slate-800/30 rounded-lg">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-200">{h.symbol}</span>
                      <span className="text-[10px] text-slate-500">{h.exchange} · Qty: {h.quantity}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-xs font-bold ${h.unrealizedPl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {fmt(h.unrealizedPl)}
                      </span>
                      <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${h.plPercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {h.plPercent >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {h.plPercent >= 0 ? "+" : ""}{h.plPercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
