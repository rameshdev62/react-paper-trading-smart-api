import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
    }

    // Cancel order in transaction
    const dbClient = await pool.connect();
    let result;
    try {
      await dbClient.query("BEGIN");
      
      const orderRes = await dbClient.query('SELECT * FROM "Order" WHERE id = $1', [orderId]);
      const order = orderRes.rows[0];

      if (!order) {
        throw new Error("Order not found");
      }

      if (order.userId !== user.userId) {
        throw new Error("Unauthorized to cancel this order");
      }

      if (order.status !== "PENDING") {
        throw new Error(`Cannot cancel order. Current status: ${order.status}`);
      }

      const updateRes = await dbClient.query(
        'UPDATE "Order" SET status = $1, "completedAt" = $2 WHERE id = $3 RETURNING *',
        ["CANCELLED", new Date(), orderId]
      );
      result = updateRes.rows[0];

      await dbClient.query("COMMIT");
    } catch (txError) {
      await dbClient.query("ROLLBACK");
      throw txError;
    } finally {
      dbClient.release();
    }

    return NextResponse.json({
      message: "Order cancelled successfully",
      order: result,
    });
  } catch (error: any) {
    console.error("[Orders Cancel API] Error cancelling order:", error);
    return NextResponse.json({ error: error.message || "Failed to cancel order" }, { status: 500 });
  }
}
