import { NextRequest } from "next/server";
import { priceStore } from "@/lib/priceStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Automatically trigger the simulation loop if in Mock Mode
  if (process.env.NEXT_PUBLIC_APP_MODE === "mock") {
    priceStore.startMockSimulation();
  }

  const encoder = new TextEncoder();

  const responseStream = new ReadableStream({
    start(controller) {
      // Subscribe to the central PriceStore cache updates
      const unsubscribe = priceStore.subscribe((prices) => {
        try {
          const payload = `data: ${JSON.stringify(prices)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch (err) {
          console.error("[Market Stream API] Failed to stream data:", err);
        }
      });

      // If client aborts (closes dashboard), remove subscription
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        controller.close();
        console.log("[Market Stream API] Client disconnected from stream.");
      });
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
