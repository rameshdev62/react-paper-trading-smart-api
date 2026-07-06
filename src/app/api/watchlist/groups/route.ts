import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// DELETE /api/watchlist/groups?group=xxx — Delete a group and all its items
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const group = searchParams.get("group");
    const mode = searchParams.get("mode");

    if (!group) {
      return NextResponse.json({ error: "Missing group parameter" }, { status: 400 });
    }

    if (group === "Default") {
      return NextResponse.json({ error: "Cannot delete the Default group" }, { status: 400 });
    }

    await prisma.watchlist.deleteMany({
      where: {
        userId: user.userId,
        group,
      },
    });

    if (mode === "live" || process.env.NEXT_PUBLIC_APP_MODE === "live") {
      const { startLiveFeed } = require("@/lib/smartapi");
      startLiveFeed(user.userId).catch((err: any) => {
        console.error("[Watchlist API] Failed to update live feed:", err);
      });
    }

    return NextResponse.json({ message: "Group deleted successfully" });
  } catch (error: any) {
    console.error("[Watchlist API] Error deleting group:", error);
    return NextResponse.json({ error: error.message || "Failed to delete group" }, { status: 500 });
  }
}
