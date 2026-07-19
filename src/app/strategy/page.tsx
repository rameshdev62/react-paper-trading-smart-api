"use client";

import React, { useState, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import { Navbar } from "@/components/Navbar";
import { SymbolSearch } from "@/components/SymbolSearch";
import { 
  Trash2, 
  Loader2, 
  AlertCircle,
  Zap,
  Target,
  ShieldAlert,
  Coins,
  Info,
  Calendar,
  History,
  Activity,
  LineChart
} from "lucide-react";

interface Strategy {
  id: string;
  symbol: string;
  token: string;
  exchange: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stoplossPrice: number;
  targetPrice: number;
  quantity: number;
  status: "PENDING" | "ACTIVE" | "TARGET HIT" | "STOPLOSS HIT" | "CANCELLED";
  createdAt: string;
  executedEntryPrice?: number;
  completedAt?: string;
  pnl?: number;
  realOrdersExecuted: boolean;
  entryOrderId?: string;
  targetOrderId?: string;
  stoplossOrderId?: string;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ScanResult {
  id: string;
  time: string;
  entry: number;
  stoploss: number;
  target: number;
  outcome: "TARGET HIT" | "STOPLOSS HIT" | "OPEN";
  pnlPercent: number;
  durationCandles: number;
}

export default function StrategyPage() {
  const { prices, orders, submitOrder, cancelOrder, refreshOrders } = useApp();
  const [selectedInstrument, setSelectedInstrument] = useState<{
    symbol: string;
    token: string;
    exchange: string;
  } | null>({
    symbol: "SBIN",
    token: "3045",
    exchange: "NSE",
  });

  const [direction, setDirection] = useState<"BUY" | "SELL">("BUY");
  const [entryPrice, setEntryPrice] = useState<number>(840.0);
  const [stoplossPrice, setStoplossPrice] = useState<number>(830.0);
  const [targetPrice, setTargetPrice] = useState<number>(860.0);
  const [quantity, setQuantity] = useState<number>(10);
  const [realOrders, setRealOrders] = useState<boolean>(false);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loadingInitialPrice, setLoadingInitialPrice] = useState<boolean>(false);

  // Tabs for the bottom section
  const [bottomTab, setBottomTab] = useState<"tracker" | "scanner">("tracker");
  
  // Historical Scanner states
  const [scanTimeframe, setScanTimeframe] = useState<"15m" | "1h" | "2h" | "3h">("1h");
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [totalCandlesScanned, setTotalCandlesScanned] = useState<number>(0);
  const [scanSource, setScanSource] = useState<string>("");
  const [scanWarning, setScanWarning] = useState<string>("");

  // SVG Drag state
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeDrag, setActiveDrag] = useState<"target" | "entry" | "stoploss" | null>(null);
  const dragRangeRef = useRef<{ minPrice: number; maxPrice: number } | null>(null);

  // Get current LTP from AppContext prices or default baseline
  const priceInfo = selectedInstrument ? prices[selectedInstrument.token] : null;
  const ltp = priceInfo ? priceInfo.ltp : 100.0;

  // Load strategies from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("paper_strategies");
    if (saved) {
      try {
        setStrategies(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved strategies:", e);
      }
    }
  }, []);

  // Save strategies to local storage on change
  const saveStrategies = (updated: Strategy[]) => {
    setStrategies(updated);
    localStorage.setItem("paper_strategies", JSON.stringify(updated));
  };

  // Sync prices when a new stock is selected
  useEffect(() => {
    if (!selectedInstrument) return;
    
    setLoadingInitialPrice(true);
    // Clear scan results when instrument changes
    setScanResults([]);
    setTotalCandlesScanned(0);
    setScanSource("");
    setScanWarning("");
    
    fetch(`/api/market/quote?exchange=${selectedInstrument.exchange}&token=${selectedInstrument.token}`)
      .then(async (res) => {
        if (res.ok) {
          const quote = await res.json();
          const currentLtp = quote.ltp || 100.0;
          initializeDefaultPrices(currentLtp);
        } else {
          const fallbackLtp = prices[selectedInstrument.token]?.ltp || 150.0;
          initializeDefaultPrices(fallbackLtp);
        }
      })
      .catch(() => {
        const fallbackLtp = prices[selectedInstrument.token]?.ltp || 150.0;
        initializeDefaultPrices(fallbackLtp);
      })
      .finally(() => {
        setLoadingInitialPrice(false);
      });
  }, [selectedInstrument]);

  const initializeDefaultPrices = (baseLtp: number) => {
    setEntryPrice(baseLtp);
    if (direction === "BUY") {
      setStoplossPrice(parseFloat((baseLtp * 0.985).toFixed(2))); // -1.5% stoploss
      setTargetPrice(parseFloat((baseLtp * 1.03).toFixed(2)));    // +3% target
    } else {
      setStoplossPrice(parseFloat((baseLtp * 1.015).toFixed(2))); // +1.5% stoploss
      setTargetPrice(parseFloat((baseLtp * 0.97).toFixed(2)));    // -3% target
    }
  };

  // Keep strategy targets/stoplosses valid when switching direction
  const handleDirectionChange = (newDir: "BUY" | "SELL") => {
    setDirection(newDir);
    const baseLtp = ltp || entryPrice;
    if (newDir === "BUY") {
      setStoplossPrice(parseFloat((baseLtp * 0.985).toFixed(2)));
      setTargetPrice(parseFloat((baseLtp * 1.03).toFixed(2)));
    } else {
      setStoplossPrice(parseFloat((baseLtp * 1.015).toFixed(2)));
      setTargetPrice(parseFloat((baseLtp * 0.97).toFixed(2)));
    }
  };

  // Price range configuration for SVG scaling
  const maxPrice = direction === "BUY"
    ? Math.max(targetPrice, entryPrice, stoplossPrice) + (targetPrice - entryPrice) * 0.25
    : Math.max(targetPrice, entryPrice, stoplossPrice) + (stoplossPrice - entryPrice) * 0.25;

  const minPrice = direction === "BUY"
    ? Math.min(targetPrice, entryPrice, stoplossPrice) - (entryPrice - stoplossPrice) * 0.25
    : Math.min(targetPrice, entryPrice, stoplossPrice) - (entryPrice - targetPrice) * 0.25;

  // Formula to map price to Y coordinate inside the 400px high SVG (working area 50px to 350px)
  const getY = (price: number) => {
    const range = maxPrice - minPrice || 1;
    const pct = (maxPrice - price) / range;
    return 50 + pct * 300;
  };

  // Dragging event handlers
  const handleMouseDown = (e: React.MouseEvent, line: "target" | "entry" | "stoploss") => {
    e.preventDefault();
    setActiveDrag(line);
    dragRangeRef.current = { minPrice, maxPrice };
  };

  const handleTouchStart = (e: React.TouchEvent, line: "target" | "entry" | "stoploss") => {
    setActiveDrag(line);
    dragRangeRef.current = { minPrice, maxPrice };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activeDrag || !dragRangeRef.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseY = e.clientY - rect.top;
    updatePriceFromY(mouseY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!activeDrag || !dragRangeRef.current || !svgRef.current || e.touches.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseY = e.touches[0].clientY - rect.top;
    updatePriceFromY(mouseY);
  };

  const updatePriceFromY = (mouseY: number) => {
    const { minPrice: dragMin, maxPrice: dragMax } = dragRangeRef.current!;
    const clampedY = Math.max(50, Math.min(350, mouseY));
    const pct = (clampedY - 50) / 300;
    const calculatedPrice = dragMax - pct * (dragMax - dragMin);
    
    // Round to nearest 0.05 tick size
    const roundedPrice = Math.round(calculatedPrice * 20) / 20;

    if (activeDrag === "target") {
      setTargetPrice(roundedPrice);
    } else if (activeDrag === "entry") {
      setEntryPrice(roundedPrice);
    } else if (activeDrag === "stoploss") {
      setStoplossPrice(roundedPrice);
    }
  };

  const handleMouseUp = () => {
    setActiveDrag(null);
    dragRangeRef.current = null;
  };

  // Listen for mouseup on document to stop dragging if mouse leaves SVG
  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchend", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, []);

  // Submit Order Helper
  const placeOrderWithResult = async (params: {
    symbol: string;
    token: string;
    exchange: string;
    quantity: number;
    price: number;
    orderType: "MARKET" | "LIMIT" | "SL";
    transactionType: "BUY" | "SELL";
    productType: "INTRADAY" | "DELIVERY";
  }) => {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(params),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Order execution failed");
    return data.order;
  };

  // Launch Strategy
  const handleLaunchStrategy = async () => {
    if (!selectedInstrument) return;
    
    // Validations
    if (quantity <= 0) {
      alert("Quantity must be greater than 0");
      return;
    }

    if (direction === "BUY") {
      if (targetPrice <= entryPrice) {
        alert("For a BUY strategy, Target Price must be higher than Entry Price");
        return;
      }
      if (stoplossPrice >= entryPrice) {
        alert("For a BUY strategy, Stoploss Price must be lower than Entry Price");
        return;
      }
    } else {
      if (targetPrice >= entryPrice) {
        alert("For a SELL strategy, Target Price must be lower than Entry Price");
        return;
      }
      if (stoplossPrice <= entryPrice) {
        alert("For a SELL strategy, Stoploss Price must be higher than Entry Price");
        return;
      }
    }

    const strategyId = Math.random().toString(36).substr(2, 9);
    
    let entryOrderId: string | undefined;
    let targetOrderId: string | undefined;
    let stoplossOrderId: string | undefined;
    let initialStatus: Strategy["status"] = "PENDING";
    let actualExecutedPrice = entryPrice;

    if (realOrders) {
      try {
        // Place Entry Order
        const isCloseToLtp = Math.abs(entryPrice - ltp) / ltp < 0.005;
        const entryOrderType = isCloseToLtp ? "MARKET" : "LIMIT";
        
        const order = await placeOrderWithResult({
          symbol: selectedInstrument.symbol,
          token: selectedInstrument.token,
          exchange: selectedInstrument.exchange,
          quantity,
          price: entryOrderType === "MARKET" ? 0 : entryPrice,
          orderType: entryOrderType,
          transactionType: direction,
          productType: "DELIVERY",
        });

        entryOrderId = order.id;
        
        if (order.status === "COMPLETED") {
          initialStatus = "ACTIVE";
          actualExecutedPrice = order.price;
          
          // Submit target and stoploss immediately!
          const targetOrder = await placeOrderWithResult({
            symbol: selectedInstrument.symbol,
            token: selectedInstrument.token,
            exchange: selectedInstrument.exchange,
            quantity,
            price: targetPrice,
            orderType: "LIMIT",
            transactionType: direction === "BUY" ? "SELL" : "BUY",
            productType: "DELIVERY",
          });
          targetOrderId = targetOrder.id;

          const slOrder = await placeOrderWithResult({
            symbol: selectedInstrument.symbol,
            token: selectedInstrument.token,
            exchange: selectedInstrument.exchange,
            quantity,
            price: stoplossPrice,
            orderType: "SL",
            transactionType: direction === "BUY" ? "SELL" : "BUY",
            productType: "DELIVERY",
          });
          stoplossOrderId = slOrder.id;
        }
      } catch (err: any) {
        alert("Failed to submit actual orders: " + err.message);
        return;
      }
    }

    const newStrategy: Strategy = {
      id: strategyId,
      symbol: selectedInstrument.symbol,
      token: selectedInstrument.token,
      exchange: selectedInstrument.exchange,
      direction,
      entryPrice,
      stoplossPrice,
      targetPrice,
      quantity,
      status: initialStatus,
      createdAt: new Date().toISOString(),
      realOrdersExecuted: realOrders,
      entryOrderId,
      targetOrderId,
      stoplossOrderId,
      executedEntryPrice: initialStatus === "ACTIVE" ? actualExecutedPrice : undefined,
    };

    saveStrategies([newStrategy, ...strategies]);
    alert(`Strategy launched successfully! Type: ${realOrders ? "PAPER TRADE BRACKET" : "VIRTUAL SIMULATION"}`);
    
    if (realOrders) {
      setTimeout(() => refreshOrders(), 505);
    }
  };

  // Cancel or Square off Strategy
  const handleExitStrategy = async (strat: Strategy) => {
    let updatedStatus: Strategy["status"] = "CANCELLED";
    let completedPrice = ltp;

    if (strat.realOrdersExecuted) {
      try {
        if (strat.status === "PENDING" && strat.entryOrderId) {
          await cancelOrder(strat.entryOrderId);
          alert("Strategy entry order cancelled.");
        } else if (strat.status === "ACTIVE") {
          if (strat.targetOrderId) await cancelOrder(strat.targetOrderId);
          if (strat.stoplossOrderId) await cancelOrder(strat.stoplossOrderId);
          
          const exitOrder = await placeOrderWithResult({
            symbol: strat.symbol,
            token: strat.token,
            exchange: strat.exchange,
            quantity: strat.quantity,
            price: 0,
            orderType: "MARKET",
            transactionType: strat.direction === "BUY" ? "SELL" : "BUY",
            productType: "DELIVERY",
          });
          completedPrice = exitOrder.price || ltp;
          updatedStatus = "CANCELLED";
          alert("Position squared off at market price: ₹" + completedPrice);
        }
      } catch (err: any) {
        alert("Failed to execute square-off: " + err.message);
        return;
      }
    } else {
      updatedStatus = "CANCELLED";
      completedPrice = ltp;
      alert(strat.status === "ACTIVE" ? "Virtual Strategy squared off." : "Virtual Strategy cancelled.");
    }

    const updated = strategies.map((s) => {
      if (s.id === strat.id) {
        return {
          ...s,
          status: updatedStatus,
          completedAt: new Date().toISOString(),
          executedEntryPrice: s.executedEntryPrice || s.entryPrice,
          pnl: calculatePnL(s, completedPrice),
        };
      }
      return s;
    });

    saveStrategies(updated);
    setTimeout(() => refreshOrders(), 505);
  };

  const handleDeleteStrategy = (id: string) => {
    saveStrategies(strategies.filter((s) => s.id !== id));
  };

  // Live strategy monitoring engine: triggers when prices tick
  useEffect(() => {
    let changed = false;
    const updated = strategies.map((strat) => {
      const livePriceInfo = prices[strat.token];
      if (!livePriceInfo) return strat;
      
      const currentLtp = livePriceInfo.ltp;
      
      if (!strat.realOrdersExecuted) {
        if (strat.status === "PENDING") {
          const triggered = strat.direction === "BUY" 
            ? currentLtp <= strat.entryPrice 
            : currentLtp >= strat.entryPrice;
          
          if (triggered) {
            changed = true;
            return {
              ...strat,
              status: "ACTIVE" as const,
              executedEntryPrice: currentLtp,
            };
          }
        } else if (strat.status === "ACTIVE") {
          const targetHit = strat.direction === "BUY"
            ? currentLtp >= strat.targetPrice
            : currentLtp <= strat.targetPrice;
          const slHit = strat.direction === "BUY"
            ? currentLtp <= strat.stoplossPrice
            : currentLtp >= strat.stoplossPrice;

          if (targetHit) {
            changed = true;
            return {
              ...strat,
              status: "TARGET HIT" as const,
              completedAt: new Date().toISOString(),
              pnl: calculatePnL(strat, currentLtp),
            };
          } else if (slHit) {
            changed = true;
            return {
              ...strat,
              status: "STOPLOSS HIT" as const,
              completedAt: new Date().toISOString(),
              pnl: calculatePnL(strat, currentLtp),
            };
          }
        }
      } else {
        if (strat.status === "PENDING" && strat.entryOrderId) {
          const matchedEntry = orders.find((o) => o.id === strat.entryOrderId);
          if (matchedEntry?.status === "COMPLETED") {
            changed = true;
            
            let targetId = strat.targetOrderId;
            let slId = strat.stoplossOrderId;

            if (!targetId || !slId) {
              placeOrderWithResult({
                symbol: strat.symbol,
                token: strat.token,
                exchange: strat.exchange,
                quantity: strat.quantity,
                price: strat.targetPrice,
                orderType: "LIMIT",
                transactionType: strat.direction === "BUY" ? "SELL" : "BUY",
                productType: "DELIVERY",
              }).then(o => {
                strat.targetOrderId = o.id;
                saveStrategies([...strategies]);
              }).catch(console.error);

              placeOrderWithResult({
                symbol: strat.symbol,
                token: strat.token,
                exchange: strat.exchange,
                quantity: strat.quantity,
                price: strat.stoplossPrice,
                orderType: "SL",
                transactionType: strat.direction === "BUY" ? "SELL" : "BUY",
                productType: "DELIVERY",
              }).then(o => {
                strat.stoplossOrderId = o.id;
                saveStrategies([...strategies]);
              }).catch(console.error);
            }

            return {
              ...strat,
              status: "ACTIVE" as const,
              executedEntryPrice: matchedEntry.price || strat.entryPrice,
            };
          } else if (matchedEntry?.status === "CANCELLED" || matchedEntry?.status === "REJECTED") {
            changed = true;
            return {
              ...strat,
              status: "CANCELLED" as const,
              completedAt: new Date().toISOString(),
            };
          }
        } else if (strat.status === "ACTIVE") {
          const matchedTarget = orders.find((o) => o.id === strat.targetOrderId);
          const matchedSL = orders.find((o) => o.id === strat.stoplossOrderId);

          if (matchedTarget?.status === "COMPLETED") {
            changed = true;
            if (strat.stoplossOrderId) cancelOrder(strat.stoplossOrderId).catch(console.error);
            return {
              ...strat,
              status: "TARGET HIT" as const,
              completedAt: new Date().toISOString(),
              pnl: calculatePnL(strat, matchedTarget.price || strat.targetPrice),
            };
          } else if (matchedSL?.status === "COMPLETED") {
            changed = true;
            if (strat.targetOrderId) cancelOrder(strat.targetOrderId).catch(console.error);
            return {
              ...strat,
              status: "STOPLOSS HIT" as const,
              completedAt: new Date().toISOString(),
              pnl: calculatePnL(strat, matchedSL.price || strat.stoplossPrice),
            };
          }
        }
      }

      return strat;
    });

    if (changed) {
      saveStrategies(updated);
    }
  }, [prices, orders, strategies]);

  const calculatePnL = (strat: Strategy, currentPrice: number) => {
    const entry = strat.executedEntryPrice || strat.entryPrice;
    if (strat.direction === "BUY") {
      return (currentPrice - entry) * strat.quantity;
    } else {
      return (entry - currentPrice) * strat.quantity;
    }
  };

  // Math Calculations for Dashboard UI
  const riskRewardRatio = (() => {
    const risk = Math.abs(entryPrice - stoplossPrice);
    const reward = Math.abs(targetPrice - entryPrice);
    if (risk === 0) return 0;
    return parseFloat((reward / risk).toFixed(2));
  })();

  const estMargin = quantity * entryPrice;
  const potentialProfit = quantity * Math.abs(targetPrice - entryPrice);
  const potentialLoss = quantity * Math.abs(entryPrice - stoplossPrice);

  const getPercentOffset = (price: number) => {
    const diff = ((price - entryPrice) / entryPrice) * 100;
    return (diff >= 0 ? "+" : "") + diff.toFixed(2) + "%";
  };

  // Run historical scanner algorithm
  const handleScanHistory = async () => {
    if (!selectedInstrument) return;
    setScanning(true);
    setScanResults([]);
    setTotalCandlesScanned(0);

    try {
      const res = await fetch(
        `/api/market/history?exchange=${selectedInstrument.exchange}&token=${selectedInstrument.token}&timeframe=${scanTimeframe}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          }
        }
      );
      
      if (!res.ok) throw new Error("History fetch failed");
      const data = await res.json();
      
      setScanWarning(data.reason || "");
      const candlesList: Candle[] = data.candles || [];
      setTotalCandlesScanned(candlesList.length);
      setScanSource(data.source === "live" ? "Live Shoonya Feed" : "Simulated Feed");

      if (candlesList.length < 5) {
        setScanning(false);
        alert("Insufficient historical candles returned to scan pattern.");
        return;
      }

      const results: ScanResult[] = [];

      // Scan logic for 3-candle patterns: C1, C2, C3
      for (let i = 1; i < candlesList.length - 1; i++) {
        const c1 = candlesList[i - 1];
        const c2 = candlesList[i];
        const c3 = candlesList[i + 1];

        const body1 = Math.abs(c1.open - c1.close);
        const range2 = c2.high - c2.low;
        const body2 = Math.abs(c2.open - c2.close);

        if (direction === "BUY") {
          // --- BULLISH REVERSAL PINBAR BREAKOUT ---
          const isC1Bearish = c1.close < c1.open;
          const isC2Lowest = c2.low <= c1.low && c2.low < c3.low;
          const lowerWick2 = Math.min(c2.open, c2.close) - c2.low;
          const isC2Pinbar = range2 > 0 && (body2 / range2) <= 0.45 && (lowerWick2 / range2) >= 0.35;
          const isC3Bullish = c3.close > c3.open;
          const isC3Breakout = c3.close > c1.high && c3.close > c2.high;

          if (
            isC1Bearish &&
            body1 > c1.open * 0.0015 && // large red candle
            isC2Lowest &&
            isC2Pinbar && // pinbar at bottom
            isC3Bullish &&
            isC3Breakout // large green candle breaks out
          ) {
            const entry = c2.high;
            const stoploss = c2.low;
            const risk = entry - stoploss;
            const target = entry + risk * 2; // standard 1:2 risk-reward

            // Forward test to determine outcome
            let outcome: "TARGET HIT" | "STOPLOSS HIT" | "OPEN" = "OPEN";
            let duration = 0;
            for (let j = i + 2; j < candlesList.length; j++) {
              duration++;
              const check = candlesList[j];
              if (check.low <= stoploss) {
                outcome = "STOPLOSS HIT";
                break;
              }
              if (check.high >= target) {
                outcome = "TARGET HIT";
                break;
              }
            }

            results.push({
              id: `scan-${i}-${Date.now()}`,
              time: c2.time,
              entry: parseFloat(entry.toFixed(2)),
              stoploss: parseFloat(stoploss.toFixed(2)),
              target: parseFloat(target.toFixed(2)),
              outcome,
              pnlPercent: outcome === "TARGET HIT" ? 200 : outcome === "STOPLOSS HIT" ? -100 : 0,
              durationCandles: duration,
            });
          }
        } else {
          // --- BEARISH REVERSAL PINBAR BREAKOUT ---
          const isC1Bullish = c1.close > c1.open;
          const isC2Highest = c2.high >= c1.high && c2.high > c3.high;
          const upperWick2 = c2.high - Math.max(c2.open, c2.close);
          const isC2Pinbar = range2 > 0 && (body2 / range2) <= 0.45 && (upperWick2 / range2) >= 0.35;
          const isC3Bearish = c3.close < c3.open;
          const isC3Breakout = c3.close < c1.low && c3.close < c2.low;

          if (
            isC1Bullish &&
            body1 > c1.open * 0.0015 &&
            isC2Highest &&
            isC2Pinbar &&
            isC3Bearish &&
            isC3Breakout
          ) {
            const entry = c2.low;
            const stoploss = c2.high;
            const risk = stoploss - entry;
            const target = entry - risk * 2;

            let outcome: "TARGET HIT" | "STOPLOSS HIT" | "OPEN" = "OPEN";
            let duration = 0;
            for (let j = i + 2; j < candlesList.length; j++) {
              duration++;
              const check = candlesList[j];
              if (check.high >= stoploss) {
                outcome = "STOPLOSS HIT";
                break;
              }
              if (check.low <= target) {
                outcome = "TARGET HIT";
                break;
              }
            }

            results.push({
              id: `scan-${i}-${Date.now()}`,
              time: c2.time,
              entry: parseFloat(entry.toFixed(2)),
              stoploss: parseFloat(stoploss.toFixed(2)),
              target: parseFloat(target.toFixed(2)),
              outcome,
              pnlPercent: outcome === "TARGET HIT" ? 200 : outcome === "STOPLOSS HIT" ? -100 : 0,
              durationCandles: duration,
            });
          }
        }
      }

      setScanResults(results.reverse()); // Show newest first
    } catch (err: any) {
      console.error(err);
      alert("Error scanning market history: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  // Load a historical occurrence into the interactive visualizer
  const handleLoadOccurrence = (res: ScanResult) => {
    setEntryPrice(res.entry);
    setStoplossPrice(res.stoploss);
    setTargetPrice(res.target);
    alert(`Loaded occurrence levels into visualizer:\nEntry: ₹${res.entry}\nStoploss: ₹${res.stoploss}\nTarget: ₹${res.target}`);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-slate-100 min-h-screen">
      <Navbar />

      <main className="flex-1 p-6 flex flex-col xl:flex-row gap-6 w-full mx-auto max-w-7xl">
        
        {/* Left Side Column: Config & Draggable Chart */}
        <div className="flex-1 flex flex-col gap-6">
          
          {/* Top Panel: Instrument Selection */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="w-full md:max-w-xs flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Select stock / index
              </label>
              <SymbolSearch 
                onSelectInstrument={(inst) => {
                  setSelectedInstrument(inst);
                }} 
                activeGroup="Default" 
              />
            </div>

            {selectedInstrument && (
              <div className="flex flex-wrap items-center gap-6 mt-3 md:mt-0">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-extrabold text-base text-slate-100">{selectedInstrument.symbol}</h2>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700/60 rounded">
                      {selectedInstrument.exchange}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">Token: {selectedInstrument.token}</p>
                </div>

                <div className="bg-slate-950/80 px-4 py-2 border border-slate-800/80 rounded-lg flex flex-col items-end">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Live LTP</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {loadingInitialPrice ? (
                      <Loader2 className="w-3.5 h-3.5 text-slate-500 animate-spin" />
                    ) : (
                      <>
                        <span className="text-sm font-bold text-slate-150">₹{ltp.toFixed(2)}</span>
                        <span className={`text-xs font-semibold flex items-center ${priceInfo && priceInfo.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {priceInfo && priceInfo.changePercent >= 0 ? "+" : ""}{priceInfo?.changePercent.toFixed(2) || "0.00"}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Center Panel: SVG Candlestick Pattern Visualizer */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4 relative overflow-hidden">
            <div className="flex justify-between items-center border-b border-slate-800/60 pb-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  Interactive Strategy Visualizer
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Drag the handles on the right or input values to design your bracket levels.
                </p>
              </div>
              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                <button
                  onClick={() => handleDirectionChange("BUY")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all ${
                    direction === "BUY" ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/10" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Bullish (BUY)
                </button>
                <button
                  onClick={() => handleDirectionChange("SELL")}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md uppercase tracking-wider transition-all ${
                    direction === "SELL" ? "bg-rose-500 text-white shadow-md shadow-rose-500/10" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Bearish (SELL)
                </button>
              </div>
            </div>

            {/* SVG Visualizer */}
            <div className="relative border border-slate-950 rounded-lg bg-slate-950/40 p-2 h-[410px] select-none">
              <svg
                ref={svgRef}
                viewBox="0 0 600 400"
                className="w-full h-full"
                onMouseMove={handleMouseMove}
                onTouchMove={handleTouchMove}
              >
                <defs>
                  <linearGradient id="bullish-candle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                  <linearGradient id="bearish-candle" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                  
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(30, 41, 59, 0.3)" strokeWidth="1" />
                  </pattern>

                  <linearGradient id="reward-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.06" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                  </linearGradient>
                  <linearGradient id="risk-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.06" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                <rect width="600" height="400" fill="url(#grid)" />

                {/* Reward & Risk Shaded Areas */}
                {direction === "BUY" ? (
                  <>
                    <rect x="50" y={Math.min(getY(targetPrice), getY(entryPrice))} width="500" height={Math.abs(getY(targetPrice) - getY(entryPrice))} fill="url(#reward-grad)" />
                    <rect x="50" y={Math.min(getY(entryPrice), getY(stoplossPrice))} width="500" height={Math.abs(getY(entryPrice) - getY(stoplossPrice))} fill="url(#risk-grad)" />
                  </>
                ) : (
                  <>
                    <rect x="50" y={Math.min(getY(entryPrice), getY(targetPrice))} width="500" height={Math.abs(getY(entryPrice) - getY(targetPrice))} fill="url(#reward-grad)" />
                    <rect x="50" y={Math.min(getY(stoplossPrice), getY(entryPrice))} width="500" height={Math.abs(getY(stoplossPrice) - getY(entryPrice))} fill="url(#risk-grad)" />
                  </>
                )}

                {/* --- CANDLE 1 --- */}
                {direction === "BUY" ? (
                  <g>
                    <line x1="150" y1={getY(entryPrice + (targetPrice - entryPrice) * 0.2)} x2="150" y2={getY(stoplossPrice + (entryPrice - stoplossPrice) * 0.1)} stroke="#ef4444" strokeWidth="2.5" />
                    <rect x="132" y={getY(entryPrice + (targetPrice - entryPrice) * 0.15)} width="36" height={Math.abs(getY(entryPrice + (targetPrice - entryPrice) * 0.15) - getY(entryPrice - (entryPrice - stoplossPrice) * 0.35))} fill="url(#bearish-candle)" rx="2" />
                  </g>
                ) : (
                  <g>
                    <line x1="150" y1={getY(entryPrice - (entryPrice - targetPrice) * 0.2)} x2="150" y2={getY(stoplossPrice - (stoplossPrice - entryPrice) * 0.1)} stroke="#10b981" strokeWidth="2.5" />
                    <rect x="132" y={getY(entryPrice + (stoplossPrice - entryPrice) * 0.35)} width="36" height={Math.abs(getY(entryPrice - (entryPrice - targetPrice) * 0.15) - getY(entryPrice + (stoplossPrice - entryPrice) * 0.35))} fill="url(#bullish-candle)" rx="2" />
                  </g>
                )}

                {/* --- CANDLE 2 (Pinbar) --- */}
                {direction === "BUY" ? (
                  <g>
                    <line x1="300" y1={getY(entryPrice)} x2="300" y2={getY(stoplossPrice)} stroke="#10b981" strokeWidth="2.5" />
                    <rect x="282" y={getY(entryPrice - (entryPrice - stoplossPrice) * 0.4)} width="36" height={Math.abs(getY(entryPrice - (entryPrice - stoplossPrice) * 0.4) - getY(entryPrice - (entryPrice - stoplossPrice) * 0.65))} fill="url(#bullish-candle)" rx="2" />
                  </g>
                ) : (
                  <g>
                    <line x1="300" y1={getY(entryPrice)} x2="300" y2={getY(stoplossPrice)} stroke="#ef4444" strokeWidth="2.5" />
                    <rect x="282" y={getY(entryPrice + (stoplossPrice - entryPrice) * 0.65)} width="36" height={Math.abs(getY(entryPrice + (stoplossPrice - entryPrice) * 0.4) - getY(entryPrice + (stoplossPrice - entryPrice) * 0.65))} fill="url(#bearish-candle)" rx="2" />
                  </g>
                )}

                {/* --- CANDLE 3 (Breakout) --- */}
                {direction === "BUY" ? (
                  <g>
                    <line x1="450" y1={getY(targetPrice)} x2="450" y2={getY(entryPrice - (entryPrice - stoplossPrice) * 0.15)} stroke="#10b981" strokeWidth="2.5" />
                    <rect x="432" y={getY(targetPrice)} width="36" height={Math.abs(getY(targetPrice) - getY(entryPrice))} fill="url(#bullish-candle)" rx="2" />
                  </g>
                ) : (
                  <g>
                    <line x1="450" y1={getY(entryPrice + (stoplossPrice - entryPrice) * 0.15)} x2="450" y2={getY(targetPrice)} stroke="#ef4444" strokeWidth="2.5" />
                    <rect x="432" y={getY(entryPrice)} width="36" height={Math.abs(getY(entryPrice) - getY(targetPrice))} fill="url(#bearish-candle)" rx="2" />
                  </g>
                )}

                {/* Stoploss Line */}
                <line x1="50" y1={getY(stoplossPrice)} x2="550" y2={getY(stoplossPrice)} stroke="#ef4444" strokeWidth="2" className="transition-all" />
                
                {/* Entry Line */}
                <line x1="50" y1={getY(entryPrice)} x2="550" y2={getY(entryPrice)} stroke="#38bdf8" strokeWidth="2" className="transition-all" />

                {/* Target Line */}
                <line x1="50" y1={getY(targetPrice)} x2="550" y2={getY(targetPrice)} stroke="#10b981" strokeWidth="2" strokeDasharray="5,5" className="transition-all" />

                {/* Target Handle */}
                <g 
                  transform={`translate(535, ${getY(targetPrice) - 10})`}
                  cursor="ns-resize"
                  onMouseDown={(e) => handleMouseDown(e, "target")}
                  onTouchStart={(e) => handleTouchStart(e, "target")}
                >
                  <rect width="55" height="20" rx="4" fill="#10b981" className="shadow-lg hover:fill-emerald-400 transition-colors" />
                  <text x="27.5" y="13" fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle">
                    TGT: {getPercentOffset(targetPrice)}
                  </text>
                </g>

                {/* Entry Handle */}
                <g 
                  transform={`translate(535, ${getY(entryPrice) - 10})`}
                  cursor="ns-resize"
                  onMouseDown={(e) => handleMouseDown(e, "entry")}
                  onTouchStart={(e) => handleTouchStart(e, "entry")}
                >
                  <rect width="55" height="20" rx="4" fill="#0284c7" className="shadow-lg hover:fill-sky-400 transition-colors" />
                  <text x="27.5" y="13" fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle">
                    ENT
                  </text>
                </g>

                {/* Stoploss Handle */}
                <g 
                  transform={`translate(535, ${getY(stoplossPrice) - 10})`}
                  cursor="ns-resize"
                  onMouseDown={(e) => handleMouseDown(e, "stoploss")}
                  onTouchStart={(e) => handleTouchStart(e, "stoploss")}
                >
                  <rect width="55" height="20" rx="4" fill="#ef4444" className="shadow-lg hover:fill-rose-400 transition-colors" />
                  <text x="27.5" y="13" fill="#fff" fontSize="9" fontWeight="bold" textAnchor="middle">
                    SL: {getPercentOffset(stoplossPrice)}
                  </text>
                </g>

                {/* Left labels */}
                <g transform={`translate(10, ${getY(targetPrice) - 8})`}>
                  <rect x="0" width="48" height="16" rx="3" fill="#1e293b" stroke="#10b981" strokeWidth="1" opacity="0.9" />
                  <text x="24" y="11" fill="#10b981" fontSize="9" fontWeight="bold" textAnchor="middle">
                    ₹{targetPrice.toFixed(1)}
                  </text>
                </g>

                <g transform={`translate(10, ${getY(entryPrice) - 8})`}>
                  <rect x="0" width="48" height="16" rx="3" fill="#1e293b" stroke="#38bdf8" strokeWidth="1" opacity="0.9" />
                  <text x="24" y="11" fill="#38bdf8" fontSize="9" fontWeight="bold" textAnchor="middle">
                    ₹{entryPrice.toFixed(1)}
                  </text>
                </g>

                <g transform={`translate(10, ${getY(stoplossPrice) - 8})`}>
                  <rect x="0" width="48" height="16" rx="3" fill="#1e293b" stroke="#ef4444" strokeWidth="1" opacity="0.9" />
                  <text x="24" y="11" fill="#ef4444" fontSize="9" fontWeight="bold" textAnchor="middle">
                    ₹{stoplossPrice.toFixed(1)}
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* Right Side Column: Inputs, Summary & Launch */}
        <div className="w-full xl:w-[380px] shrink-0 flex flex-col gap-6">
          
          {/* Card 1: Parameters Setup */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">Strategy Parameters</h3>
              <p className="text-xs text-slate-500 mt-0.5">Customize bracket values manually</p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Entry Price (₹)</label>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
                  <button 
                    onClick={() => setEntryPrice(parseFloat(Math.max(0, entryPrice - 0.5).toFixed(2)))} 
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-8 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    step="0.05"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(parseFloat(e.target.value) || 0)}
                    className="flex-1 text-center bg-transparent border-none text-slate-200 text-sm focus:outline-none font-bold"
                  />
                  <button 
                    onClick={() => setEntryPrice(parseFloat((entryPrice + 0.5).toFixed(2)))} 
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-8 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Target Price (₹)</label>
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
                    <button 
                      onClick={() => setTargetPrice(parseFloat(Math.max(0, targetPrice - 0.5).toFixed(2)))} 
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-6 cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.05"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(parseFloat(e.target.value) || 0)}
                      className="flex-1 text-center bg-transparent border-none text-slate-200 text-xs focus:outline-none font-bold"
                    />
                    <button 
                      onClick={() => setTargetPrice(parseFloat((targetPrice + 0.5).toFixed(2)))} 
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-6 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Stoploss Price (₹)</label>
                  <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
                    <button 
                      onClick={() => setStoplossPrice(parseFloat(Math.max(0, stoplossPrice - 0.5).toFixed(2)))} 
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-6 cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      step="0.05"
                      value={stoplossPrice}
                      onChange={(e) => setStoplossPrice(parseFloat(e.target.value) || 0)}
                      className="flex-1 text-center bg-transparent border-none text-slate-200 text-xs focus:outline-none font-bold"
                    />
                    <button 
                      onClick={() => setStoplossPrice(parseFloat((stoplossPrice + 0.5).toFixed(2)))} 
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-6 cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Quantity (shares)</label>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
                  <button 
                    onClick={() => setQuantity(Math.max(1, quantity - 5))} 
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-8 cursor-pointer"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                    className="flex-1 text-center bg-transparent border-none text-slate-200 text-sm focus:outline-none font-bold"
                  />
                  <button 
                    onClick={() => setQuantity(quantity + 5)} 
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-400 text-xs font-bold w-8 cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-800/60 pt-3.5 mt-1.5">
                <div>
                  <span className="text-xs font-bold text-slate-350 block">Execute Paper Trade Orders</span>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Places actual limit orders to trigger brackets</span>
                </div>
                <button
                  onClick={() => setRealOrders(!realOrders)}
                  className={`w-11 h-6 rounded-full p-1 transition-all ${
                    realOrders ? "bg-emerald-500 flex justify-end" : "bg-slate-800 flex justify-start"
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Risk-Reward Metrics */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div className="border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-sm text-slate-200 uppercase tracking-wider">Strategy Summary</h3>
              <p className="text-xs text-slate-500 mt-0.5">Calculated statistics for this execution</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                  Potential Profit
                </span>
                <span className="text-sm font-extrabold text-emerald-400">₹{potentialProfit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                <span className="text-[10px] text-emerald-500/80 font-bold">{getPercentOffset(targetPrice)} change</span>
              </div>

              <div className="bg-slate-950/60 border border-slate-850 p-3 rounded-lg flex flex-col gap-1">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                  Potential Risk
                </span>
                <span className="text-sm font-extrabold text-rose-400">₹{potentialLoss.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                <span className="text-[10px] text-rose-500/80 font-bold">{getPercentOffset(stoplossPrice)} change</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 bg-slate-950/40 border border-slate-850 p-4 rounded-lg text-xs">
              <div className="flex justify-between">
                <span className="text-slate-550">Risk-Reward Ratio</span>
                <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  riskRewardRatio >= 2.0 
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                    : riskRewardRatio >= 1.0 
                    ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                }`}>
                  1 : {riskRewardRatio} {riskRewardRatio >= 2.0 ? "(Ideal)" : riskRewardRatio >= 1.0 ? "(Moderate)" : "(Poor)"}
                </span>
              </div>
              
              <div className="flex justify-between border-t border-slate-850/60 pt-2">
                <span className="text-slate-550 flex items-center gap-1">
                  <Coins className="w-3.5 h-3.5 text-slate-500" />
                  Margin Required
                </span>
                <span className="font-bold text-slate-300">₹{estMargin.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <button
              onClick={handleLaunchStrategy}
              disabled={loadingInitialPrice || !selectedInstrument}
              className={`w-full py-3 rounded-lg font-bold text-xs shadow-lg uppercase tracking-wider transition-all duration-200 mt-2 ${
                direction === "BUY"
                  ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-500/20 hover:shadow-emerald-500/30"
                  : "bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20 hover:shadow-rose-500/30"
              } disabled:bg-slate-800 disabled:text-slate-550 disabled:cursor-not-allowed`}
            >
              {loadingInitialPrice ? "Fetching quote..." : `Launch ${direction} Strategy`}
            </button>
          </div>

        </div>

      </main>

      {/* Bottom Section: Tracker & History Scanner Tab bar */}
      <section className="p-6 w-full mx-auto max-w-7xl">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-5">
          
          {/* Tab Switcher Headers */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <div className="flex gap-2">
              <button
                onClick={() => setBottomTab("tracker")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                  bottomTab === "tracker"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Activity className="w-4 h-4" />
                Active Tracker ({strategies.length})
              </button>
              
              <button
                onClick={() => setBottomTab("scanner")}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
                  bottomTab === "scanner"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <History className="w-4 h-4" />
                Market History Pattern Scanner
              </button>
            </div>
          </div>

          {/* TAB 1: Active Strategies Tracker */}
          {bottomTab === "tracker" && (
            <div className="flex flex-col gap-4">
              {strategies.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-center">
                  <Info className="w-8 h-8 text-slate-700 mb-2" />
                  <p className="text-sm font-semibold text-slate-400">No active strategies configured</p>
                  <p className="text-xs text-slate-600 mt-1 max-w-sm">
                    Search for a symbol above, configure target/stoploss boundaries on the interactive graph, and click "Launch Strategy" to start tracking.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        <th className="pb-3">Symbol</th>
                        <th className="pb-3">Type</th>
                        <th className="pb-3 text-right">Qty</th>
                        <th className="pb-3 text-right">Entry (Set)</th>
                        <th className="pb-3 text-right">Trigger (LTP)</th>
                        <th className="pb-3 text-right">Stoploss</th>
                        <th className="pb-3 text-right">Target</th>
                        <th className="pb-3 text-right">P&L (Live)</th>
                        <th className="pb-3 text-center">Status</th>
                        <th className="pb-3 text-center">Execution</th>
                        <th className="pb-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-xs text-slate-300">
                      {strategies.map((strat) => {
                        const priceInfoItem = prices[strat.token];
                        const currentLtp = priceInfoItem ? priceInfoItem.ltp : 0.0;
                        
                        let livePnL = 0;

                        if (strat.status === "ACTIVE" && currentLtp > 0) {
                          livePnL = calculatePnL(strat, currentLtp);
                        } else if ((strat.status === "TARGET HIT" || strat.status === "STOPLOSS HIT" || strat.status === "CANCELLED") && strat.pnl !== undefined) {
                          livePnL = strat.pnl;
                        }

                        const isPnLProfit = livePnL >= 0;
                        const isLong = strat.direction === "BUY";

                        return (
                          <tr key={strat.id} className="hover:bg-slate-850/40 transition-colors">
                            <td className="py-3.5 font-bold text-slate-200">
                              <button
                                onClick={() => setSelectedInstrument({ symbol: strat.symbol, token: strat.token, exchange: strat.exchange })}
                                className="flex items-center gap-1 hover:text-emerald-400 cursor-pointer font-bold text-left"
                              >
                                <span>{strat.symbol}</span>
                                <span className="text-[9px] font-bold px-1 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                                  {strat.exchange}
                                </span>
                              </button>
                            </td>

                            <td className="py-3.5 font-semibold">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                                isLong 
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}>
                                {strat.direction}
                              </span>
                            </td>

                            <td className="py-3.5 text-right font-semibold text-slate-350">{strat.quantity}</td>
                            <td className="py-3.5 text-right text-slate-350">₹{strat.entryPrice.toFixed(2)}</td>
                            
                            <td className="py-3.5 text-right font-bold text-slate-100">
                              {strat.status === "PENDING" && currentLtp > 0 ? (
                                <span className="text-slate-400 font-medium">₹{currentLtp.toFixed(2)}</span>
                              ) : strat.executedEntryPrice ? (
                                <span>₹{strat.executedEntryPrice.toFixed(2)}</span>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                            
                            <td className="py-3.5 text-right text-rose-400 font-semibold">₹{strat.stoplossPrice.toFixed(2)}</td>
                            <td className="py-3.5 text-right text-emerald-400 font-semibold">₹{strat.targetPrice.toFixed(2)}</td>
                            
                            <td className={`py-3.5 text-right font-bold`}>
                              {strat.status === "PENDING" ? (
                                <span className="text-slate-550 font-normal">Waiting...</span>
                              ) : (
                                <span className={isPnLProfit ? "text-emerald-400" : "text-rose-400"}>
                                  ₹{livePnL.toLocaleString("en-IN", { minimumFractionDigits: 2, signDisplay: "exceptZero" })}
                                </span>
                              )}
                            </td>

                            <td className="py-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide inline-block ${
                                strat.status === "PENDING"
                                  ? "bg-slate-800 text-slate-400 border border-slate-700"
                                  : strat.status === "ACTIVE"
                                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/20 animate-pulse"
                                  : strat.status === "TARGET HIT"
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                  : strat.status === "STOPLOSS HIT"
                                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                                  : "bg-slate-800 text-slate-500 border border-slate-800/80"
                              }`}>
                                {strat.status}
                              </span>
                            </td>

                            <td className="py-3.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                strat.realOrdersExecuted
                                  ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                                  : "bg-slate-800 text-slate-400 border border-slate-800"
                              }`}>
                                {strat.realOrdersExecuted ? "PAPER TRADE" : "VIRTUAL"}
                              </span>
                            </td>

                            <td className="py-3.5 text-center">
                              <div className="flex justify-center gap-1.5">
                                {strat.status === "PENDING" || strat.status === "ACTIVE" ? (
                                  <button
                                    onClick={() => handleExitStrategy(strat)}
                                    className="px-2.5 py-1 text-[10px] font-bold rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors border border-rose-500/20 cursor-pointer"
                                  >
                                    {strat.status === "PENDING" ? "CANCEL" : "SQUARE OFF"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeleteStrategy(strat.id)}
                                    className="p-1 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-rose-400 border border-slate-700/60 rounded transition-colors cursor-pointer"
                                    title="Remove History"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Historical Pattern Scanner */}
          {bottomTab === "scanner" && (
            <div className="flex flex-col gap-5">
              
              {/* Scanner Control bar */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-950 p-4 border border-slate-850 rounded-lg">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Timeframe:</span>
                  <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                    {(["15m", "1h", "2h", "3h"] as const).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setScanTimeframe(tf)}
                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                          scanTimeframe === tf 
                            ? "bg-slate-850 text-emerald-400 shadow-sm border border-slate-750" 
                            : "text-slate-500 hover:text-slate-350"
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {selectedInstrument && (
                    <div className="text-xs text-slate-400 font-medium">
                      Scanning: <span className="font-bold text-slate-200">{selectedInstrument.symbol}</span>
                    </div>
                  )}
                  <button
                    onClick={handleScanHistory}
                    disabled={scanning || !selectedInstrument}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-md shadow-emerald-500/10 transition-all cursor-pointer disabled:bg-slate-800 disabled:text-slate-550"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Scanning History...
                      </>
                    ) : (
                      <>
                        <LineChart className="w-3.5 h-3.5" />
                        Scan Historical Market Data
                      </>
                    )}
                  </button>
                </div>
              </div>

              {scanWarning && (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-3.5 rounded-lg flex items-start gap-3 text-xs font-semibold animate-fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span>Shoonya Platform Warning: {scanWarning}. </span>
                    <span className="font-normal text-slate-400">
                      We have gracefully loaded simulated historical candles so you can continue testing the pattern.
                    </span>
                  </div>
                </div>
              )}

              {/* Scanner Results Summary Cards */}
              {scanResults.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Patterns Found</span>
                    <span className="text-xl font-extrabold text-slate-100 mt-1">{scanResults.length}</span>
                    <span className="text-[9px] text-slate-500 mt-0.5">Occurrences in past candles</span>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Success Rate</span>
                    {(() => {
                      const closed = scanResults.filter(r => r.outcome !== "OPEN");
                      const wins = closed.filter(r => r.outcome === "TARGET HIT").length;
                      const rate = closed.length > 0 ? (wins / closed.length) * 100 : 0;
                      return (
                        <>
                          <span className={`text-xl font-extrabold mt-1 ${rate >= 60 ? "text-emerald-400" : rate >= 40 ? "text-amber-400" : "text-rose-400"}`}>
                            {rate.toFixed(1)}%
                          </span>
                          <span className="text-[9px] text-slate-500 mt-0.5">{wins} wins out of {closed.length} closed trades</span>
                        </>
                      );
                    })()}
                  </div>

                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Candles Analyzed</span>
                    <span className="text-xl font-extrabold text-slate-200 mt-1">{totalCandlesScanned}</span>
                    <span className="text-[9px] text-slate-500 mt-0.5">Source: {scanSource}</span>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-lg flex flex-col">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Scanning Direction</span>
                    <span className={`text-xl font-extrabold mt-1 ${direction === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>
                      {direction === "BUY" ? "BULLISH" : "BEARISH"}
                    </span>
                    <span className="text-[9px] text-slate-500 mt-0.5">{direction === "BUY" ? "Morning Star Breakouts" : "Evening Star Breakouts"}</span>
                  </div>
                </div>
              )}

              {/* Scanner Results Table */}
              {scanResults.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-550 text-center">
                  <Calendar className="w-8 h-8 text-slate-700 mb-2" />
                  <p className="text-sm font-semibold text-slate-400">
                    {scanning ? "Retrieving market data..." : "No historical patterns loaded yet"}
                  </p>
                  <p className="text-xs text-slate-600 mt-1 max-w-sm">
                    {scanning 
                      ? "This might take a moment. Downloading data series and parsing wicks/bodies." 
                      : "Choose a timeframe and click Scan to parse historical wicks, bodies, and breakouts."}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        <th className="pb-3">Timestamp</th>
                        <th className="pb-3 text-right">Entry Price (₹)</th>
                        <th className="pb-3 text-right">Stoploss (₹)</th>
                        <th className="pb-3 text-right">Target Price (₹)</th>
                        <th className="pb-3 text-center">Duration</th>
                        <th className="pb-3 text-center">Outcome</th>
                        <th className="pb-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40 text-xs text-slate-300">
                      {scanResults.map((res) => {
                        const isWin = res.outcome === "TARGET HIT";
                        const isOpen = res.outcome === "OPEN";

                        return (
                          <tr key={res.id} className="hover:bg-slate-850/40 transition-colors">
                            <td className="py-3 font-semibold text-slate-300">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-slate-550" />
                                <span>{res.time}</span>
                              </div>
                            </td>
                            <td className="py-3 text-right font-medium text-slate-350">₹{res.entry.toFixed(2)}</td>
                            <td className="py-3 text-right text-rose-450 font-medium">₹{res.stoploss.toFixed(2)}</td>
                            <td className="py-3 text-right text-emerald-450 font-medium">₹{res.target.toFixed(2)}</td>
                            
                            <td className="py-3 text-center font-medium text-slate-400">
                              {isOpen ? "Ongoing" : `${res.durationCandles} bars`}
                            </td>

                            <td className="py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide inline-block ${
                                isOpen
                                  ? "bg-slate-800 text-slate-500 border border-slate-800"
                                  : isWin
                                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/15 text-rose-400 border border-rose-500/20"
                              }`}>
                                {res.outcome}
                              </span>
                            </td>

                            <td className="py-3 text-center">
                              <button
                                onClick={() => handleLoadOccurrence(res)}
                                className="px-2.5 py-1 text-[10px] font-bold rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-emerald-400 transition-colors border border-slate-700/60 cursor-pointer"
                                title="Load levels onto the visualization chart"
                              >
                                LOAD LEVELS
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </section>

    </div>
  );
}
