"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { LogOut, Radio, Shield, User } from "lucide-react";
import { usePathname } from "next/navigation";

export const Navbar: React.FC = () => {
  const { user, logout, appMode, setAppMode } = useApp();
  const pathname = usePathname() || "";

  if (!user) return null;

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-slate-100 py-3 px-6 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 p-2 rounded-lg text-white font-bold shadow-lg shadow-emerald-500/20">
          SmartPT
        </div>
        <div>
          <span className="font-bold text-lg tracking-wide bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
            Smart Paper Trading
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 ml-6 border-l border-slate-800 pl-6">
          <a
            href="/dashboard"
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all border ${
              pathname === "/dashboard"
                ? "bg-slate-800 text-emerald-400 border-slate-700/50 shadow-sm"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Trading Desk
          </a>
          <a
            href="/paper-trading"
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all border ${
              pathname.startsWith("/paper-trading")
                ? "bg-slate-800 text-emerald-400 border-slate-700/50 shadow-sm"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Paper Desk
          </a>
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Cash Balance Display */}
        <div className="bg-slate-800 border border-slate-700/50 rounded-lg px-4 py-1.5 flex items-center gap-2">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Available Cash</span>
          <span className="text-emerald-400 font-bold tracking-wide">
            ₹{user.balance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
          <button
            onClick={() => setAppMode("mock")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              appMode === "mock"
                ? "bg-slate-800 text-emerald-400 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            Mock Mode
          </button>
          <button
            onClick={() => setAppMode("live")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${
              appMode === "live"
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Live Feed
          </button>
        </div>

        {/* User profile / Logout */}
        <div className="flex items-center gap-3 border-l border-slate-800 pl-6">
          <div className="flex items-center gap-2 text-slate-300">
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="text-sm font-medium">{user.name || user.email.split("@")[0]}</span>
          </div>

          <button
            onClick={logout}
            title="Log Out"
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </nav>
  );
};
