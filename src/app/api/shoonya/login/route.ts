import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/shoonya";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { auto, authCode, secretCode, clientId, userId } = body;

    if (auto) {
      const { exec } = require("child_process");
      const { promisify } = require("util");
      const execAsync = promisify(exec);

      console.log("[Shoonya Login API] Triggering programmatic credentials auto-login...");
      const { stdout } = await execAsync("python3 scripts/auto_login.py");
      
      const result = JSON.parse(stdout);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const session = result.session;
      const cookieStore = await cookies();
      cookieStore.set("shoonya_session", JSON.stringify(session), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24, // 24 hours
        path: "/",
      });

      return NextResponse.json({ success: true, session });
    }

    const finalUserId = userId || process.env.SHOONYA_USER_ID || process.env.USER_ID;
    const finalClientId = clientId || process.env.SHOONYA_API_KEY || process.env.CLIENT_ID;
    const finalSecretCode = secretCode || process.env.SHOONYA_API_SECRET || process.env.SECRET_CODE;

    if (!authCode || !finalSecretCode || !finalClientId || !finalUserId) {
      return NextResponse.json(
        { error: "authCode, secretCode, clientId, and userId are required" },
        { status: 400 }
      );
    }

    const session = await getAccessToken({
      authCode,
      secretCode: finalSecretCode,
      clientId: finalClientId,
      userId: finalUserId,
    });

    const cookieStore = await cookies();
    cookieStore.set("shoonya_session", JSON.stringify(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return NextResponse.json({ success: true, session });
  } catch (error: any) {
    console.error("[Shoonya Login API] Error exchanging code:", error);
    return NextResponse.json(
      { error: error.message || "Failed to exchange Shoonya authentication code" },
      { status: 500 }
    );
  }
}
