import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestClient } from "@/lib/db";

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

    const supabase = await getRequestClient();
    // Cancel order
    const { data: orders, error: selectError } = await supabase
      .from("Order")
      .select("*")
      .eq("id", orderId)
      .limit(1);

    if (selectError) throw selectError;
    const order = orders?.[0];

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.userId !== user.userId) {
      throw new Error("Unauthorized to cancel this order");
    }

    if (order.status !== "PENDING") {
      throw new Error(`Cannot cancel order. Current status: ${order.status}`);
    }

    const { data: updatedOrders, error: updateError } = await supabase
      .from("Order")
      .update({ status: "CANCELLED", completedAt: new Date().toISOString() })
      .eq("id", orderId)
      .select();

    if (updateError) throw updateError;
    const result = updatedOrders?.[0];

    return NextResponse.json({
      message: "Order cancelled successfully",
      order: result,
    });
  } catch (error: any) {
    console.error("[Orders Cancel API] Error cancelling order:", error);
    return NextResponse.json({ error: error.message || "Failed to cancel order" }, { status: 500 });
  }
}
