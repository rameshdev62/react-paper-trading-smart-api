// Central price store for live market data (same as priceStore but with getter)
import { priceStore } from "../priceStore";

export function getLivePrice(token: string): number {
  const data = priceStore.getPrice(token);
  return data.ltp;
}

export function subscribePrice(token: string, cb: (ltp: number) => void): () => void {
  return priceStore.subscribe((prices) => {
    const data = prices[token];
    if (data) cb(data.ltp);
  });
}
