import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "";

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
            } catch { }
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

    // Create an authenticated client with the user's session token to ensure queries are run in RLS context
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${data.session?.access_token}`,
        },
      },
    });

    // Look up or auto-provision user record in public."User" table using the userClient
    const { data: dbUserList, error: userSelectError } = await userClient
      .from("User")
      .select("*")
      .eq("email", email);

    if (userSelectError) {
      throw new Error(`Database select failed: ${userSelectError.message}`);
    }

    let dbUser = dbUserList?.[0] || null;

    if (!dbUser) {
      // Auto-provision user in public."User" table using userClient
      const uuid = data.user.id;
      const name = data.user.user_metadata?.full_name || email.split("@")[0];

      const { data: insertList, error: userInsertError } = await userClient
        .from("User")
        .insert({
          id: uuid,
          email: email,
          passwordHash: "",
          name: name,
          balance: 1000000.0,
          updatedAt: new Date().toISOString(),
        })
        .select();

      if (userInsertError) {
        throw new Error(`Database insert failed: ${userInsertError.message}`);
      }
      dbUser = insertList?.[0];
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
