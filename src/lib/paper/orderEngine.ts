import { prisma } from "../db";
import { validateBalance } from "./margin";
import { calculateCharges } from "./brokerage";
import { priceStore } from "../priceStore";

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
  let account = await prisma.paperAccount.findUnique({ where: { userId } });
  if (!account) {
    account = await prisma.paperAccount.create({
      data: { userId, balance: 1000000.0, availableBalance: 1000000.0 },
    });
  }

  // 2. Validate basic fields
  if (quantity <= 0) {
    return rejectOrder(userId, "Quantity must be greater than 0");
  }

  // 3. Create a PENDING order
  const order = await prisma.paperOrder.create({
    data: {
      userId,
      symbol,
      exchange,
      instrument,
      side,
      orderType,
      quantity,
      price,
      triggerPrice,
      status: "PENDING",
    },
  });

  // 4. For MARKET orders, get live price and execute immediately
  if (orderType === "MARKET") {
    return executeOrder(order.id);
  }

  // For LIMIT / SL / SL-M — mark as OPEN, will be matched by engine loop
  await prisma.paperOrder.update({
    where: { id: order.id },
    data: { status: "OPEN" },
  });

  return { success: true, orderId: order.id, status: "OPEN" };
}

export async function executeOrder(orderId: string, fillPrice?: number) {
  const order = await prisma.paperOrder.findUnique({ where: { id: orderId } });
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
    const position = await prisma.paperPosition.findUnique({
      where: {
        userId_symbol_exchange: {
          userId: order.userId,
          symbol: order.symbol,
          exchange: order.exchange,
        },
      },
    });
    const availableQty = position ? position.netQty : 0;
    if (availableQty < order.quantity) {
      return rejectOrder(orderId, `Insufficient position. Available: ${availableQty}, Required: ${order.quantity}`);
    }
  }

  // Calculate charges
  const tradeValue = order.quantity * executionPrice;
  const charges = calculateCharges(tradeValue);

  // Execute — create trade, update position, update balance
  await prisma.$transaction(async (tx) => {
    // Create trade record
    await tx.paperTrade.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        symbol: order.symbol,
        side: order.side,
        price: executionPrice,
        qty: order.quantity,
      },
    });

    // Update position
    await updatePosition(tx, order.userId, order.symbol, order.exchange, order.side, order.quantity, executionPrice);

    // Update account balance
    const account = await tx.paperAccount.findUnique({ where: { userId: order.userId } });
    if (!account) throw new Error("Account not found");

    if (order.side === "BUY") {
      const totalCost = tradeValue + charges.total;
      await tx.paperAccount.update({
        where: { userId: order.userId },
        data: {
          usedMargin: { increment: totalCost },
          availableBalance: { decrement: totalCost },
          balance: { decrement: totalCost },
          realizedPnl: { decrement: charges.total },
          totalPnl: { decrement: charges.total },
        },
      });
      await tx.paperTransaction.create({
        data: {
          userId: order.userId,
          type: "ORDER_DEBIT",
          amount: totalCost,
          description: `Buy ${order.quantity} ${order.symbol} @ ${executionPrice}`,
          balanceAfter: account.balance - totalCost,
        },
      });
    } else {
      const totalCredit = tradeValue - charges.total;
      await tx.paperAccount.update({
        where: { userId: order.userId },
        data: {
          usedMargin: { decrement: order.quantity * executionPrice },
          availableBalance: { increment: totalCredit },
          balance: { increment: totalCredit },
        },
      });
      await tx.paperTransaction.create({
        data: {
          userId: order.userId,
          type: "ORDER_CREDIT",
          amount: totalCredit,
          description: `Sell ${order.quantity} ${order.symbol} @ ${executionPrice}`,
          balanceAfter: account.balance + totalCredit,
        },
      });
    }
  });

  // Mark order as FILLED (or EXECUTED for paper simulator)
  await prisma.paperOrder.update({
    where: { id: order.id },
    data: {
      status: "FILLED",
      filledQty: order.quantity,
      averagePrice: executionPrice,
    },
  });

  return { success: true, orderId: order.id, status: "FILLED", price: executionPrice };
}

async function getLivePriceBySymbol(symbol: string): Promise<number> {
  const inst = await prisma.instrument.findFirst({
    where: { symbol },
    select: { token: true },
  });
  if (inst) {
    const priceInfo = priceStore.getPrice(inst.token);
    return priceInfo ? priceInfo.ltp : 0;
  }
  return 0;
}

async function rejectOrder(orderId: string, reason: string) {
  // If the ID is a user UUID (from placeOrder fallback), skip updating DB
  if (orderId.length > 36) {
    return { success: false, orderId, status: "REJECTED", reason };
  }
  try {
    await prisma.paperOrder.update({
      where: { id: orderId },
      data: { status: "REJECTED", rejectReason: reason },
    });
  } catch {
    // Ignore db write failure if order record doesn't exist
  }
  return { success: false, orderId, status: "REJECTED", reason };
}

async function updatePosition(
  tx: any,
  userId: string,
  symbol: string,
  exchange: string,
  side: string,
  qty: number,
  price: number,
) {
  const existing = await tx.paperPosition.findUnique({
    where: { userId_symbol_exchange: { userId, symbol, exchange } },
  });

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

    await tx.paperPosition.update({
      where: { id: existing.id },
      data: {
        buyQty: newBuyQty,
        sellQty: newSellQty,
        netQty: newNetQty,
        avgBuyPrice: newAvgBuy,
        avgSellPrice: newAvgSell,
        invested: newInvested,
        realizedPnl: newRealizedPnl,
      },
    });
  } else {
    await tx.paperPosition.create({
      data: {
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
      },
    });
  }
}

export async function processPendingPaperOrders() {
  try {
    const openOrders = await prisma.paperOrder.findMany({
      where: { status: "OPEN" },
    });

    if (openOrders.length === 0) return;

    for (const order of openOrders) {
      const inst = await prisma.instrument.findFirst({
        where: { symbol: order.symbol },
        select: { token: true },
      });
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
