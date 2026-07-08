import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.SUPABASE_URL || "https://jzfecbakzecdlqyflnxt.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZmVjYmFremVjZGxxeWZsbnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjIxMzAsImV4cCI6MjA5OTA5ODEzMH0.lF6h0yEh_EFOtjSCC2I-B9W-EkpW7gJUN7ae3OrSvMk";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    // Sign out from Supabase Auth (this clears session cookies)
    await supabase.auth.signOut();

    return NextResponse.json({ message: "Logged out successfully" });
  } catch (error: any) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
