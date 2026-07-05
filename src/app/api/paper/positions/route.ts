import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const positions = await prisma.paperPosition.findMany({
      where: { userId: user.userId, netQty: { not: 0 } },
    });

    return NextResponse.json(positions);
  } catch (error: any) {
    console.error("[Paper Positions API] Error fetching positions:", error);
    return NextResponse.json({ error: "Failed to fetch positions" }, { status: 500 });
  }
}
