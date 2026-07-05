"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { ArrowUpRight, ArrowDownRight, Wallet, BarChart3, TrendingUp, Sparkles } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export const PortfolioSummary: React.FC = () => {
  const { portfolioSummary } = useApp();

  if (!portfolioSummary) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 h-full flex flex-col justify-center items-center text-slate-500 shadow-lg min-h-[150px]">
        <BarChart3 className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
        <span className="text-sm font-semibold">Loading portfolio metrics...</span>
      </div>
    );
  }

  const {
    cashBalance,
    totalPortfolioValue,
    totalHoldingsCost,
    totalHoldingsValue,
    totalUnrealizedPl,
    overallPlPercentage,
  } = portfolioSummary;

  const isPositive = totalUnrealizedPl >= 0;

  // Format currency helper
  const fmt = (val: number) => {
    return "₹" + val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Generate chart data
  const historyData = [
    { date: "Start", value: 1000000.0 },
    { date: "Now", value: totalPortfolioValue },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Net Asset Value */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg relative overflow-hidden group">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Net Portfolio Value</span>
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <h2 className="font-extrabold text-xl text-slate-100 tracking-wide">{fmt(totalPortfolioValue)}</h2>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Cash + Live Holdings Valuation
          </p>
        </div>

        {/* Free Cash Balance */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg relative overflow-hidden group">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Free Cash</span>
            <div className="p-1.5 rounded-md bg-sky-500/10 text-sky-400">
              <Wallet className="w-3.5 h-3.5" />
            </div>
          </div>
          <h2 className="font-extrabold text-xl text-slate-100 tracking-wide">{fmt(cashBalance)}</h2>
          <p className="text-[11px] text-slate-500 mt-1">Available for placing new orders</p>
        </div>

        {/* Holdings Value */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg relative overflow-hidden group">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Holdings Value</span>
            <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
              <BarChart3 className="w-3.5 h-3.5" />
            </div>
          </div>
          <h2 className="font-extrabold text-xl text-slate-100 tracking-wide">{fmt(totalHoldingsValue)}</h2>
          <p className="text-[11px] text-slate-500 mt-1">
            Cost Basis: <span className="text-slate-400 font-semibold">{fmt(totalHoldingsCost)}</span>
          </p>
        </div>

        {/* Total Unrealized P&L */}
        <div className={`bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg relative overflow-hidden group`}>
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Unrealized P&L</span>
            <div className={`p-1.5 rounded-md ${isPositive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
              {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            </div>
          </div>
          <h2 className={`font-extrabold text-xl tracking-wide ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
            {fmt(totalUnrealizedPl)}
          </h2>
          <p className="text-[11px] text-slate-555 mt-1">
            ROI: <span className={`font-bold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
              {isPositive ? "+" : ""}{overallPlPercentage.toFixed(2)}%
            </span>
          </p>
        </div>
      </div>

      {/* Chart Section */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg flex flex-col gap-4">
        <div>
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">Performance Equity Curve</h3>
          <p className="text-xs text-slate-500 mt-0.5">Real-time simulation history tracking</p>
        </div>

        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={historyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" stroke="#475569" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis
                stroke="#475569"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={["dataMin - 10000", "dataMax + 10000"]}
                tickFormatter={(v) => `₹${(v / 1000000).toFixed(2)}M`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                labelStyle={{ color: "#94a3b8", fontWeight: "bold", fontSize: "11px" }}
                itemStyle={{ color: "#10b981", fontSize: "12px", fontWeight: "bold" }}
                formatter={(v: any) => [fmt(parseFloat(v)), "Portfolio Value"]}
              />
              <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
