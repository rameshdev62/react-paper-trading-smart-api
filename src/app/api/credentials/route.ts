import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { validateCredentials, startLiveFeed } from "@/lib/smartapi";

export const dynamic = "force-dynamic";

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return value.slice(0, 2) + "****" + value.slice(-2);
}

// GET /api/credentials: Check if user has credentials configured
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const credentials = await prisma.credentials.findUnique({
      where: { userId: user.userId },
      select: { clientCode: true, apiKey: true, totpSecret: true, updatedAt: true },
    });

    return NextResponse.json({
      configured: !!credentials,
      clientCode: credentials?.clientCode || null,
      apiKey: credentials ? mask(credentials.apiKey) : null,
      totpSecret: credentials ? mask(credentials.totpSecret) : null,
      updatedAt: credentials?.updatedAt || null,
    });
  } catch (error: any) {
    console.error("[Credentials API] Error checking config:", error);
    return NextResponse.json({ error: "Failed to verify credentials state" }, { status: 500 });
  }
}

// POST /api/credentials: Set/update credentials and run validation checks
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { clientCode, password, apiKey, totpSecret } = await req.json();

    if (!clientCode || !password || !apiKey || !totpSecret) {
      return NextResponse.json({ error: "All credential fields are required" }, { status: 400 });
    }

    // Validate the credentials with Angel One directly first
    console.log("[Credentials API] Validating credentials with Angel One SmartAPI...");
    try {
      await validateCredentials({
        clientCode,
        passwordHash: password,
        apiKey,
        totpSecret,
      });
    } catch (validationErr: any) {
      console.error("[Credentials API] Verification failed:", validationErr.message);
      return NextResponse.json({ error: `Angel One Validation Failed: ${validationErr.message}` }, { status: 400 });
    }

    // Save to database
    const credentials = await prisma.credentials.upsert({
      where: { userId: user.userId },
      update: {
        clientCode,
        password,
        apiKey,
        totpSecret,
      },
      create: {
        userId: user.userId,
        clientCode,
        password,
        apiKey,
        totpSecret,
      },
    });

    // If app is configured to live mode, start the WebSocket feed automatically
    if (process.env.NEXT_PUBLIC_APP_MODE === "live") {
      // Run it in the background
      startLiveFeed(user.userId).catch((err) => {
        console.error("[Credentials API] Failed to start live feed:", err);
      });
    }

    return NextResponse.json({
      message: "Credentials saved and validated successfully",
      clientCode: credentials.clientCode,
    });
  } catch (error: any) {
    console.error("[Credentials API] Error saving credentials:", error);
    return NextResponse.json({ error: "Failed to store credentials" }, { status: 500 });
  }
}

// DELETE /api/credentials: Remove saved credentials
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.credentials.deleteMany({ where: { userId: user.userId } });
    return NextResponse.json({ message: "Credentials removed successfully" });
  } catch (error: any) {
    console.error("[Credentials API] Error deleting credentials:", error);
    return NextResponse.json({ error: "Failed to delete credentials" }, { status: 500 });
  }
}
