"use client";

import React, { useState, useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { CreditCard, ShieldCheck, TrendingUp, Info } from "lucide-react";

interface TradePanelProps {
  selectedInstrument: {
    symbol: string;
    token: string;
    exchange: string;
    transactionType?: "BUY" | "SELL";
    quantity?: number;
  } | null;
}

export const TradePanel: React.FC<TradePanelProps> = ({ selectedInstrument }) => {
  const { prices, user, submitOrder } = useApp();
  const [transactionType, setTransactionType] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL">("MARKET");
  const [productType, setProductType] = useState<"INTRADAY" | "DELIVERY">("DELIVERY");
  const [quantity, setQuantity] = useState<number>(1);
  const [price, setPrice] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const priceInfo = selectedInstrument ? prices[selectedInstrument.token] : null;
  const ltp = priceInfo ? priceInfo.ltp : 100.0;

  // Sync price field with LTP, pre-fill transactionType and quantity when selecting a stock
  useEffect(() => {
    if (selectedInstrument) {
      if (ltp) {
        setPrice(ltp.toFixed(2));
      }
      if (selectedInstrument.transactionType) {
        setTransactionType(selectedInstrument.transactionType);
      }
      if (selectedInstrument.quantity !== undefined) {
        setQuantity(selectedInstrument.quantity);
      }
    }
  }, [selectedInstrument]);

  if (!selectedInstrument) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center text-center h-full min-h-[300px] shadow-lg text-slate-500">
        <Info className="w-10 h-10 text-slate-600 mb-3" />
        <p className="font-semibold text-sm text-slate-400">Order Terminal</p>
        <p className="text-xs text-slate-600 mt-1 max-w-[200px]">
          Select a stock from your watchlist or search a symbol to trade.
        </p>
      </div>
    );
  }

  const orderPrice = orderType === "MARKET" ? ltp : parseFloat(price) || 0;
  const estValue = quantity * orderPrice;
  const hasBalance = user ? user.balance >= estValue : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      alert("Please enter a valid quantity.");
      return;
    }
    if ((orderType === "LIMIT" || orderType === "SL") && (!price || parseFloat(price) <= 0)) {
      alert("Please enter a valid price.");
      return;
    }

    setSubmitting(true);
    try {
      await submitOrder({
        symbol: selectedInstrument.symbol,
        token: selectedInstrument.token,
        exchange: selectedInstrument.exchange,
        quantity,
        price: orderType === "MARKET" ? 0 : parseFloat(price),
        orderType,
        transactionType,
        productType,
      });
      alert(`Order placed successfully: ${transactionType} ${quantity} ${selectedInstrument.symbol}`);
      setQuantity(1);
    } catch (err: any) {
      alert(err.message || "Failed to execute order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div>
          <span className="font-bold text-sm text-slate-200 uppercase tracking-wide">Order Terminal</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold bg-slate-850 px-2 py-0.5 border border-slate-800 rounded">
          <span>LTP:</span>
          <span className="text-emerald-400 font-bold">₹{ltp.toFixed(2)}</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-extrabold text-base text-slate-100">{selectedInstrument.symbol}</h2>
          <span className="text-[9px] font-bold px-1 py-0.5 bg-slate-800 text-slate-400 border border-slate-700/60 rounded">
            {selectedInstrument.exchange}
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-0.5">Token: {selectedInstrument.token}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4">
        {/* BUY / SELL Switcher */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setTransactionType("BUY")}
            className={`py-1.5 text-xs font-bold rounded-md transition-all ${
              transactionType === "BUY"
                ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setTransactionType("SELL")}
            className={`py-1.5 text-xs font-bold rounded-md transition-all ${
              transactionType === "SELL"
                ? "bg-rose-500 text-white shadow-md shadow-rose-500/10"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            SELL
          </button>
        </div>

        {/* Product Type Switcher (Delivery vs Intraday) */}
        <div>
          <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">
            Product Type
          </label>
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setProductType("DELIVERY")}
              className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                productType === "DELIVERY"
                  ? "bg-slate-800 text-slate-100 shadow"
                  : "text-slate-500 hover:text-slate-350"
              }`}
            >
              Delivery (CNC)
            </button>
            <button
              type="button"
              onClick={() => setProductType("INTRADAY")}
              className={`py-1.5 text-xs font-bold rounded-md transition-all ${
                productType === "INTRADAY"
                  ? "bg-slate-800 text-slate-100 shadow"
                  : "text-slate-500 hover:text-slate-350"
              }`}
            >
              Intraday (MIS)
            </button>
          </div>
        </div>

        {/* Order Type Selector */}
        <div>
          <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">
            Order Type
          </label>
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {["MARKET", "LIMIT", "SL"].map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setOrderType(type as any)}
                className={`py-1.5 text-[11px] font-bold rounded-md transition-all ${
                  orderType === type
                    ? "bg-slate-800 text-slate-100 shadow"
                    : "text-slate-550 hover:text-slate-350"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity & Price Fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">
              Qty
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700 font-semibold text-center"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block mb-1.5">
              Price (₹)
            </label>
            <input
              type="number"
              step="0.05"
              disabled={orderType === "MARKET"}
              value={orderType === "MARKET" ? ltp.toFixed(2) : price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-center"
            />
          </div>
        </div>

        {/* Dynamic Margin Summary */}
        <div className="mt-auto border-t border-slate-800/60 pt-4 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Required Margin:</span>
            <span className="font-semibold text-slate-300">
              ₹{estValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Available Funds:</span>
            <span className={`font-bold ${hasBalance || transactionType === "SELL" ? "text-slate-300" : "text-rose-400"}`}>
              ₹{user?.balance.toLocaleString("en-IN", { minimumFractionDigits: 2 }) || "0.00"}
            </span>
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting || (transactionType === "BUY" && !hasBalance)}
            className={`w-full py-2.5 rounded-lg font-bold text-xs shadow-lg uppercase tracking-wider transition-all duration-200 mt-2 ${
              transactionType === "BUY"
                ? "bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 shadow-emerald-500/15"
                : "bg-rose-500 text-white hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-600 shadow-rose-500/15"
            }`}
          >
            {submitting ? "Processing..." : `${transactionType} ${selectedInstrument.symbol}`}
          </button>
        </div>
      </form>
    </div>
  );
};
