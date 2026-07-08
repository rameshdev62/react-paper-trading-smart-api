import { pool, query } from "./db";
import { priceStore } from "./priceStore";

export async function placeOrder(params: {
  userId: string;
  symbol: string;
  token: string;
  exchange: string;
  quantity: number;
  price: number; // 0 for MARKET, positive for LIMIT/SL
  orderType: "MARKET" | "LIMIT" | "SL";
  transactionType: "BUY" | "SELL";
  productType: "INTRADAY" | "DELIVERY";
}) {
  const { userId, symbol, token, exchange, quantity, orderType, transactionType, productType } = params;
  let price = params.price;

  // Get current LTP
  const currentPrice = priceStore.getPrice(token);
  const ltp = currentPrice ? currentPrice.ltp : 100.0;

  if (orderType === "MARKET") {
    price = ltp;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get user to check balance
    const userRes = await client.query('SELECT balance FROM "User" WHERE id = $1', [userId]);
    const user = userRes.rows[0];
    if (!user) throw new Error("User not found");

    const orderId = require("crypto").randomUUID();

    if (transactionType === "BUY") {
      const requiredMargin = quantity * price;
      if (user.balance < requiredMargin) {
        throw new Error(`Insufficient funds. Required: ₹${requiredMargin.toFixed(2)}, Available: ₹${user.balance.toFixed(2)}`);
      }

      // Create the order record
      const isMarket = orderType === "MARKET";
      const status = isMarket ? "COMPLETED" : "PENDING";
      const completedAt = isMarket ? new Date() : null;

      const orderInsertRes = await client.query(
        `INSERT INTO "Order" (id, "userId", symbol, token, exchange, quantity, price, "orderType", "transactionType", "productType", status, "completedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [orderId, userId, symbol, token, exchange, quantity, price, orderType, transactionType, productType, status, completedAt]
      );
      const order = orderInsertRes.rows[0];

      // If market order, execute trade immediately (adjust balance and holdings)
      if (isMarket) {
        // Deduct balance
        await client.query('UPDATE "User" SET balance = balance - $1 WHERE id = $2', [requiredMargin, userId]);

        // Add/update holdings
        const existingHoldingRes = await client.query(
          'SELECT * FROM "Holding" WHERE "userId" = $1 AND token = $2 AND exchange = $3',
          [userId, token, exchange]
        );
        const existingHolding = existingHoldingRes.rows[0];

        if (existingHolding) {
          const newQty = existingHolding.quantity + quantity;
          const newAvgPrice = (existingHolding.averagePrice * existingHolding.quantity + price * quantity) / newQty;
          await client.query(
            'UPDATE "Holding" SET quantity = $1, "averagePrice" = $2 WHERE id = $3',
            [newQty, parseFloat(newAvgPrice.toFixed(2)), existingHolding.id]
          );
        } else {
          const holdingId = require("crypto").randomUUID();
          await client.query(
            'INSERT INTO "Holding" (id, "userId", symbol, token, exchange, quantity, "averagePrice") VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [holdingId, userId, symbol, token, exchange, quantity, price]
          );
        }

        // Log portfolio history
        const updatedUserRes = await client.query('SELECT balance FROM "User" WHERE id = $1', [userId]);
        const updatedUser = updatedUserRes.rows[0];

        const holdingsRes = await client.query('SELECT * FROM "Holding" WHERE "userId" = $1', [userId]);
        const holdings = holdingsRes.rows;

        let holdingsVal = 0;
        for (const h of holdings) {
          const hLtp = priceStore.getPrice(h.token).ltp;
          holdingsVal += h.quantity * hLtp;
        }

        const historyId = require("crypto").randomUUID();
        await client.query(
          'INSERT INTO "PortfolioHistory" (id, "userId", "cashBalance", "totalValue") VALUES ($1, $2, $3, $4)',
          [historyId, userId, updatedUser.balance, updatedUser.balance + holdingsVal]
        );
      }

      await client.query("COMMIT");
      return order;
    } else {
      // transactionType === "SELL"
      // Verify holdings
      const holdingRes = await client.query(
        'SELECT * FROM "Holding" WHERE "userId" = $1 AND token = $2 AND exchange = $3',
        [userId, token, exchange]
      );
      const holding = holdingRes.rows[0];

      if (!holding || holding.quantity < quantity) {
        throw new Error(`Insufficient shares in holdings to sell. Have: ${holding ? holding.quantity : 0}, Selling: ${quantity}`);
      }

      // Create order record
      const isMarket = orderType === "MARKET";
      const status = isMarket ? "COMPLETED" : "PENDING";
      const completedAt = isMarket ? new Date() : null;

      const orderInsertRes = await client.query(
        `INSERT INTO "Order" (id, "userId", symbol, token, exchange, quantity, price, "orderType", "transactionType", "productType", status, "completedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [orderId, userId, symbol, token, exchange, quantity, price, orderType, transactionType, productType, status, completedAt]
      );
      const order = orderInsertRes.rows[0];

      // If market order, execute trade immediately
      if (isMarket) {
        const proceeds = quantity * price;

        // Add balance
        await client.query('UPDATE "User" SET balance = balance + $1 WHERE id = $2', [proceeds, userId]);

        // Decrement/delete holding
        if (holding.quantity === quantity) {
          await client.query('DELETE FROM "Holding" WHERE id = $1', [holding.id]);
        } else {
          await client.query('UPDATE "Holding" SET quantity = quantity - $1 WHERE id = $2', [quantity, holding.id]);
        }

        // Log portfolio history
        const updatedUserRes = await client.query('SELECT balance FROM "User" WHERE id = $1', [userId]);
        const updatedUser = updatedUserRes.rows[0];

        const holdingsRes = await client.query('SELECT * FROM "Holding" WHERE "userId" = $1', [userId]);
        const holdings = holdingsRes.rows;

        let holdingsVal = 0;
        for (const h of holdings) {
          const hLtp = priceStore.getPrice(h.token).ltp;
          holdingsVal += h.quantity * hLtp;
        }

        const historyId = require("crypto").randomUUID();
        await client.query(
          'INSERT INTO "PortfolioHistory" (id, "userId", "cashBalance", "totalValue") VALUES ($1, $2, $3, $4)',
          [historyId, userId, updatedUser.balance, updatedUser.balance + holdingsVal]
        );
      }

      await client.query("COMMIT");
      return order;
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function processPendingOrders() {
  try {
    const pendingOrdersRes = await query('SELECT * FROM "Order" WHERE status = \'PENDING\'');
    const pendingOrders = pendingOrdersRes.rows;

    if (pendingOrders.length === 0) return;

    for (const order of pendingOrders) {
      const currentPrice = priceStore.getPrice(order.token);
      if (!currentPrice) continue;

      const ltp = currentPrice.ltp;
      let shouldTrigger = false;

      // Evaluate order type and criteria
      if (order.orderType === "LIMIT") {
        if (order.transactionType === "BUY" && ltp <= order.price) {
          shouldTrigger = true;
        } else if (order.transactionType === "SELL" && ltp >= order.price) {
          shouldTrigger = true;
        }
      } else if (order.orderType === "SL") {
        // Stop Loss: BUY triggers when price rises above threshold, SELL triggers when price drops below threshold
        if (order.transactionType === "BUY" && ltp >= order.price) {
          shouldTrigger = true;
        } else if (order.transactionType === "SELL" && ltp <= order.price) {
          shouldTrigger = true;
        }
      }

      if (shouldTrigger) {
        console.log(`[OrderEngine] Triggering pending order ${order.id} for ${order.symbol} at current price ${ltp}`);
        await executePendingOrder(order.id, ltp);
      }
    }
  } catch (err) {
    console.error("[OrderEngine] Error processing pending orders:", err);
  }
}

async function executePendingOrder(orderId: string, fillPrice: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query('SELECT * FROM "Order" WHERE id = $1', [orderId]);
    const order = orderRes.rows[0];
    if (!order || order.status !== "PENDING") {
      await client.query("ROLLBACK");
      return;
    }

    const userRes = await client.query('SELECT balance FROM "User" WHERE id = $1', [order.userId]);
    const user = userRes.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      return;
    }

    if (order.transactionType === "BUY") {
      const requiredMargin = order.quantity * fillPrice;
      if (user.balance < requiredMargin) {
        // Cancel / reject order due to insufficient margin on trigger
        await client.query(
          'UPDATE "Order" SET status = \'REJECTED\', "rejectReason" = $1 WHERE id = $2',
          ["Insufficient funds on order trigger", orderId]
        );
        await client.query("COMMIT");
        return;
      }

      // Update user balance
      await client.query('UPDATE "User" SET balance = balance - $1 WHERE id = $2', [requiredMargin, order.userId]);

      // Update/Create holding
      const existingHoldingRes = await client.query(
        'SELECT * FROM "Holding" WHERE "userId" = $1 AND token = $2 AND exchange = $3',
        [order.userId, order.token, order.exchange]
      );
      const existingHolding = existingHoldingRes.rows[0];

      if (existingHolding) {
        const newQty = existingHolding.quantity + order.quantity;
        const newAvgPrice = (existingHolding.averagePrice * existingHolding.quantity + fillPrice * order.quantity) / newQty;
        await client.query(
          'UPDATE "Holding" SET quantity = $1, "averagePrice" = $2 WHERE id = $3',
          [newQty, parseFloat(newAvgPrice.toFixed(2)), existingHolding.id]
        );
      } else {
        const holdingId = require("crypto").randomUUID();
        await client.query(
          'INSERT INTO "Holding" (id, "userId", symbol, token, exchange, quantity, "averagePrice") VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [holdingId, order.userId, order.symbol, order.token, order.exchange, order.quantity, fillPrice]
        );
      }

      // Update order status
      await client.query(
        'UPDATE "Order" SET status = \'COMPLETED\', price = $1, "completedAt" = $2 WHERE id = $3',
        [fillPrice, new Date(), orderId]
      );
    } else {
      // transactionType === "SELL"
      const holdingRes = await client.query(
        'SELECT * FROM "Holding" WHERE "userId" = $1 AND token = $2 AND exchange = $3',
        [order.userId, order.token, order.exchange]
      );
      const holding = holdingRes.rows[0];

      if (!holding || holding.quantity < order.quantity) {
        await client.query(
          'UPDATE "Order" SET status = \'REJECTED\', "rejectReason" = $1 WHERE id = $2',
          ["Insufficient shares held on order trigger", orderId]
        );
        await client.query("COMMIT");
        return;
      }

      const proceeds = order.quantity * fillPrice;

      // Update user balance
      await client.query('UPDATE "User" SET balance = balance + $1 WHERE id = $2', [proceeds, order.userId]);

      // Decrement or delete holding
      if (holding.quantity === order.quantity) {
        await client.query('DELETE FROM "Holding" WHERE id = $1', [holding.id]);
      } else {
        await client.query('UPDATE "Holding" SET quantity = quantity - $1 WHERE id = $2', [order.quantity, holding.id]);
      }

      // Update order status
      await client.query(
        'UPDATE "Order" SET status = \'COMPLETED\', price = $1, "completedAt" = $2 WHERE id = $3',
        [fillPrice, new Date(), orderId]
      );
    }

    // Update portfolio value log
    const updatedUserRes = await client.query('SELECT balance FROM "User" WHERE id = $1', [order.userId]);
    const updatedUser = updatedUserRes.rows[0];

    const holdingsRes = await client.query('SELECT * FROM "Holding" WHERE "userId" = $1', [order.userId]);
    const holdings = holdingsRes.rows;

    let holdingsVal = 0;
    for (const h of holdings) {
      const hLtp = priceStore.getPrice(h.token).ltp;
      holdingsVal += h.quantity * hLtp;
    }

    const historyId = require("crypto").randomUUID();
    await client.query(
      'INSERT INTO "PortfolioHistory" (id, "userId", "cashBalance", "totalValue") VALUES ($1, $2, $3, $4)',
      [historyId, order.userId, updatedUser.balance, updatedUser.balance + holdingsVal]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[OrderEngine] Error executing pending order transaction:", err);
  } finally {
    client.release();
  }
}

// Subscribe to price store to run order matching on every price tick
if (typeof window === "undefined") {
  priceStore.subscribe(() => {
    processPendingOrders();
  });
}

