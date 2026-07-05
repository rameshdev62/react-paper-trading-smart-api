"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { Navbar } from "@/components/Navbar";
import { SymbolSearch } from "@/components/SymbolSearch";
import { Watchlist } from "@/components/Watchlist";
import { TradePanel } from "@/components/TradePanel";
import { PortfolioSummary } from "@/components/PortfolioSummary";
import { HoldingsTable } from "@/components/HoldingsTable";
import { OrdersTable } from "@/components/OrdersTable";
import { SettingsPanel } from "@/components/SettingsPanel";
import { TradingViewChart } from "@/components/TradingViewChart";
import { AnalyticsDashboard } from "@/components/AnalyticsDashboard";
import { BarChart3, Settings, Loader2, RefreshCw, PieChart, CircleCheck } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { token, loading, refreshPortfolio, refreshOrders, refreshingPortfolio, refreshingOrders } = useApp();
  const [activeTab, setActiveTab] = useState<"overview" | "analytics" | "api_settings">("overview");
  const [apiConfigured, setApiConfigured] = useState(false);

  // Check if API credentials are configured
  useEffect(() => {
    fetch("/api/credentials", {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    })
      .then((r) => r.json())
      .then((d) => setApiConfigured(d.configured))
      .catch(() => {});
  }, []);

  // Local state to share selected instrument between Search, Watchlist and Trade Panel
  const [selectedInstrument, setSelectedInstrument] = useState<{
    symbol: string;
    token: string;
    exchange: string;
  } | null>({
    symbol: "NIFTY 50",
    token: "26000",
    exchange: "NSE",
  });
  const [activeGroup, setActiveGroup] = useState("Default");

  // Redirect to login if user is not authenticated
  useEffect(() => {
    if (!loading && !token) {
      router.push("/login");
    }
  }, [token, loading, router]);

  if (loading || !token) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-100">
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  const handleSelectInstrument = (inst: typeof selectedInstrument) => {
    setSelectedInstrument(inst);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-screen">
      {/* Header Navigation bar */}
      <Navbar />

      <main className="flex-1 p-6 flex flex-col lg:flex-row gap-6 max-w-7xl w-full mx-auto">
        {/* Left Side: Market Watch & Execution */}
        <div className="w-full lg:w-[350px] shrink-0 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              Search & Add to Watchlist
            </label>
            <SymbolSearch onSelectInstrument={handleSelectInstrument} activeGroup={activeGroup} />
          </div>

          <Watchlist
            onSelectInstrument={handleSelectInstrument}
            selectedToken={selectedInstrument?.token}
            activeGroup={activeGroup}
            onGroupChange={setActiveGroup}
          />

          {/* Trade Order Terminal */}
          <div>
            <TradePanel selectedInstrument={selectedInstrument} />
          </div>
        </div>

        {/* Right Side: Analytics, Holdings & History */}
        <div className="flex-1 flex flex-col gap-6">
          <div className="flex justify-between items-center border-b border-slate-800">
            <div className="flex">
              <button
                onClick={() => setActiveTab("overview")}
                className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${activeTab === "overview"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
              >
                <BarChart3 className="w-4 h-4" />
                Trading Dashboard
              </button>

              <button
                onClick={() => setActiveTab("analytics")}
                className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${activeTab === "analytics"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
              >
                <PieChart className="w-4 h-4" />
                Analytics
              </button>

              <button
                onClick={() => setActiveTab("api_settings")}
                className={`flex items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${activeTab === "api_settings"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                  }`}
              >
                <Settings className="w-4 h-4" />
                Angel One API Config
                {apiConfigured && (
                  <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold ml-1">
                    <CircleCheck className="w-2.5 h-2.5" />
                    Configured
                  </span>
                )}
              </button>
            </div>
            {activeTab === "overview" && (
              <button
                onClick={async () => {
                  await Promise.all([refreshPortfolio(), refreshOrders()]);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-slate-800 hover:border-emerald-500/20 rounded-lg transition-all mr-2 cursor-pointer"
                title="Refresh Portfolio & Orders"
              >
                <RefreshCw className={`w-3 h-3 ${refreshingPortfolio || refreshingOrders ? "animate-spin text-emerald-400" : ""}`} />
                <span>Refresh Data</span>
              </button>
            )}
          </div>

          {/* Tab Content Display */}
          <div className="flex-1 flex flex-col gap-6">
            {activeTab === "overview" ? (
              <>
                {/* Portfolio Summary & historic area chart */}
                <PortfolioSummary />

                {/* Live TradingView Stock Chart */}
                {selectedInstrument && (
                  <TradingViewChart
                    symbol={selectedInstrument.symbol}
                    exchange={selectedInstrument.exchange}
                  />
                )}

                {/* Open Positions & holdings grid */}
                <HoldingsTable onSelectInstrument={handleSelectInstrument} />

                {/* Order logs log */}
                <OrdersTable />
              </>
            ) : activeTab === "analytics" ? (
              <AnalyticsDashboard />
            ) : (
              <SettingsPanel />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
