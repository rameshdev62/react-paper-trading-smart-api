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

    const userId = user.userId;

    await prisma.$transaction([
      prisma.paperTrade.deleteMany({ where: { userId } }),
      prisma.paperOrder.deleteMany({ where: { userId } }),
      prisma.paperPosition.deleteMany({ where: { userId } }),
      prisma.paperHolding.deleteMany({ where: { userId } }),
      prisma.paperTransaction.deleteMany({ where: { userId } }),
      prisma.paperAccount.deleteMany({ where: { userId } }),
    ]);

    return NextResponse.json({ message: "Paper trading data reset successfully" });
  } catch (error: any) {
    console.error("[Paper Reset API] Error resetting data:", error);
    return NextResponse.json({ error: "Failed to reset paper trading data" }, { status: 500 });
  }
}
