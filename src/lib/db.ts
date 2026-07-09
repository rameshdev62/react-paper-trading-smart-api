import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://jzfecbakzecdlqyflnxt.supabase.co";
// Use the service role key if available to bypass RLS for server-side operations and matching engine
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6ZmVjYmFremVjZGxxeWZsbnh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjIxMzAsImV4cCI6MjA5OTA5ODEzMH0.lF6h0yEh_EFOtjSCC2I-B9W-EkpW7gJUN7ae3OrSvMk";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
});
