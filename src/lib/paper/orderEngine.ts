import { pool, query } from "../db";
import { validateBalance, createAccount } from "./margin";
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
  const accountRes = await query('SELECT * FROM "PaperAccount" WHERE "userId" = $1', [userId]);
  let account = accountRes.rows[0];
  if (!account) {
    account = await createAccount(userId);
  }

  // 2. Validate basic fields
  if (quantity <= 0) {
    return rejectOrder(userId, "Quantity must be greater than 0");
  }

  // 3. Create a PENDING order
  const orderId = require("crypto").randomUUID();
  const orderRes = await query(
    `INSERT INTO "PaperOrder" (id, "userId", symbol, exchange, instrument, side, "orderType", quantity, price, "triggerPrice", status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING') RETURNING *`,
    [orderId, userId, symbol, exchange, instrument, side, orderType, quantity, price, triggerPrice || null]
  );
  const order = orderRes.rows[0];

  // 4. For MARKET orders, get live price and execute immediately
  if (orderType === "MARKET") {
    return executeOrder(order.id);
  }

  // For LIMIT / SL / SL-M — mark as OPEN, will be matched by engine loop
  await query('UPDATE "PaperOrder" SET status = \'OPEN\' WHERE id = $1', [order.id]);

  return { success: true, orderId: order.id, status: "OPEN" };
}

export async function executeOrder(orderId: string, fillPrice?: number) {
  const orderRes = await query('SELECT * FROM "PaperOrder" WHERE id = $1', [orderId]);
  const order = orderRes.rows[0];
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
    const positionRes = await query(
      'SELECT * FROM "PaperPosition" WHERE "userId" = $1 AND symbol = $2 AND exchange = $3',
      [order.userId, order.symbol, order.exchange]
    );
    const position = positionRes.rows[0];
    const availableQty = position ? position.netQty : 0;
    if (availableQty < order.quantity) {
      return rejectOrder(orderId, `Insufficient position. Available: ${availableQty}, Required: ${order.quantity}`);
    }
  }

  // Calculate charges
  const tradeValue = order.quantity * executionPrice;
  const charges = calculateCharges(tradeValue);

  // Execute — create trade, update position, update balance
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Create trade record
    const tradeId = require("crypto").randomUUID();
    await client.query(
      'INSERT INTO "PaperTrade" (id, "orderId", "userId", symbol, side, price, qty) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [tradeId, order.id, order.userId, order.symbol, order.side, executionPrice, order.quantity]
    );

    // Update position
    await updatePosition(client, order.userId, order.symbol, order.exchange, order.side, order.quantity, executionPrice);

    // Update account balance
    const accountRes = await client.query('SELECT * FROM "PaperAccount" WHERE "userId" = $1', [order.userId]);
    const account = accountRes.rows[0];
    if (!account) throw new Error("Account not found");

    const transactionId = require("crypto").randomUUID();

    if (order.side === "BUY") {
      const totalCost = tradeValue + charges.total;
      await client.query(
        `UPDATE "PaperAccount"
         SET "usedMargin" = "usedMargin" + $1,
             "availableBalance" = "availableBalance" - $1,
             balance = balance - $1,
             "realizedPnl" = "realizedPnl" - $2,
             "totalPnl" = "totalPnl" - $2
         WHERE "userId" = $3`,
        [totalCost, charges.total, order.userId]
      );
      await client.query(
        `INSERT INTO "PaperTransaction" (id, "userId", type, amount, description, "balanceAfter")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [transactionId, order.userId, "ORDER_DEBIT", totalCost, `Buy ${order.quantity} ${order.symbol} @ ${executionPrice}`, account.balance - totalCost]
      );
    } else {
      const totalCredit = tradeValue - charges.total;
      await client.query(
        `UPDATE "PaperAccount"
         SET "usedMargin" = "usedMargin" - $1,
             "availableBalance" = "availableBalance" + $2,
             balance = balance + $2
         WHERE "userId" = $3`,
        [order.quantity * executionPrice, totalCredit, order.userId]
      );
      await client.query(
        `INSERT INTO "PaperTransaction" (id, "userId", type, amount, description, "balanceAfter")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [transactionId, order.userId, "ORDER_CREDIT", totalCredit, `Sell ${order.quantity} ${order.symbol} @ ${executionPrice}`, account.balance + totalCredit]
      );
    }

    await client.query("COMMIT");
  } catch (txErr) {
    await client.query("ROLLBACK");
    throw txErr;
  } finally {
    client.release();
  }

  // Mark order as FILLED (or EXECUTED for paper simulator)
  await query(
    'UPDATE "PaperOrder" SET status = \'FILLED\', "filledQty" = $1, "averagePrice" = $2 WHERE id = $3',
    [order.quantity, executionPrice, order.id]
  );

  return { success: true, orderId: order.id, status: "FILLED", price: executionPrice };
}

async function getLivePriceBySymbol(symbol: string): Promise<number> {
  const instRes = await query('SELECT token FROM "Instrument" WHERE symbol = $1 LIMIT 1', [symbol]);
  const inst = instRes.rows[0];
  if (inst) {
    const priceInfo = priceStore.getPrice(inst.token);
    return priceInfo ? priceInfo.ltp : 0;
  }
  return 0;
}

export async function rejectOrder(orderId: string, reason: string) {
  // If the ID is a user UUID (from placeOrder fallback), skip updating DB
  if (orderId.length > 36) {
    return { success: false, orderId, status: "REJECTED", reason };
  }
  try {
    await query(
      'UPDATE "PaperOrder" SET status = \'REJECTED\', "rejectReason" = $1 WHERE id = $2',
      [reason, orderId]
    );
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
  const existingRes = await tx.query(
    'SELECT * FROM "PaperPosition" WHERE "userId" = $1 AND symbol = $2 AND exchange = $3',
    [userId, symbol, exchange]
  );
  const existing = existingRes.rows[0];

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

    await tx.query(
      `UPDATE "PaperPosition"
       SET "buyQty" = $1, "sellQty" = $2, "netQty" = $3,
           "avgBuyPrice" = $4, "avgSellPrice" = $5,
           invested = $6, "realizedPnl" = $7
       WHERE id = $8`,
      [newBuyQty, newSellQty, newNetQty, newAvgBuy, newAvgSell, newInvested, newRealizedPnl, existing.id]
    );
  } else {
    const positionId = require("crypto").randomUUID();
    await tx.query(
      `INSERT INTO "PaperPosition" (id, "userId", symbol, exchange, "buyQty", "sellQty", "netQty", "avgBuyPrice", "avgSellPrice", invested, "marketValue")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        positionId, userId, symbol, exchange,
        side === "BUY" ? qty : 0,
        side === "SELL" ? qty : 0,
        side === "BUY" ? qty : -qty,
        side === "BUY" ? price : 0,
        side === "SELL" ? price : 0,
        side === "BUY" ? price * qty : 0,
        price * qty
      ]
    );
  }
}

export async function processPendingPaperOrders() {
  try {
    const openOrdersRes = await query('SELECT * FROM "PaperOrder" WHERE status = \'OPEN\'');
    const openOrders = openOrdersRes.rows;

    if (openOrders.length === 0) return;

    for (const order of openOrders) {
      const instRes = await query(
        'SELECT token FROM "Instrument" WHERE symbol = $1 LIMIT 1',
        [order.symbol]
      );
      const inst = instRes.rows[0];
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
