"use client";

import React, { useState, useRef, useEffect } from "react";
import { Trash2, TrendingUp, TrendingDown, Plus, X, Check, Pencil, LineChart, RefreshCw } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { toTradingViewSymbol } from "./TradingViewChart";

interface WatchlistProps {
  onSelectInstrument?: (inst: { symbol: string; token: string; exchange: string }) => void;
  selectedToken?: string;
  activeGroup?: string;
  onGroupChange?: (group: string) => void;
}

export const Watchlist: React.FC<WatchlistProps> = ({ onSelectInstrument, selectedToken, activeGroup: externalGroup, onGroupChange }) => {
  const { watchlist, groups, prices, appMode, removeFromWatchlist, createGroup, renameGroup, deleteGroup, refreshWatchlist, refreshingWatchlist, refreshWatchlistLtp, refreshingWatchlistLtp } = useApp();
  const [internalGroup, setInternalGroup] = useState<string>("Default");
  const activeGroup = externalGroup ?? internalGroup;
  const setActiveGroup = (g: string) => {
    setInternalGroup(g);
    onGroupChange?.(g);
  };
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showNewTabInput, setShowNewTabInput] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const newTabInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewTabInput && newTabInputRef.current) {
      newTabInputRef.current.focus();
    }
  }, [showNewTabInput]);

  useEffect(() => {
    if (editingGroup && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingGroup]);

  const filteredWatchlist = watchlist.filter((item) => item.group === activeGroup);

  const handleRemove = async (e: React.MouseEvent, token: string, exchange: string) => {
    e.stopPropagation();
    try {
      await removeFromWatchlist(token, exchange, activeGroup);
      const remaining = filteredWatchlist.filter((i) => i.token !== token);
      if (remaining.length === 0 && activeGroup !== "Default") {
        const groupNames = groups.map((g) => g.name);
        const idx = groupNames.indexOf(activeGroup);
        if (idx > 0) {
          setActiveGroup(groupNames[idx - 1]);
        } else if (groupNames.length > 1) {
          setActiveGroup(groupNames[1]);
        } else {
          setActiveGroup("Default");
        }
      }
    } catch (err: any) {
      console.error("Failed to remove item:", err.message);
    }
  };

  const handleCreateGroup = async () => {
    const name = newTabName.trim();
    if (!name) return;
    if (groups.some((g) => g.name === name)) {
      setNewTabName("");
      setShowNewTabInput(false);
      setActiveGroup(name);
      return;
    }
    setActiveGroup(name);
    setNewTabName("");
    setShowNewTabInput(false);
  };

  const handleRenameGroup = async (oldName: string) => {
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      setEditingGroup(null);
      return;
    }
    try {
      await renameGroup(oldName, newName);
      if (activeGroup === oldName) {
        setActiveGroup(newName);
      }
    } catch (err: any) {
      console.error("Failed to rename group:", err.message);
    }
    setEditingGroup(null);
  };

  const handleDeleteGroup = async (name: string) => {
    try {
      await deleteGroup(name);
      if (activeGroup === name) {
        const remaining = groups.filter((g) => g.name !== name);
        setActiveGroup(remaining.length > 0 ? remaining[0].name : "Default");
      }
    } catch (err: any) {
      console.error("Failed to delete group:", err.message);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col shadow-lg">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">Watchlist</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Monitor your favorite stocks</p>
        </div>
        <button
          onClick={() => refreshWatchlistLtp()}
          disabled={refreshingWatchlist || refreshingWatchlistLtp}
          className={`p-1.5 rounded-lg border transition-all cursor-pointer disabled:opacity-50 ${
            appMode === "live"
              ? "border-emerald-500/30 hover:border-emerald-500/50 text-emerald-400 hover:text-emerald-300"
              : "border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
          title={appMode === "live" ? "Refresh LTP from Shoonya API" : "Refresh Watchlist"}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${(refreshingWatchlist || refreshingWatchlistLtp) ? "animate-spin text-emerald-400" : ""}`} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-2 mb-3 overflow-x-auto scrollbar-thin">
        {groups.map((g) => (
          <div key={g.name} className="relative group/tab">
            {editingGroup === g.name ? (
              <div className="flex items-center gap-1">
                <input
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameGroup(g.name);
                    if (e.key === "Escape") setEditingGroup(null);
                  }}
                  className="w-24 px-1.5 py-1 text-[11px] font-bold bg-slate-800 border border-emerald-500 rounded text-slate-200 outline-none"
                />
                <button
                  onClick={() => handleRenameGroup(g.name)}
                  className="p-0.5 text-emerald-400 hover:text-emerald-300"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={() => setEditingGroup(null)}
                  className="p-0.5 text-slate-500 hover:text-slate-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveGroup(g.name)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (g.name !== "Default") {
                    setEditingGroup(g.name);
                    setEditValue(g.name);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap cursor-pointer ${
                  activeGroup === g.name
                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent"
                }`}
                title={g.name !== "Default" ? "Right-click to rename" : undefined}
              >
                {g.name}
                <span className="text-[10px] opacity-60">({g.count})</span>
              </button>
            )}
            {g.name !== "Default" && activeGroup === g.name && !editingGroup && (
              <div className="absolute -top-1 -right-1 hidden group-hover/tab:flex items-center gap-0.5">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingGroup(g.name); setEditValue(g.name); }}
                  className="p-0.5 bg-slate-800 rounded text-slate-400 hover:text-emerald-400"
                  title="Rename"
                >
                  <Pencil className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.name); }}
                  className="p-0.5 bg-slate-800 rounded text-slate-400 hover:text-rose-400"
                  title="Delete"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {showNewTabInput ? (
          <div className="flex items-center gap-1 ml-1">
            <input
              ref={newTabInputRef}
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateGroup();
                if (e.key === "Escape") { setShowNewTabInput(false); setNewTabName(""); }
              }}
              placeholder="Tab name"
              className="w-20 px-1.5 py-1 text-[11px] font-bold bg-slate-800 border border-emerald-500 rounded text-slate-200 outline-none placeholder-slate-500"
            />
            <button
              onClick={handleCreateGroup}
              className="p-0.5 text-emerald-400 hover:text-emerald-300"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => { setShowNewTabInput(false); setNewTabName(""); }}
              className="p-0.5 text-slate-500 hover:text-slate-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewTabInput(true)}
            className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-bold text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-md transition-all ml-1 cursor-pointer"
            title="Create new tab"
          >
            <Plus className="w-3 h-3" />
            <span>Tab</span>
          </button>
        )}
      </div>

      {/* Watchlist items */}
      {filteredWatchlist.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 px-4 text-center text-slate-500">
          <p className="text-xs">This tab is empty.</p>
          <p className="text-[11px] text-slate-600 mt-1">Search for symbols above and click &quot;+&quot; to add them here.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 pr-1 max-h-[320px] scrollbar-thin">
          {filteredWatchlist.map((item) => {
            const priceInfo = prices[item.token];
            const ltp = priceInfo ? priceInfo.ltp : null;
            const changePercent = priceInfo ? priceInfo.changePercent : 0.0;
            const isPositive = changePercent >= 0;

            const isSelected = selectedToken === item.token;

            return (
              <div
                key={item.id}
                onClick={() =>
                  onSelectInstrument &&
                  onSelectInstrument({
                    symbol: item.symbol,
                    token: item.token,
                    exchange: item.exchange,
                  })
                }
                className={`flex items-center justify-between px-3 py-2.5 hover:bg-slate-800/40 cursor-pointer rounded-lg transition-all group ${
                  isSelected ? "bg-emerald-500/5 border border-emerald-500/20" : "border border-transparent"
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-200 tracking-wide truncate">
                      {item.symbol}
                    </span>
                    <span className="text-[9px] font-bold px-1 rounded bg-slate-850 text-slate-400 border border-slate-800 shrink-0">
                      {item.exchange}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-right shrink-0">
                  <div className="flex flex-col">
                    <span className="font-bold text-xs text-slate-200 tracking-wide">
                      {ltp !== null ? `₹${ltp.toFixed(2)}` : "--"}
                    </span>
                    {ltp !== null && (
                      <span
                        className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {isPositive ? (
                          <TrendingUp className="w-2.5 h-2.5" />
                        ) : (
                          <TrendingDown className="w-2.5 h-2.5" />
                        )}
                        {isPositive ? "+" : ""}
                        {changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>

                  <a
                    href={`https://www.tradingview.com/chart/3NjDmwlc/?symbol=${encodeURIComponent(toTradingViewSymbol(item.symbol, item.exchange))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Open TradingView Chart"
                    className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/5 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <LineChart className="w-3.5 h-3.5" />
                  </a>

                  <button
                    onClick={(e) => handleRemove(e, item.token, item.exchange)}
                    title="Remove Symbol"
                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/5 rounded-md transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
