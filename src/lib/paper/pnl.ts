export function calculateRealizedPnl(
  side: "BUY" | "SELL",
  qty: number,
  price: number,
  position: { avgBuyPrice: number; avgSellPrice: number; buyQty: number; sellQty: number },
): number {
  if (side === "BUY") {
    return (position.avgSellPrice - price) * qty;
  } else {
    return (price - position.avgBuyPrice) * qty;
  }
}

export function calculateUnrealizedPnl(
  netQty: number,
  avgPrice: number,
  ltp: number,
  side: "LONG" | "SHORT",
): number {
  if (side === "LONG") {
    return (ltp - avgPrice) * netQty;
  } else {
    return (avgPrice - ltp) * Math.abs(netQty);
  }
}
