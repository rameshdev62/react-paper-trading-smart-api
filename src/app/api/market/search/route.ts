import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("query") || "";

    if (query.trim().length < 2) {
      return NextResponse.json([]);
    }

    // Query our cached Instrument Master table
    const instruments = await prisma.instrument.findMany({
      where: {
        OR: [
          { symbol: { contains: query } },
          { name: { contains: query } },
        ],
      },
      take: 10,
    });

    return NextResponse.json(instruments);
  } catch (error: any) {
    console.error("[Market Search API] Error searching instruments:", error);
    return NextResponse.json({ error: "Failed to search instruments" }, { status: 500 });
  }
}
