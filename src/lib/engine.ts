import { getServiceClient } from "./db";
import { priceStore } from "./priceStore";

const supabase = getServiceClient();

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

  // Get user to check balance
  const { data: userData, error: userError } = await supabase
    .from("User")
    .select("balance")
    .eq("id", userId)
    .limit(1);
  if (userError) throw userError;
  const user = userData?.[0];
  if (!user) throw new Error("User not found");

  const orderId = require("crypto").randomUUID();

  if (transactionType === "BUY") {
    const requiredMargin = quantity * price;
    if (user.balance < requiredMargin) {
      throw new Error(`Insufficient funds. Required: ₹${requiredMargin.toFixed(2)}, Available: ₹${user.balance.toFixed(2)}`);
    }

    const isMarket = orderType === "MARKET";
    const status = isMarket ? "COMPLETED" : "PENDING";
    const completedAt = isMarket ? new Date().toISOString() : null;

    const { data: orderData, error: orderError } = await supabase
      .from("Order")
      .insert({
        id: orderId,
        userId,
        symbol,
        token,
        exchange,
        quantity,
        price,
        orderType,
        transactionType,
        productType,
        status,
        completedAt,
      })
      .select();
    if (orderError) throw orderError;
    const order = orderData?.[0];

    // If market order, execute trade immediately (adjust balance and holdings)
    if (isMarket) {
      // Deduct balance
      const { error: updateBalError } = await supabase
        .from("User")
        .update({ balance: user.balance - requiredMargin })
        .eq("id", userId);
      if (updateBalError) throw updateBalError;

      // Add/update holdings
      const { data: existingHoldings, error: getHoldingError } = await supabase
        .from("Holding")
        .select("*")
        .eq("userId", userId)
        .eq("token", token)
        .eq("exchange", exchange)
        .limit(1);
      if (getHoldingError) throw getHoldingError;
      const existingHolding = existingHoldings?.[0];

      if (existingHolding) {
        const newQty = existingHolding.quantity + quantity;
        const newAvgPrice = (existingHolding.averagePrice * existingHolding.quantity + price * quantity) / newQty;
        const { error: updateHoldingError } = await supabase
          .from("Holding")
          .update({
            quantity: newQty,
            averagePrice: parseFloat(newAvgPrice.toFixed(2)),
          })
          .eq("id", existingHolding.id);
        if (updateHoldingError) throw updateHoldingError;
      } else {
        const holdingId = require("crypto").randomUUID();
        const { error: insertHoldingError } = await supabase
          .from("Holding")
          .insert({
            id: holdingId,
            userId,
            symbol,
            token,
            exchange,
            quantity,
            averagePrice: price,
          });
        if (insertHoldingError) throw insertHoldingError;
      }

      // Log portfolio history
      const { data: updatedUsers, error: getUpdatedUserError } = await supabase
        .from("User")
        .select("balance")
        .eq("id", userId)
        .limit(1);
      if (getUpdatedUserError) throw getUpdatedUserError;
      const updatedUser = updatedUsers?.[0];

      const { data: holdings, error: getHoldingsError } = await supabase
        .from("Holding")
        .select("*")
        .eq("userId", userId);
      if (getHoldingsError) throw getHoldingsError;

      let holdingsVal = 0;
      for (const h of holdings || []) {
        const hLtp = priceStore.getPrice(h.token).ltp;
        holdingsVal += h.quantity * hLtp;
      }

      const historyId = require("crypto").randomUUID();
      const { error: insertHistoryError } = await supabase
        .from("PortfolioHistory")
        .insert({
          id: historyId,
          userId,
          cashBalance: updatedUser.balance,
          totalValue: updatedUser.balance + holdingsVal,
        });
      if (insertHistoryError) throw insertHistoryError;
    }

    return order;
  } else {
    // transactionType === "SELL"
    // Verify holdings
    const { data: existingHoldings, error: getHoldingError } = await supabase
      .from("Holding")
      .select("*")
      .eq("userId", userId)
      .eq("token", token)
      .eq("exchange", exchange)
      .limit(1);
    if (getHoldingError) throw getHoldingError;
    const holding = existingHoldings?.[0];

    if (!holding || holding.quantity < quantity) {
      throw new Error(`Insufficient shares in holdings to sell. Have: ${holding ? holding.quantity : 0}, Selling: ${quantity}`);
    }

    const isMarket = orderType === "MARKET";
    const status = isMarket ? "COMPLETED" : "PENDING";
    const completedAt = isMarket ? new Date().toISOString() : null;

    const { data: orderData, error: orderError } = await supabase
      .from("Order")
      .insert({
        id: orderId,
        userId,
        symbol,
        token,
        exchange,
        quantity,
        price,
        orderType,
        transactionType,
        productType,
        status,
        completedAt,
      })
      .select();
    if (orderError) throw orderError;
    const order = orderData?.[0];

    // If market order, execute trade immediately
    if (isMarket) {
      const proceeds = quantity * price;

      // Add balance
      const { error: updateBalError } = await supabase
        .from("User")
        .update({ balance: user.balance + proceeds })
        .eq("id", userId);
      if (updateBalError) throw updateBalError;

      // Decrement/delete holding
      if (holding.quantity === quantity) {
        const { error: deleteHoldingError } = await supabase
          .from("Holding")
          .delete()
          .eq("id", holding.id);
        if (deleteHoldingError) throw deleteHoldingError;
      } else {
        const { error: updateHoldingError } = await supabase
          .from("Holding")
          .update({ quantity: holding.quantity - quantity })
          .eq("id", holding.id);
        if (updateHoldingError) throw updateHoldingError;
      }

      // Log portfolio history
      const { data: updatedUsers, error: getUpdatedUserError } = await supabase
        .from("User")
        .select("balance")
        .eq("id", userId)
        .limit(1);
      if (getUpdatedUserError) throw getUpdatedUserError;
      const updatedUser = updatedUsers?.[0];

      const { data: holdings, error: getHoldingsError } = await supabase
        .from("Holding")
        .select("*")
        .eq("userId", userId);
      if (getHoldingsError) throw getHoldingsError;

      let holdingsVal = 0;
      for (const h of holdings || []) {
        const hLtp = priceStore.getPrice(h.token).ltp;
        holdingsVal += h.quantity * hLtp;
      }

      const historyId = require("crypto").randomUUID();
      const { error: insertHistoryError } = await supabase
        .from("PortfolioHistory")
        .insert({
          id: historyId,
          userId,
          cashBalance: updatedUser.balance,
          totalValue: updatedUser.balance + holdingsVal,
        });
      if (insertHistoryError) throw insertHistoryError;
    }

    return order;
  }
}

export async function processPendingOrders() {
  try {
    const { data: pendingOrders, error } = await supabase
      .from("Order")
      .select("*")
      .eq("status", "PENDING");
    if (error) throw error;

    if (!pendingOrders || pendingOrders.length === 0) return;

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
  try {
    const { data: orders, error: getOrderError } = await supabase
      .from("Order")
      .select("*")
      .eq("id", orderId)
      .limit(1);
    if (getOrderError) throw getOrderError;
    const order = orders?.[0];
    if (!order || order.status !== "PENDING") {
      return;
    }

    const { data: users, error: getUserError } = await supabase
      .from("User")
      .select("balance")
      .eq("id", order.userId)
      .limit(1);
    if (getUserError) throw getUserError;
    const user = users?.[0];
    if (!user) {
      return;
    }

    if (order.transactionType === "BUY") {
      const requiredMargin = order.quantity * fillPrice;
      if (user.balance < requiredMargin) {
        // Cancel / reject order due to insufficient margin on trigger
        const { error: rejectError } = await supabase
          .from("Order")
          .update({
            status: "REJECTED",
            rejectReason: "Insufficient funds on order trigger",
          })
          .eq("id", orderId);
        if (rejectError) throw rejectError;
        return;
      }

      // Update user balance
      const { error: updateBalError } = await supabase
        .from("User")
        .update({ balance: user.balance - requiredMargin })
        .eq("id", order.userId);
      if (updateBalError) throw updateBalError;

      // Update/Create holding
      const { data: existingHoldings, error: getHoldingError } = await supabase
        .from("Holding")
        .select("*")
        .eq("userId", order.userId)
        .eq("token", order.token)
        .eq("exchange", order.exchange)
        .limit(1);
      if (getHoldingError) throw getHoldingError;
      const existingHolding = existingHoldings?.[0];

      if (existingHolding) {
        const newQty = existingHolding.quantity + order.quantity;
        const newAvgPrice = (existingHolding.averagePrice * existingHolding.quantity + fillPrice * order.quantity) / newQty;
        const { error: updateHoldingError } = await supabase
          .from("Holding")
          .update({
            quantity: newQty,
            averagePrice: parseFloat(newAvgPrice.toFixed(2)),
          })
          .eq("id", existingHolding.id);
        if (updateHoldingError) throw updateHoldingError;
      } else {
        const holdingId = require("crypto").randomUUID();
        const { error: insertHoldingError } = await supabase
          .from("Holding")
          .insert({
            id: holdingId,
            userId: order.userId,
            symbol: order.symbol,
            token: order.token,
            exchange: order.exchange,
            quantity: order.quantity,
            averagePrice: fillPrice,
          });
        if (insertHoldingError) throw insertHoldingError;
      }

      // Update order status
      const { error: updateOrderError } = await supabase
        .from("Order")
        .update({
          status: "COMPLETED",
          price: fillPrice,
          completedAt: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (updateOrderError) throw updateOrderError;
    } else {
      // transactionType === "SELL"
      const { data: existingHoldings, error: getHoldingError } = await supabase
        .from("Holding")
        .select("*")
        .eq("userId", order.userId)
        .eq("token", order.token)
        .eq("exchange", order.exchange)
        .limit(1);
      if (getHoldingError) throw getHoldingError;
      const holding = existingHoldings?.[0];

      if (!holding || holding.quantity < order.quantity) {
        const { error: rejectError } = await supabase
          .from("Order")
          .update({
            status: "REJECTED",
            rejectReason: "Insufficient shares held on order trigger",
          })
          .eq("id", orderId);
        if (rejectError) throw rejectError;
        return;
      }

      const proceeds = order.quantity * fillPrice;

      // Update user balance
      const { error: updateBalError } = await supabase
        .from("User")
        .update({ balance: user.balance + proceeds })
        .eq("id", order.userId);
      if (updateBalError) throw updateBalError;

      // Decrement or delete holding
      if (holding.quantity === order.quantity) {
        const { error: deleteHoldingError } = await supabase
          .from("Holding")
          .delete()
          .eq("id", holding.id);
        if (deleteHoldingError) throw deleteHoldingError;
      } else {
        const { error: updateHoldingError } = await supabase
          .from("Holding")
          .update({ quantity: holding.quantity - order.quantity })
          .eq("id", holding.id);
        if (updateHoldingError) throw updateHoldingError;
      }

      // Update order status
      const { error: updateOrderError } = await supabase
        .from("Order")
        .update({
          status: "COMPLETED",
          price: fillPrice,
          completedAt: new Date().toISOString(),
        })
        .eq("id", orderId);
      if (updateOrderError) throw updateOrderError;
    }

    // Update portfolio value log
    const { data: updatedUsers, error: getUpdatedUserError } = await supabase
      .from("User")
      .select("balance")
      .eq("id", order.userId)
      .limit(1);
    if (getUpdatedUserError) throw getUpdatedUserError;
    const updatedUser = updatedUsers?.[0];

    const { data: holdings, error: getHoldingsError } = await supabase
      .from("Holding")
      .select("*")
      .eq("userId", order.userId);
    if (getHoldingsError) throw getHoldingsError;

    let holdingsVal = 0;
    for (const h of holdings || []) {
      const hLtp = priceStore.getPrice(h.token).ltp;
      holdingsVal += h.quantity * hLtp;
    }

    const historyId = require("crypto").randomUUID();
    const { error: insertHistoryError } = await supabase
      .from("PortfolioHistory")
      .insert({
        id: historyId,
        userId: order.userId,
        cashBalance: updatedUser.balance,
        totalValue: updatedUser.balance + holdingsVal,
      });
    if (insertHistoryError) throw insertHistoryError;
  } catch (err) {
    console.error("[OrderEngine] Error executing pending order:", err);
  }
}

// Subscribe to price store to run order matching on every price tick
if (typeof window === "undefined") {
  priceStore.subscribe(() => {
    processPendingOrders();
  });
}
