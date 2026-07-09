import { getServiceClient } from "../db";
import { validateBalance, createAccount } from "./margin";
import { calculateCharges } from "./brokerage";
import { priceStore } from "../priceStore";

const supabase = getServiceClient();

interface PlaceOrderInput {
  userId: string;
  symbol: string;
  exchange: string;
  instrument: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity: number;
  price: number;
  triggerPrice?: number;
}

export async function placeOrder(input: PlaceOrderInput) {
  const {
    userId, symbol, exchange, instrument, side,
    orderType, quantity, price, triggerPrice,
  } = input;

  // 1. Ensure account exists
  const { data: accounts, error: accountError } = await supabase
    .from("PaperAccount")
    .select("*")
    .eq("userId", userId)
    .limit(1);
  if (accountError) throw accountError;
  let account = accounts?.[0];
  if (!account) {
    account = await createAccount(userId);
  }

  // 2. Validate basic fields
  if (quantity <= 0) {
    return rejectOrder(userId, "Quantity must be greater than 0");
  }

  // 3. Create a PENDING order
  const orderId = require("crypto").randomUUID();
  const { data: orders, error: orderError } = await supabase
    .from("PaperOrder")
    .insert({
      id: orderId,
      userId,
      symbol,
      exchange,
      instrument,
      side,
      orderType,
      quantity,
      price,
      triggerPrice: triggerPrice || null,
      status: "PENDING",
    })
    .select();
  if (orderError) throw orderError;
  const order = orders?.[0];

  // 4. For MARKET orders, get live price and execute immediately
  if (orderType === "MARKET") {
    return executeOrder(order.id);
  }

  // For LIMIT / SL / SL-M — mark as OPEN, will be matched by engine loop
  const { error: updateOpenError } = await supabase
    .from("PaperOrder")
    .update({ status: "OPEN" })
    .eq("id", order.id);
  if (updateOpenError) throw updateOpenError;

  return { success: true, orderId: order.id, status: "OPEN" };
}

export async function executeOrder(orderId: string, fillPrice?: number) {
  const { data: orders, error: orderError } = await supabase
    .from("PaperOrder")
    .select("*")
    .eq("id", orderId)
    .limit(1);
  if (orderError) throw orderError;
  const order = orders?.[0];
  if (!order) throw new Error("Order not found");

  const livePrice = fillPrice || await getLivePriceBySymbol(order.symbol);
  const executionPrice = livePrice || order.price || 0;

  if (executionPrice <= 0) {
    return rejectOrder(orderId, "Could not fetch live price");
  }

  // Validate balance for BUY orders
  if (order.side === "BUY") {
    const required = order.quantity * executionPrice;
    const validation = await validateBalance(order.userId, required);
    if (!validation.valid) {
      return rejectOrder(orderId, validation.message || "Insufficient funds");
    }
  }

  // For SELL orders, validate position exists
  if (order.side === "SELL") {
    const { data: positions, error: posError } = await supabase
      .from("PaperPosition")
      .select("*")
      .eq("userId", order.userId)
      .eq("symbol", order.symbol)
      .eq("exchange", order.exchange)
      .limit(1);
    if (posError) throw posError;
    const position = positions?.[0];
    const availableQty = position ? position.netQty : 0;
    if (availableQty < order.quantity) {
      return rejectOrder(orderId, `Insufficient position. Available: ${availableQty}, Required: ${order.quantity}`);
    }
  }

  // Calculate charges
  const tradeValue = order.quantity * executionPrice;
  const charges = calculateCharges(tradeValue);

  // Execute — create trade, update position, update balance
  try {
    // Create trade record
    const tradeId = require("crypto").randomUUID();
    const { error: insertTradeError } = await supabase
      .from("PaperTrade")
      .insert({
        id: tradeId,
        orderId: order.id,
        userId: order.userId,
        symbol: order.symbol,
        side: order.side,
        price: executionPrice,
        qty: order.quantity,
      });
    if (insertTradeError) throw insertTradeError;

    // Update position
    await updatePosition(order.userId, order.symbol, order.exchange, order.side, order.quantity, executionPrice);

    // Update account balance
    const { data: accounts, error: getAccountError } = await supabase
      .from("PaperAccount")
      .select("*")
      .eq("userId", order.userId)
      .limit(1);
    if (getAccountError) throw getAccountError;
    const account = accounts?.[0];
    if (!account) throw new Error("Account not found");

    const transactionId = require("crypto").randomUUID();

    if (order.side === "BUY") {
      const totalCost = tradeValue + charges.total;
      const { error: updateAccountError } = await supabase
        .from("PaperAccount")
        .update({
          usedMargin: account.usedMargin + totalCost,
          availableBalance: account.availableBalance - totalCost,
          balance: account.balance - totalCost,
          realizedPnl: account.realizedPnl - charges.total,
          totalPnl: account.totalPnl - charges.total,
        })
        .eq("userId", order.userId);
      if (updateAccountError) throw updateAccountError;

      const { error: insertTxError } = await supabase
        .from("PaperTransaction")
        .insert({
          id: transactionId,
          userId: order.userId,
          type: "ORDER_DEBIT",
          amount: totalCost,
          description: `Buy ${order.quantity} ${order.symbol} @ ${executionPrice}`,
          balanceAfter: account.balance - totalCost,
        });
      if (insertTxError) throw insertTxError;
    } else {
      const totalCredit = tradeValue - charges.total;
      const { error: updateAccountError } = await supabase
        .from("PaperAccount")
        .update({
          usedMargin: account.usedMargin - (order.quantity * executionPrice),
          availableBalance: account.availableBalance + totalCredit,
          balance: account.balance + totalCredit,
        })
        .eq("userId", order.userId);
      if (updateAccountError) throw updateAccountError;

      const { error: insertTxError } = await supabase
        .from("PaperTransaction")
        .insert({
          id: transactionId,
          userId: order.userId,
          type: "ORDER_CREDIT",
          amount: totalCredit,
          description: `Sell ${order.quantity} ${order.symbol} @ ${executionPrice}`,
          balanceAfter: account.balance + totalCredit,
        });
      if (insertTxError) throw insertTxError;
    }
  } catch (txErr) {
    throw txErr;
  }

  // Mark order as FILLED
  const { error: updateOrderError } = await supabase
    .from("PaperOrder")
    .update({
      status: "FILLED",
      filledQty: order.quantity,
      averagePrice: executionPrice,
    })
    .eq("id", order.id);
  if (updateOrderError) throw updateOrderError;

  return { success: true, orderId: order.id, status: "FILLED", price: executionPrice };
}

async function getLivePriceBySymbol(symbol: string): Promise<number> {
  const { data: instruments, error } = await supabase
    .from("Instrument")
    .select("token")
    .eq("symbol", symbol)
    .limit(1);
  if (error) return 0;
  const inst = instruments?.[0];
  if (inst) {
    const priceInfo = priceStore.getPrice(inst.token);
    return priceInfo ? priceInfo.ltp : 0;
  }
  return 0;
}

export async function rejectOrder(orderId: string, reason: string) {
  if (orderId.length > 36) {
    return { success: false, orderId, status: "REJECTED", reason };
  }
  try {
    await supabase
      .from("PaperOrder")
      .update({ status: "REJECTED", rejectReason: reason })
      .eq("id", orderId);
  } catch {
    // Ignore db write failure if order record doesn't exist
  }
  return { success: false, orderId, status: "REJECTED", reason };
}

async function updatePosition(
  userId: string,
  symbol: string,
  exchange: string,
  side: string,
  qty: number,
  price: number,
) {
  const { data: positions, error: posError } = await supabase
    .from("PaperPosition")
    .select("*")
    .eq("userId", userId)
    .eq("symbol", symbol)
    .eq("exchange", exchange)
    .limit(1);

  if (posError) throw posError;
  const existing = positions?.[0];

  if (existing) {
    const newBuyQty = existing.buyQty + (side === "BUY" ? qty : 0);
    const newSellQty = existing.sellQty + (side === "SELL" ? qty : 0);
    const newNetQty = newBuyQty - newSellQty;

    let newAvgBuy = existing.avgBuyPrice;
    let newAvgSell = existing.avgSellPrice;
    let newInvested = existing.invested;
    let newRealizedPnl = existing.realizedPnl;

    if (side === "BUY") {
      newAvgBuy = ((existing.avgBuyPrice * existing.buyQty) + (price * qty)) / newBuyQty;
      newInvested += price * qty;
    } else {
      newAvgSell = ((existing.avgSellPrice * existing.sellQty) + (price * qty)) / newSellQty;
      newInvested -= price * qty;
      const sellPnl = (price - existing.avgBuyPrice) * qty;
      newRealizedPnl += sellPnl;
    }

    const { error: updateError } = await supabase
      .from("PaperPosition")
      .update({
        buyQty: newBuyQty,
        sellQty: newSellQty,
        netQty: newNetQty,
        avgBuyPrice: newAvgBuy,
        avgSellPrice: newAvgSell,
        invested: newInvested,
        realizedPnl: newRealizedPnl,
      })
      .eq("id", existing.id);
    if (updateError) throw updateError;
  } else {
    const positionId = require("crypto").randomUUID();
    const { error: insertError } = await supabase
      .from("PaperPosition")
      .insert({
        id: positionId,
        userId,
        symbol,
        exchange,
        buyQty: side === "BUY" ? qty : 0,
        sellQty: side === "SELL" ? qty : 0,
        netQty: side === "BUY" ? qty : -qty,
        avgBuyPrice: side === "BUY" ? price : 0,
        avgSellPrice: side === "SELL" ? price : 0,
        invested: side === "BUY" ? price * qty : 0,
        marketValue: price * qty,
      });
    if (insertError) throw insertError;
  }
}

export async function processPendingPaperOrders() {
  try {
    const { data: openOrders, error } = await supabase
      .from("PaperOrder")
      .select("*")
      .eq("status", "OPEN");
    if (error) throw error;

    if (!openOrders || openOrders.length === 0) return;

    for (const order of openOrders) {
      const { data: instruments, error: instError } = await supabase
        .from("Instrument")
        .select("token")
        .eq("symbol", order.symbol)
        .limit(1);
      if (instError) continue;
      const inst = instruments?.[0];
      if (!inst) continue;

      const currentPrice = priceStore.getPrice(inst.token);
      if (!currentPrice) continue;

      const ltp = currentPrice.ltp;
      let shouldTrigger = false;

      // Evaluate order type and criteria
      if (order.orderType === "LIMIT") {
        if (order.side === "BUY" && ltp <= order.price) {
          shouldTrigger = true;
        } else if (order.side === "SELL" && ltp >= order.price) {
          shouldTrigger = true;
        }
      } else if (order.orderType === "SL" || order.orderType === "SL-M") {
        const trigger = order.triggerPrice || order.price;
        if (order.side === "BUY" && ltp >= trigger) {
          shouldTrigger = true;
        } else if (order.side === "SELL" && ltp <= trigger) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        console.log(`[PaperOrderEngine] Triggering open order ${order.id} for ${order.symbol} at current price ${ltp}`);
        await executeOrder(order.id, ltp);
      }
    }
  } catch (err) {
    console.error("[PaperOrderEngine] Error processing pending orders:", err);
  }
}

// Subscribe to price store to run order matching on every price tick
if (typeof window === "undefined") {
  priceStore.subscribe(() => {
    processPendingPaperOrders().catch((err) => {
      console.error("[PaperOrderEngine] Matcher tick error:", err);
    });
  });
}
