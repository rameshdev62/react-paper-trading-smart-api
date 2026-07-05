import { prisma } from "./db";
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

  return await prisma.$transaction(async (tx) => {
    // Get user to check balance
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    if (transactionType === "BUY") {
      const requiredMargin = quantity * price;
      if (user.balance < requiredMargin) {
        throw new Error(`Insufficient funds. Required: ₹${requiredMargin.toFixed(2)}, Available: ₹${user.balance.toFixed(2)}`);
      }

      // Create the order record
      const order = await tx.order.create({
        data: {
          userId,
          symbol,
          token,
          exchange,
          quantity,
          price,
          orderType,
          transactionType,
          productType,
          status: orderType === "MARKET" ? "COMPLETED" : "PENDING",
          completedAt: orderType === "MARKET" ? new Date() : null,
        },
      });

      // If market order, execute trade immediately (adjust balance and holdings)
      if (orderType === "MARKET") {
        // Deduct balance
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: requiredMargin } },
        });

        // Add/update holdings
        const existingHolding = await tx.holding.findUnique({
          where: { userId_token_exchange: { userId, token, exchange } },
        });

        if (existingHolding) {
          const newQty = existingHolding.quantity + quantity;
          const newAvgPrice = (existingHolding.averagePrice * existingHolding.quantity + price * quantity) / newQty;
          await tx.holding.update({
            where: { id: existingHolding.id },
            data: { quantity: newQty, averagePrice: parseFloat(newAvgPrice.toFixed(2)) },
          });
        } else {
          await tx.holding.create({
            data: { userId, symbol, token, exchange, quantity, averagePrice: price },
          });
        }

        // Log portfolio history
        const updatedUser = await tx.user.findUnique({ where: { id: userId } });
        const holdings = await tx.holding.findMany({ where: { userId } });
        let holdingsVal = 0;
        for (const h of holdings) {
          const hLtp = priceStore.getPrice(h.token).ltp;
          holdingsVal += h.quantity * hLtp;
        }
        await tx.portfolioHistory.create({
          data: {
            userId,
            cashBalance: updatedUser!.balance,
            totalValue: updatedUser!.balance + holdingsVal,
          },
        });
      }

      return order;
    } else {
      // transactionType === "SELL"
      // Verify holdings
      const holding = await tx.holding.findUnique({
        where: { userId_token_exchange: { userId, token, exchange } },
      });

      if (!holding || holding.quantity < quantity) {
        throw new Error(`Insufficient shares in holdings to sell. Have: ${holding ? holding.quantity : 0}, Selling: ${quantity}`);
      }

      // Create order record
      const order = await tx.order.create({
        data: {
          userId,
          symbol,
          token,
          exchange,
          quantity,
          price,
          orderType,
          transactionType,
          productType,
          status: orderType === "MARKET" ? "COMPLETED" : "PENDING",
          completedAt: orderType === "MARKET" ? new Date() : null,
        },
      });

      // If market order, execute trade immediately
      if (orderType === "MARKET") {
        const proceeds = quantity * price;

        // Add balance
        await tx.user.update({
          where: { id: userId },
          data: { balance: { increment: proceeds } },
        });

        // Decrement/delete holding
        if (holding.quantity === quantity) {
          await tx.holding.delete({ where: { id: holding.id } });
        } else {
          await tx.holding.update({
            where: { id: holding.id },
            data: { quantity: { decrement: quantity } },
          });
        }

        // Log portfolio history
        const updatedUser = await tx.user.findUnique({ where: { id: userId } });
        const holdings = await tx.holding.findMany({ where: { userId } });
        let holdingsVal = 0;
        for (const h of holdings) {
          const hLtp = priceStore.getPrice(h.token).ltp;
          holdingsVal += h.quantity * hLtp;
        }
        await tx.portfolioHistory.create({
          data: {
            userId,
            cashBalance: updatedUser!.balance,
            totalValue: updatedUser!.balance + holdingsVal,
          },
        });
      }

      return order;
    }
  });
}

export async function processPendingOrders() {
  try {
    const pendingOrders = await prisma.order.findMany({
      where: { status: "PENDING" },
    });

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
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || order.status !== "PENDING") return;

    const user = await tx.user.findUnique({ where: { id: order.userId } });
    if (!user) return;

    if (order.transactionType === "BUY") {
      const requiredMargin = order.quantity * fillPrice;
      if (user.balance < requiredMargin) {
        // Cancel / reject order due to insufficient margin on trigger
        await tx.order.update({
          where: { id: orderId },
          data: { status: "REJECTED", rejectReason: "Insufficient funds on order trigger" },
        });
        return;
      }

      // Update user balance
      await tx.user.update({
        where: { id: order.userId },
        data: { balance: { decrement: requiredMargin } },
      });

      // Update/Create holding
      const existingHolding = await tx.holding.findUnique({
        where: { userId_token_exchange: { userId: order.userId, token: order.token, exchange: order.exchange } },
      });

      if (existingHolding) {
        const newQty = existingHolding.quantity + order.quantity;
        const newAvgPrice = (existingHolding.averagePrice * existingHolding.quantity + fillPrice * order.quantity) / newQty;
        await tx.holding.update({
          where: { id: existingHolding.id },
          data: { quantity: newQty, averagePrice: parseFloat(newAvgPrice.toFixed(2)) },
        });
      } else {
        await tx.holding.create({
          data: {
            userId: order.userId,
            symbol: order.symbol,
            token: order.token,
            exchange: order.exchange,
            quantity: order.quantity,
            averagePrice: fillPrice,
          },
        });
      }

      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED", price: fillPrice, completedAt: new Date() },
      });
    } else {
      // transactionType === "SELL"
      const holding = await tx.holding.findUnique({
        where: { userId_token_exchange: { userId: order.userId, token: order.token, exchange: order.exchange } },
      });

      if (!holding || holding.quantity < order.quantity) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: "REJECTED", rejectReason: "Insufficient shares held on order trigger" },
        });
        return;
      }

      const proceeds = order.quantity * fillPrice;

      // Update user balance
      await tx.user.update({
        where: { id: order.userId },
        data: { balance: { increment: proceeds } },
      });

      // Decrement or delete holding
      if (holding.quantity === order.quantity) {
        await tx.holding.delete({ where: { id: holding.id } });
      } else {
        await tx.holding.update({
          where: { id: holding.id },
          data: { quantity: { decrement: order.quantity } },
        });
      }

      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: "COMPLETED", price: fillPrice, completedAt: new Date() },
      });
    }

    // Update portfolio value log
    const updatedUser = await tx.user.findUnique({ where: { id: order.userId } });
    const holdings = await tx.holding.findMany({ where: { userId: order.userId } });
    let holdingsVal = 0;
    for (const h of holdings) {
      const hLtp = priceStore.getPrice(h.token).ltp;
      holdingsVal += h.quantity * hLtp;
    }
    await tx.portfolioHistory.create({
      data: {
        userId: order.userId,
        cashBalance: updatedUser!.balance,
        totalValue: updatedUser!.balance + holdingsVal,
      },
    });
  });
}

// Subscribe to price store to run order matching on every price tick
if (typeof window === "undefined") {
  priceStore.subscribe(() => {
    processPendingOrders();
  });
}

