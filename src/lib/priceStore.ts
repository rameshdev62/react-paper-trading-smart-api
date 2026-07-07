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
  private mockInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Baseline prices for major Indian market tokens (NSE tokens and indices)
    const baselines: Record<string, { price: number }> = {
      "11536": { price: 3950.0 },    // TCS-EQ
      "11483": { price: 3500.0 },    // LT-EQ
      "1394": { price: 2400.0 },     // HINDUNILVR-EQ
      "10604": { price: 1200.0 },    // BHARTIARTL-EQ
      "11532": { price: 9700.0 },    // ULTRACEMCO-EQ
      "20374": { price: 420.0 },     // COALINDIA-EQ
      "10999": { price: 12400.0 },   // MARUTI-EQ
      "1363": { price: 600.0 },      // HINDALCO-EQ
      "1594": { price: 1620.0 },     // INFY-EQ
      "17963": { price: 2500.0 },    // NESTLEIND-EQ
      "3499": { price: 160.0 },      // TATASTEEL-EQ
      "694": { price: 1400.0 },      // CIPLA-EQ
      "3351": { price: 1500.0 },     // SUNPHARMA-EQ
      "3787": { price: 480.0 },      // WIPRO-EQ
      "2475": { price: 270.0 },      // ONGC-EQ
      "25": { price: 3100.0 },       // ADANIENT-EQ
      "236": { price: 2850.0 },      // ASIANPAINT-EQ
      "317": { price: 7200.0 },      // BAJFINANCE-EQ
      "547": { price: 4900.0 },      // BRITANNIA-EQ
      "910": { price: 4300.0 },      // EICHERMOT-EQ
      "881": { price: 6100.0 },      // DRREDDY-EQ
      "13538": { price: 1250.0 },    // TECHM-EQ
      "16669": { price: 9000.0 },    // BAJAJ-AUTO-EQ
      "10940": { price: 3700.0 },    // DIVISLAB-EQ
      "14977": { price: 280.0 },     // POWERGRID-EQ
      "1333": { price: 1650.0 },     // HDFCBANK-EQ
      "15083": { price: 1300.0 },    // ADANIPORTS-EQ
      "2031": { price: 1950.0 },     // M&M-EQ
      "1232": { price: 2200.0 },     // GRASIM-EQ
      "21808": { price: 1500.0 },    // SBILIFE-EQ
      "11630": { price: 360.0 },     // NTPC-EQ
      "1348": { price: 4700.0 },     // HEROMOTOCO-EQ
      "16675": { price: 1600.0 },    // BAJAJFINSV-EQ
      "1922": { price: 1800.0 },     // KOTAKBANK-EQ
      "157": { price: 6200.0 },      // APOLLOHOSP-EQ
      "1660": { price: 430.0 },      // ITC-EQ
      "5258": { price: 1400.0 },     // INDUSINDBK-EQ
      "3432": { price: 1100.0 },     // TATACONSUM-EQ
      "3506": { price: 3600.0 },     // TITAN-EQ
      "467": { price: 580.0 },       // HDFCLIFE-EQ
      "5900": { price: 1050.0 },     // AXISBANK-EQ
      "3045": { price: 840.0 },      // SBIN-EQ
      "2885": { price: 2450.0 },     // RELIANCE-EQ
      "4963": { price: 1100.0 },     // ICICIBANK-EQ
      "7229": { price: 1500.0 },     // HCLTECH-EQ
      "526": { price: 600.0 },       // BPCL-EQ
      "11723": { price: 820.0 },     // JSWSTEEL-EQ
      "4306": { price: 2400.0 },     // SHRIRAMFIN-EQ
      "26000": { price: 23400.0 },   // NIFTY Index
      "26009": { price: 49000.0 },   // BANKNIFTY Index
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
      if (this.subscribers.size === 0) {
        this.stopMockSimulation();
      }
    };
  }

  private notifySubscribers() {
    const all = this.getAllPrices();
    this.subscribers.forEach((cb) => cb(all));
  }

  public startMockSimulation() {
    if (this.mockInterval) return;

    console.log("[PriceStore] Starting mock market price simulation loop...");
    this.mockInterval = setInterval(() => {
      for (const [token, data] of this.prices.entries()) {
        // Fluctuate price by a small random percentage: -0.15% to +0.15%
        const pct = (Math.random() - 0.5) * 0.003;
        const newLtp = data.ltp * (1 + pct);
        const changePercent = data.open > 0 ? ((newLtp - data.open) / data.open) * 100 : 0;

        this.prices.set(token, {
          ltp: parseFloat(newLtp.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
          open: data.open,
          close: data.close,
        });
      }
      this.notifySubscribers();
    }, 1000);
  }

  public stopMockSimulation() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
      console.log("[PriceStore] Stopped mock market price simulation loop.");
    }
  }
}

export const priceStore = PriceStore.getInstance();
