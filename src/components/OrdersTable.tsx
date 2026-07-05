"use client";

import React from "react";
import { useApp } from "@/context/AppContext";
import { XCircle, CheckCircle, RefreshCw, AlertCircle } from "lucide-react";

export const OrdersTable: React.FC = () => {
  const { orders, cancelOrder, refreshOrders, refreshingOrders } = useApp();

  const handleCancel = async (orderId: string) => {
    if (confirm("Are you sure you want to cancel this pending order?")) {
      try {
        await cancelOrder(orderId);
        alert("Order cancelled successfully!");
      } catch (err: any) {
        alert(err.message || "Failed to cancel order");
      }
    }
  };

  const getStatusBadge = (status: string, reason: string | null) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-2.5 h-2.5" />
            Executed
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
            Pending
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700/50">
            Cancelled
          </span>
        );
      case "REJECTED":
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="w-2.5 h-2.5" />
              Rejected
            </span>
            {reason && <span className="text-[10px] text-rose-455 font-medium">{reason}</span>}
          </div>
        );
      default:
        return <span className="text-slate-400 text-xs">{status}</span>;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">Transaction Order Log</h3>
          <p className="text-xs text-slate-500 mt-0.5">Historical log of all trades placed this session</p>
        </div>
        <button
          onClick={refreshOrders}
          title="Refresh Orders"
          className="p-1.5 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshingOrders ? "animate-spin text-emerald-400" : ""}`} />
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-center">
          <p className="text-sm font-semibold text-slate-400">No transactions recorded</p>
          <p className="text-xs text-slate-655 mt-1">Submit an order in the trade terminal to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider sticky top-0 bg-slate-900 z-10">
                <th className="pb-3">Time</th>
                <th className="pb-3">Symbol</th>
                <th className="pb-3 text-center">Action</th>
                <th className="pb-3 text-center">Type</th>
                <th className="pb-3 text-right">Qty</th>
                <th className="pb-3 text-right">Price</th>
                <th className="pb-3 text-center">Status</th>
                <th className="pb-3 text-center">Cancel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs text-slate-300">
              {orders.map((o) => {
                const formattedDate = new Date(o.createdAt).toLocaleString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  day: "numeric",
                  month: "short",
                });

                return (
                  <tr key={o.id} className="hover:bg-slate-850/40 transition-colors">
                    <td className="py-3 text-slate-500 font-medium whitespace-nowrap">{formattedDate}</td>
                    <td className="py-3 font-bold text-slate-200">
                      <div className="flex items-center gap-1">
                        <span>{o.symbol}</span>
                        <span className="text-[9px] font-bold px-1 rounded bg-slate-850 text-slate-400 border border-slate-800">
                          {o.exchange}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${o.transactionType === "BUY" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-455"}`}>
                        {o.transactionType}
                      </span>
                    </td>
                    <td className="py-3 text-center font-semibold text-slate-400">{o.orderType}</td>
                    <td className="py-3 text-right font-semibold text-slate-350">{o.quantity}</td>
                    <td className="py-3 text-right font-bold text-slate-200">₹{o.price.toFixed(2)}</td>
                    <td className="py-3 text-center">{getStatusBadge(o.status, o.rejectReason)}</td>
                    <td className="py-3 text-center">
                      {o.status === "PENDING" ? (
                        <button
                          onClick={() => handleCancel(o.id)}
                          className="p-1 hover:bg-rose-500/5 text-rose-400 hover:text-rose-500 rounded border border-rose-500/10 hover:border-rose-500/30 transition-all font-bold text-[10px]"
                        >
                          CANCEL
                        </button>
                      ) : (
                        <span className="text-slate-700">-</span>
                      )}
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
