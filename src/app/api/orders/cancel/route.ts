import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        throw new Error("Order not found");
      }

      if (order.userId !== user.userId) {
        throw new Error("Unauthorized to cancel this order");
      }

      if (order.status !== "PENDING") {
        throw new Error(`Cannot cancel order. Current status: ${order.status}`);
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: "CANCELLED", completedAt: new Date() },
      });

      return updatedOrder;
    });

    return NextResponse.json({
      message: "Order cancelled successfully",
      order: result,
    });
  } catch (error: any) {
    console.error("[Orders Cancel API] Error cancelling order:", error);
    return NextResponse.json({ error: error.message || "Failed to cancel order" }, { status: 500 });
  }
}
