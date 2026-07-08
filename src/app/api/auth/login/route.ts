import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
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
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
