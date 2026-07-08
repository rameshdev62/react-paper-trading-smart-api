import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

const supabaseUrl = process.env.SUPABASE_URL || "https://jzfecbakzecdlqyflnxt.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZmVjYmFremVjZGxxeWZsbnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjIxMzAsImV4cCI6MjA5OTA5ODEzMH0.lF6h0yEh_EFOtjSCC2I-B9W-EkpW7gJUN7ae3OrSvMk";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      return NextResponse.json({ error: error?.message || "Invalid email or password" }, { status: 401 });
    }

    // Look up or auto-provision user record in public."User" table
    const userRes = await query('SELECT * FROM "User" WHERE email = $1', [email]);
    let dbUser = userRes.rows[0];

    if (!dbUser) {
      // Auto-provision user in public."User" table
      const uuid = data.user.id;
      const name = data.user.user_metadata?.full_name || email.split("@")[0];
      const insertRes = await query(
        `INSERT INTO "User" (id, email, "passwordHash", name, balance, "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [uuid, email, "", name, 1000000.0]
      );
      dbUser = insertRes.rows[0];
    }

    return NextResponse.json({
      message: "Login successful",
      token: data.session?.access_token || "",
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        balance: dbUser.balance,
      },
    });
  } catch (error: any) {
    console.error("Login error:", error);
    return NextResponse.json({ error: error?.message || "Something went wrong" }, { status: 500 });
  }
}
