import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getRequestClient } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/watchlist/rename — Rename a group
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getRequestClient();
    const { oldName, newName } = await req.json();
    if (!oldName || !newName) {
      return NextResponse.json({ error: "Missing oldName or newName" }, { status: 400 });
    }

    if (oldName === "Default") {
      return NextResponse.json({ error: "Cannot rename the Default group" }, { status: 400 });
    }

    const { error } = await supabase
      .from("Watchlist")
      .update({ group: newName })
      .eq("userId", user.userId)
      .eq("group", oldName);

    if (error) throw error;

    return NextResponse.json({ message: "Group renamed successfully" });
  } catch (error: any) {
    console.error("[Watchlist API] Error renaming group:", error);
    return NextResponse.json({ error: error.message || "Failed to rename group" }, { status: 500 });
  }
}
