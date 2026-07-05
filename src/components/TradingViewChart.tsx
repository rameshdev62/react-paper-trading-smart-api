"use client";

import React from "react";
import { ExternalLink, BarChart3 } from "lucide-react";

interface TradingViewChartProps {
  symbol: string;
  exchange: string;
  minimal?: boolean;
}

const MONTH_MAP: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04",
  MAY: "05", JUN: "06", JUL: "07", AUG: "08",
  SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

function expiryToYYMMDD(expiry: string): string {
  const cleaned = expiry.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  const ddMmmYY = cleaned.match(/^(\d{2})([A-Z]{3})(\d{2,4})$/);
  if (ddMmmYY) {
    return ddMmmYY[3].slice(-2) + (MONTH_MAP[ddMmmYY[2]] ?? "00") + ddMmmYY[1];
  }
  const mmmDDYY = cleaned.match(/^([A-Z]{3})(\d{2})(\d{2,4})$/);
  if (mmmDDYY) {
    return mmmDDYY[3].slice(-2) + (MONTH_MAP[mmmDDYY[1]] ?? "00") + mmmDDYY[2];
  }
  const yyyymmdd = cleaned.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    return yyyymmdd[1].slice(-2) + yyyymmdd[2] + yyyymmdd[3];
  }
  const yymmdd = cleaned.match(/^(\d{6})$/);
  if (yymmdd) return yymmdd[1];
  return cleaned;
}

function parseNFOParts(symbol: string): {
  underlying: string;
  expiry: string;
  strike: string;
  optType: string;
} | null {
  const u = symbol.toUpperCase();
  const m1 = u.match(/^([A-Z]+?)(\d{2}[A-Z]{3}\d{2,4})(CE|PE|C|P)(\d+)$/);
  if (m1) {
    return {
      underlying: m1[1],
      expiry: expiryToYYMMDD(m1[2]),
      strike: m1[4],
      optType: m1[3].startsWith("C") ? "C" : "P",
    };
  }
  const m2 = u.match(/^([A-Z]+?)(\d{2}[A-Z]{3}\d{2,4})(\d+)(CE|PE|C|P)$/);
  if (m2) {
    return {
      underlying: m2[1],
      expiry: expiryToYYMMDD(m2[2]),
      strike: m2[3],
      optType: m2[4].startsWith("C") ? "C" : "P",
    };
  }
  return null;
}

const INDEX_MAP: Record<string, string> = {
  "NIFTY 50": "NSE:NIFTY",
  "NIFTY_50": "NSE:NIFTY",
  "NIFTY50": "NSE:NIFTY",
  "NIFTY": "NSE:NIFTY",
  "NIFTY BANK": "NSE:BANKNIFTY",
  "NIFTYBANK": "NSE:BANKNIFTY",
  "BANKNIFTY": "NSE:BANKNIFTY",
  "NIFTY FIN SERVICE": "NSE:CNXFINANCE",
  "NIFTY FINANCIAL SERVICES": "NSE:CNXFINANCE",
  "NIFTY_FIN_SERVICE": "NSE:CNXFINANCE",
  "NIFTYFINSERVICE": "NSE:CNXFINANCE",
  "CNX FINANCE": "NSE:CNXFINANCE",
  "NIFTY NEXT 50": "NSE:NIFTYJR",
  "NIFTY_NEXT_50": "NSE:NIFTYJR",
  "NIFTYNEXT50": "NSE:NIFTYJR",
  "NIFTYJR": "NSE:NIFTYJR",
  "NIFTY MIDCAP 100": "NSE:CNXMIDCAP",
  "NIFTY_MIDCAP_100": "NSE:CNXMIDCAP",
  "NIFTYMIDCAP100": "NSE:CNXMIDCAP",
  "CNX MIDCAP": "NSE:CNXMIDCAP",
  "CNXMIDCAP": "NSE:CNXMIDCAP",
  "NIFTY MIDCAP 50": "NSE:NIFTYMIDCAP50",
  "NIFTYMIDCAP50": "NSE:NIFTYMIDCAP50",
  "NIFTY SERV SECTOR": "NSE:CNXSERVICE",
  "NIFTY_SERV_SECTOR": "NSE:CNXSERVICE",
  "NIFTYSERVSECTOR": "NSE:CNXSERVICE",
  "CNX SERVICE": "NSE:CNXSERVICE",
  "CNXSERVICE": "NSE:CNXSERVICE",
  "NIFTY IT": "NSE:CNXIT",
  "CNXIT": "NSE:CNXIT",
  "NIFTY AUTO": "NSE:CNXAUTO",
  "NIFTY PHARMA": "NSE:CNXPHARMA",
  "NIFTY FMCG": "NSE:CNXFMCG",
  "NIFTY METAL": "NSE:CNXMETAL",
  "NIFTY REALTY": "NSE:CNXREALTY",
  "NIFTY ENERGY": "NSE:CNXENERGY",
  "NIFTY INFRA": "NSE:CNXINFRA",
  "NIFTY PSU BANK": "NSE:CNXPSUBANK",
  "NIFTY PSE": "NSE:CNXPSE",
  "NIFTY MNC": "NSE:CNXMNC",
  "NIFTY 100": "NSE:NIFTY100",
  "NIFTY 200": "NSE:NIFTY200",
  "NIFTY 500": "NSE:NIFTY500",
  "INDIA VIX": "NSE:INDIAVIX",
  "SENSEX": "BSE:SENSEX",
  "HANGSENG BEES-NAV": "NSE:HNGSNGBEES",
  "HANGSENG BEES": "NSE:HNGSNGBEES",
  "HANGSENGBEES": "NSE:HNGSNGBEES",
};

const SUFFIX_RE = /-(EQ|BE|SM|ST|GB|MF|SG|NAV|N\d+|NA|ZM|BZ|RD|IL)$/i;

export function toTradingViewSymbol(symbol: string, exchange: string): string {
  const exch = exchange.trim().toUpperCase();

  let t = symbol
    .trim()
    .replace(SUFFIX_RE, "")
    .replace(/\s*INDEX$/i, "")
    .trim()
    .toUpperCase();

  if (INDEX_MAP[t]) return INDEX_MAP[t];

  const isBse = exch.startsWith("BSE");
  const isFo = exch === "NFO" || exch.includes("_FO");

  if (isFo) {
    const parsed = parseNFOParts(t);
    if (parsed) {
      return `NSE:${parsed.underlying}${parsed.expiry}${parsed.optType}${parsed.strike}`;
    }
    return `NSE:${t}`;
  }

  const finalExch = isBse ? "BSE" : "NSE";
  return `${finalExch}:${t.replace(/\s+/g, "")}`;
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  exchange,
  minimal,
}) => {
  const formattedSymbol = toTradingViewSymbol(symbol, exchange);
  const displaySymbol = symbol.replace(SUFFIX_RE, "").replace(/\s*INDEX$/i, "").trim();

  const chartUrl = `https://www.tradingview.com/chart/3NjDmwlc/?symbol=${encodeURIComponent(formattedSymbol)}`;

  if (minimal) {
    return (
      <a
        href={chartUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-full bg-slate-950 rounded-lg overflow-hidden relative border border-slate-800 flex items-center justify-center text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-all"
      >
        <div className="flex flex-col items-center gap-2">
          <BarChart3 className="w-8 h-8" />
          <span className="text-xs font-semibold">Open Chart</span>
        </div>
      </a>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg flex flex-col gap-4 w-full">
      <div className="flex justify-between items-center">
        <div className="min-w-0">
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider truncate">
            {displaySymbol} Live Chart
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5 truncate font-mono">
            {chartUrl}
          </p>
        </div>
        <a
          href={chartUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-2 shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Open Chart</span>
        </a>
      </div>
      <a
        href={chartUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full h-[420px] bg-slate-950 rounded-lg border border-slate-800 hover:border-emerald-500/30 transition-all flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-emerald-400 cursor-pointer"
      >
        <BarChart3 className="w-12 h-12 opacity-50" />
        <span className="text-sm font-bold">Click to open TradingView chart</span>
        <span className="text-[10px] text-slate-500">Opens in a new tab</span>
      </a>
    </div>
  );
};
