import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseUrl = process.env.SUPABASE_URL || "https://jzfecbakzecdlqyflnxt.supabase.co";
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZmVjYmFremVjZGxxeWZsbnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjIxMzAsImV4cCI6MjA5OTA5ODEzMH0.lF6h0yEh_EFOtjSCC2I-B9W-EkpW7gJUN7ae3OrSvMk";

export function signToken(userId: string, email: string): string {
  // Returns the userId itself as a fallback token string
  return userId;
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  if (token && token.length >= 32) {
    return { userId: token, email: "" };
  }
  return null;
}

export async function getAuthUser(req: Request): Promise<{ userId: string; email: string } | null> {
  // 1. Try reading the Supabase session cookie first
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
            } catch {
              // Ignore if called in a server component
            }
          },
        },
      }
    );

    const { data: { user }, error } = await supabase.auth.getUser();
    if (user && !error) {
      return { userId: user.id, email: user.email! };
    }
  } catch (err) {
    console.error("[getAuthUser] Error checking cookie session:", err);
  }

  // 2. Fallback to Bearer token header if the request specifies it
  const authHeader = req.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const supabase = createClient(
        supabaseUrl,
        supabaseAnonKey
      );
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) {
        return { userId: user.id, email: user.email! };
      }
    } catch (err) {
      console.error("[getAuthUser] Error checking bearer token:", err);
    }
  }

  // 3. Fallback to query parameter token for SSE EventSource compatibility
  try {
    const url = new URL(req.url, "http://localhost");
    const queryToken = url.searchParams.get("token");
    if (queryToken) {
      const supabase = createClient(
        supabaseUrl,
        supabaseAnonKey
      );
      const { data: { user }, error } = await supabase.auth.getUser(queryToken);
      if (user && !error) {
        return { userId: user.id, email: user.email! };
      }
    }
  } catch {}

  return null;
}
