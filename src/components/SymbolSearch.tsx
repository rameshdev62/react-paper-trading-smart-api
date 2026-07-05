"use client";

import React, { useState, useEffect, useRef } from "react";
import { Search, Plus, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";

interface Instrument {
  id: string;
  token: string;
  symbol: string;
  name: string;
  exchSeg: string;
}

interface SymbolSearchProps {
  onSelectInstrument?: (inst: { symbol: string; token: string; exchange: string }) => void;
  activeGroup?: string;
}

export const SymbolSearch: React.FC<SymbolSearchProps> = ({ onSelectInstrument, activeGroup }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Instrument[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { addToWatchlist } = useApp();

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search query
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/market/search?query=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setOpen(true);
        }
      } catch (err) {
        console.error("Search query error:", err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  const handleSelect = (inst: Instrument) => {
    if (onSelectInstrument) {
      onSelectInstrument({
        symbol: inst.symbol,
        token: inst.token,
        exchange: inst.exchSeg,
      });
    }
    setQuery("");
    setOpen(false);
  };

  const handleAddWatchlist = async (e: React.MouseEvent, inst: Instrument) => {
    e.stopPropagation();
    try {
      await addToWatchlist(inst.symbol, inst.token, inst.exchSeg, activeGroup);
    } catch (err: any) {
      alert(err.message || "Failed to add item to watchlist");
    }
  };

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Input container */}
      <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-lg focus-within:border-emerald-500 transition-colors shadow-inner">
        <Search className="absolute left-3.5 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search stocks (e.g. Reliance, SBIN)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          className="w-full pl-10 pr-10 py-2.5 bg-transparent border-0 text-slate-200 text-sm focus:outline-none placeholder-slate-600 rounded-lg"
        />
        {searching && (
          <Loader2 className="absolute right-3.5 w-4 h-4 text-slate-500 animate-spin" />
        )}
      </div>

      {/* Autocomplete Dropdown list */}
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1.5 bg-slate-900 border border-slate-800 rounded-lg shadow-xl shadow-black/40 max-h-72 overflow-y-auto divide-y divide-slate-800/50 scrollbar-thin">
          {results.map((inst) => (
            <div
              key={inst.id}
              onClick={() => handleSelect(inst)}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/60 cursor-pointer transition-colors group"
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-200 group-hover:text-emerald-400 transition-colors">
                    {inst.symbol}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-850 text-slate-400 border border-slate-800">
                    {inst.exchSeg}
                  </span>
                </div>
                <span className="text-xs text-slate-500 truncate max-w-xs">{inst.name}</span>
              </div>

              <button
                onClick={(e) => handleAddWatchlist(e, inst)}
                title="Add to Watchlist"
                className="p-1.5 bg-slate-850 border border-slate-800 rounded-md text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-all shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
