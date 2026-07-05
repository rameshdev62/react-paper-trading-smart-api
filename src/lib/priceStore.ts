interface PriceData {
  ltp: number;
  changePercent: number;
  open: number;
  close: number;
}

class PriceStore {
  private static instance: PriceStore;
  private prices: Map<string, PriceData> = new Map();
  private subscribers: Set<(data: Record<string, PriceData>) => void> = new Set();

  private constructor() {
    // Baseline prices for major Indian market tokens (NSE tokens)
    // RELIANCE = 2885, SBIN = 3045, INFY = 1594 (approx), TCS = 11536 (approx)
    const baselines: Record<string, { price: number }> = {
      "2885": { price: 2450.0 },     // RELIANCE-EQ
      "3045": { price: 840.0 },      // SBIN-EQ
      "1594": { price: 1620.0 },     // INFY-EQ
      "11536": { price: 3950.0 },    // TCS-EQ
      "99926000": { price: 23400.0 }, // Nifty 50 Index
    };

    for (const [token, info] of Object.entries(baselines)) {
      this.prices.set(token, {
        ltp: info.price,
        changePercent: 0.0,
        open: info.price,
        close: info.price,
      });
    }
  }

  public static getInstance(): PriceStore {
    if (!PriceStore.instance) {
      PriceStore.instance = new PriceStore();
    }
    return PriceStore.instance;
  }

  public setPrice(token: string, ltp: number, changePercent: number) {
    const existing = this.prices.get(token);
    const open = existing ? existing.open : ltp;
    this.prices.set(token, {
      ltp,
      changePercent,
      open,
      close: open,
    });
    this.notifySubscribers();
  }

  public getPrice(token: string): PriceData {
    let price = this.prices.get(token);
    if (!price) {
      // Lazy-initialize dynamic baseline for newly added stocks so they can start ticking
      const randomBase = Math.floor(Math.random() * 800) + 100;
      price = {
        ltp: randomBase,
        changePercent: 0.0,
        open: randomBase,
        close: randomBase,
      };
      this.prices.set(token, price);
      this.notifySubscribers();
    }
    return price;
  }

  public getAllPrices(): Record<string, PriceData> {
    const obj: Record<string, PriceData> = {};
    for (const [token, data] of this.prices.entries()) {
      obj[token] = data;
    }
    return obj;
  }

  public subscribe(cb: (data: Record<string, PriceData>) => void) {
    this.subscribers.add(cb);
    // Send immediate current state
    cb(this.getAllPrices());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notifySubscribers() {
    const all = this.getAllPrices();
    this.subscribers.forEach((cb) => cb(all));
  }

  public startMockSimulation() {
    // Mock simulation is no longer continuous. Prices are static between page refreshes.
  }

  public stopMockSimulation() {
    // No-op
  }
}

export const priceStore = PriceStore.getInstance();
