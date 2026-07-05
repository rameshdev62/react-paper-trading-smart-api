"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

interface HoldingsTableProps {
  onSelectInstrument?: (inst: { symbol: string; token: string; exchange: string }) => void;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ onSelectInstrument }) => {
  const { holdings, prices, refreshPortfolio, refreshingPortfolio } = useApp();

  const handleSelect = (h: typeof holdings[0], type: "BUY" | "SELL") => {
    if (onSelectInstrument) {
      onSelectInstrument({
        symbol: h.symbol,
        token: h.token,
        exchange: h.exchange,
      });
      // We can trigger terminal state adjustments externally, or just focus terminal
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">Open Positions & Holdings</h3>
          <p className="text-xs text-slate-500 mt-0.5">Real-time valuation of active paper investments</p>
        </div>
        <button
          onClick={refreshPortfolio}
          title="Refresh Portfolio"
          className="p-1.5 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshingPortfolio ? "animate-spin text-emerald-400" : ""}`} />
        </button>
      </div>

      {holdings.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-center">
          <p className="text-sm font-semibold text-slate-400">No active positions</p>
          <p className="text-xs text-slate-655 mt-1 max-w-xs">
            Open the trade terminal, search for a stock, and place a BUY order to start paper trading.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                <th className="pb-3">Symbol</th>
                <th className="pb-3 text-right">Qty</th>
                <th className="pb-3 text-right">Avg Price</th>
                <th className="pb-3 text-right">LTP</th>
                <th className="pb-3 text-right">Mkt Value</th>
                <th className="pb-3 text-right">P&L (Unrealized)</th>
                <th className="pb-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs text-slate-300">
              {holdings.map((h) => {
                // Dynamically fetch current LTP from priceStore via Context prices
                const priceInfo = prices[h.token];
                const liveLtp = priceInfo ? priceInfo.ltp : h.averagePrice;
                const mktVal = h.quantity * liveLtp;
                const costBasis = h.quantity * h.averagePrice;
                const plVal = mktVal - costBasis;
                const plPct = h.averagePrice > 0 ? (plVal / costBasis) * 100 : 0.0;
                const isProfit = plVal >= 0;

                return (
                  <tr key={h.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="py-3.5 font-bold text-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span>{h.symbol}</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                          {h.exchange}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 text-right font-semibold text-slate-350">{h.quantity}</td>
                    <td className="py-3.5 text-right font-medium text-slate-350">₹{h.averagePrice.toFixed(2)}</td>
                    <td className="py-3.5 text-right font-bold text-slate-200">₹{liveLtp.toFixed(2)}</td>
                    <td className="py-3.5 text-right font-bold text-slate-200">₹{mktVal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className={`py-3.5 text-right font-bold`}>
                      <div className={`flex flex-col items-end ${isProfit ? "text-emerald-400" : "text-rose-400"}`}>
                        <span>₹{plVal.toLocaleString("en-IN", { minimumFractionDigits: 2, signDisplay: "exceptZero" })}</span>
                        <span className="text-[10px] font-semibold flex items-center gap-0.5">
                          {isProfit ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          {isProfit ? "+" : ""}{plPct.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 text-center">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => handleSelect(h, "BUY")}
                          className="px-2.5 py-1 text-[10px] font-bold rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors border border-emerald-500/20"
                        >
                          BUY MORE
                        </button>
                        <button
                          onClick={() => handleSelect(h, "SELL")}
                          className="px-2.5 py-1 text-[10px] font-bold rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/20"
                        >
                          SELL
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
