"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export const PaperTradeForm: React.FC = () => {
  const { token } = useApp();
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "SL">("MARKET");
  const [quantity, setQuantity] = useState<number>(1);
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!symbol.trim()) {
      setMessage({ type: "error", text: "Symbol is required." });
      return;
    }
    if (quantity <= 0) {
      setMessage({ type: "error", text: "Quantity must be greater than 0." });
      return;
    }
    if ((orderType === "LIMIT" || orderType === "SL") && (!price || parseFloat(price) <= 0)) {
      setMessage({ type: "error", text: "Please enter a valid price." });
      return;
    }
    if (orderType === "SL" && (!triggerPrice || parseFloat(triggerPrice) <= 0)) {
      setMessage({ type: "error", text: "Please enter a valid trigger price." });
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        symbol: symbol.trim().toUpperCase(),
        side,
        orderType,
        quantity,
      };
      if (orderType === "LIMIT" || orderType === "SL") body.price = parseFloat(price);
      if (orderType === "SL") body.triggerPrice = parseFloat(triggerPrice);

      const res = await fetch("/api/paper/order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to place order");

      setMessage({ type: "success", text: `Order placed: ${side} ${quantity} ${symbol.trim().toUpperCase()}` });
      setSymbol("");
      setQuantity(1);
      setPrice("");
      setTriggerPrice("");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to place order" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">Place Order</h3>

      {message && (
        <div
          className={`mb-4 flex items-center gap-2 px-4 py-3 rounded-lg text-xs font-semibold ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/25 text-emerald-400"
              : "bg-rose-500/10 border border-rose-500/25 text-rose-400"
          }`}
        >
          {message.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">Symbol</label>
          <input
            type="text"
            placeholder="e.g. RELIANCE"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700 font-semibold uppercase"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">Side</label>
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setSide("BUY")}
              className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                side === "BUY"
                  ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              BUY
            </button>
            <button
              type="button"
              onClick={() => setSide("SELL")}
              className={`py-1.5 text-xs font-bold rounded-md transition-all cursor-pointer ${
                side === "SELL"
                  ? "bg-rose-500 text-white shadow-md shadow-rose-500/10"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              SELL
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">Order Type</label>
          <select
            value={orderType}
            onChange={(e) => setOrderType(e.target.value as typeof orderType)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700 font-semibold"
          >
            <option value="MARKET">MARKET</option>
            <option value="LIMIT">LIMIT</option>
            <option value="SL">SL</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">Quantity</label>
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700 font-semibold"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">Price</label>
          <input
            type="number"
            step="0.05"
            disabled={orderType === "MARKET"}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder={orderType === "MARKET" ? "N/A (Market Order)" : "Enter price"}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
          />
        </div>

        {orderType === "SL" && (
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">Trigger Price</label>
            <input
              type="number"
              step="0.05"
              value={triggerPrice}
              onChange={(e) => setTriggerPrice(e.target.value)}
              placeholder="Enter trigger price"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-slate-700 font-semibold"
            />
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className={`w-full py-2.5 rounded-lg font-bold text-xs shadow-lg uppercase tracking-wider transition-all mt-2 cursor-pointer ${
            side === "BUY"
              ? "bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-slate-800 disabled:text-slate-600 shadow-emerald-500/15"
              : "bg-rose-500 text-white hover:bg-rose-600 disabled:bg-slate-800 disabled:text-slate-600 shadow-rose-500/15"
          }`}
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Processing...
            </span>
          ) : (
            `${side} ${symbol.trim() || "STOCK"}`
          )}
        </button>
      </form>
    </div>
  );
};
