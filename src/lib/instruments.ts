import fs from "fs";
import path from "path";

export interface Instrument {
  token: string;
  symbol: string;
  name: string;
  lotsize: number;
  exchSeg: string;
  tickSize: number;
}

let cachedInstruments: Instrument[] = [];

function loadInstruments(): Instrument[] {
  if (cachedInstruments.length > 0) {
    return cachedInstruments;
  }

  const instruments: Instrument[] = [];

  const parseFile = (fileName: string) => {
    try {
      const csvPath = path.join(process.cwd(), "src", "data", fileName);
      if (!fs.existsSync(csvPath)) {
        console.warn(`[Instruments Helper] Warning: CSV file not found at ${csvPath}`);
        return;
      }

      const content = fs.readFileSync(csvPath, "utf-8");
      const lines = content.split("\n");
      if (lines.length <= 1) return;

      const header = lines[0].trim().split(",");
      const exchangeIdx = header.indexOf("Exchange");
      const tokenIdx = header.indexOf("Token");
      const lotSizeIdx = header.indexOf("LotSize");
      const symbolIdx = header.indexOf("Symbol");
      const tradingSymbolIdx = header.indexOf("TradingSymbol");
      const tickSizeIdx = header.indexOf("TickSize");

      if (exchangeIdx === -1 || tokenIdx === -1 || symbolIdx === -1 || tradingSymbolIdx === -1) {
        console.warn(`[Instruments Helper] Invalid header in ${fileName}`);
        return;
      }

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(",");
        if (parts.length < 5) continue;

        instruments.push({
          token: parts[tokenIdx],
          symbol: parts[tradingSymbolIdx], // e.g. "SBIN-EQ" or "ZYDUSLIFE30JUN26P1240"
          name: parts[symbolIdx],          // e.g. "SBIN" or "ZYDUSLIFE"
          lotsize: parseInt(parts[lotSizeIdx]) || 1,
          exchSeg: parts[exchangeIdx],
          tickSize: parseFloat(parts[tickSizeIdx]) || 0.05,
        });
      }
    } catch (error) {
      console.error(`[Instruments Helper] Error parsing CSV file ${fileName}:`, error);
    }
  };

  console.log("[Instruments Helper] Loading symbol CSV files from src/data...");
  parseFile("NSE_symbols.csv");
  parseFile("NFO_symbols.csv");

  cachedInstruments = instruments;
  console.log(`[Instruments Helper] Loaded ${cachedInstruments.length} total instruments`);
  return cachedInstruments;
}

// ─────────────────────────────────────────────────────────────────
// Public API Functions
// ─────────────────────────────────────────────────────────────────

export async function searchInstruments(query: string, limit = 10): Promise<Instrument[]> {
  const instruments = loadInstruments();
  if (!query) return [];

  const lowerQuery = query.toLowerCase();
  const results: Instrument[] = [];

  for (const inst of instruments) {
    if (
      inst.symbol.toLowerCase().includes(lowerQuery) ||
      inst.name.toLowerCase().includes(lowerQuery)
    ) {
      results.push(inst);
      if (results.length >= limit) break;
    }
  }

  return results;
}

export async function getInstrumentByToken(token: string): Promise<Instrument | null> {
  const instruments = loadInstruments();
  return instruments.find((inst) => inst.token === token) || null;
}

export async function getInstrumentBySymbol(symbol: string): Promise<Instrument | null> {
  const instruments = loadInstruments();
  const lowerSymbol = symbol.toLowerCase();
  return instruments.find((inst) => inst.symbol.toLowerCase() === lowerSymbol) || null;
}

export async function getInstrumentByName(name: string): Promise<Instrument | null> {
  const instruments = loadInstruments();
  const lowerName = name.toLowerCase();
  return instruments.find((inst) => inst.name.toLowerCase() === lowerName) || null;
}

export async function getInstrumentsByTokens(tokens: string[]): Promise<Instrument[]> {
  const instruments = loadInstruments();
  const tokenSet = new Set(tokens);
  return instruments.filter((inst) => tokenSet.has(inst.token));
}

const NIFTY50_SYMBOLS = [
  "ADANIENT-EQ", "ADANIPORTS-EQ", "APOLLOHOSP-EQ", "ASIANPAINT-EQ", "AXISBANK-EQ",
  "BAJAJ-AUTO-EQ", "BAJFINANCE-EQ", "BAJAJFINSV-EQ", "BEL-EQ", "BHARTIARTL-EQ",
  "BPCL-EQ", "BRITANNIA-EQ", "CIPLA-EQ", "COALINDIA-EQ", "DIVISLAB-EQ",
  "DRREDDY-EQ", "EICHERMOT-EQ", "GRASIM-EQ", "HCLTECH-EQ", "HDFCBANK-EQ",
  "HDFCLIFE-EQ", "HEROMOTOCO-EQ", "HINDALCO-EQ", "HINDUNILVR-EQ", "ICICIBANK-EQ",
  "INDUSINDBK-EQ", "INFY-EQ", "ITC-EQ", "JSWSTEEL-EQ", "KOTAKBANK-EQ",
  "LT-EQ", "M&M-EQ", "MARUTI-EQ", "NESTLEIND-EQ", "NTPC-EQ",
  "ONGC-EQ", "POWERGRID-EQ", "RELIANCE-EQ", "SBILIFE-EQ", "SBIN-EQ",
  "SHRIRAMFIN-EQ", "SUNPHARMA-EQ", "TATACONSUM-EQ", "TATAMOTORS-EQ", "TATASTEEL-EQ",
  "TCS-EQ", "TECHM-EQ", "TITAN-EQ", "ULTRACEMCO-EQ", "WIPRO-EQ"
];

export async function getNifty50Instruments(): Promise<Instrument[]> {
  const instruments = loadInstruments();
  const niftySet = new Set(NIFTY50_SYMBOLS);
  return instruments.filter((inst) => niftySet.has(inst.symbol));
}
