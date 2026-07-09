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
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
  const { error: syncError } = await supabase
    .from("User")
    .upsert(
      {
        id: userId,
        email,
        passwordHash: "",
        name: "Ramesh Dev",
        balance: 1000000.0,
        updatedAt: new Date().toISOString(),
      },
      {
        onConflict: "email",
      }
    );

  if (syncError) {
    throw new Error(`Failed to sync user: ${syncError.message}`);
  }
  console.log("User synced successfully in public database!");
}

main()
  .catch(console.error);
