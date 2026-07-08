import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    content.split("\n").forEach((line) => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    });
  }
}
loadEnv();
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({
  connectionString,
  ssl: connectionString?.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

async function main() {
  const email = "ramesh.dev062@gmail.com";
  const password = "password123";

  console.log("Registering user in Supabase Auth...");
  let userId: string;

  console.log("Attempting to sign in user in Supabase Auth...");
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInData.user) {
    userId = signInData.user.id;
    console.log("User authenticated successfully in Supabase Auth with ID:", userId);
  } else {
    console.log("Sign-in failed or user does not exist. Attempting sign-up...");
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: "Ramesh Dev",
        },
      },
    });

    if (signUpError) {
      throw new Error(`Failed to sign up user in Supabase Auth: ${signUpError.message}`);
    }

    if (!signUpData.user) {
      throw new Error("SignUp succeeded but no user was returned.");
    }
    userId = signUpData.user.id;
    console.log("User created successfully in Supabase Auth with ID:", userId);
  }

  // Sync to public."User" table
  console.log("Syncing user to public.\"User\" table...");
  await pool.query(
    `INSERT INTO "User" (id, email, "passwordHash", name, balance, "updatedAt")
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (email)
     DO UPDATE SET id = EXCLUDED.id, name = EXCLUDED.name, "updatedAt" = NOW()`,
    [userId, email, "", "Ramesh Dev", 1000000.0]
  );
  console.log("User synced successfully in public database!");
}

main()
  .catch(console.error)
  .finally(() => pool.end());
