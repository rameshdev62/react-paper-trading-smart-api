import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = process.env.SHOONYA_USER_ID || process.env.USER_ID || "";
    const clientId = process.env.SHOONYA_API_KEY || process.env.CLIENT_ID || "";
    const secretCode = process.env.SHOONYA_API_SECRET || process.env.SECRET_CODE || "";
    
    const isConfigured = !!(
      userId &&
      (process.env.SHOONYA_PASSWORD || process.env.PASSWORD) &&
      clientId &&
      secretCode &&
      process.env.SHOONYA_TOTP_SECRET
    );

    return NextResponse.json({
      userId,
      clientId,
      secretCode,
      isConfigured,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
