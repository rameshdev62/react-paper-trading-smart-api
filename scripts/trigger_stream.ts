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

async function main() {
  const email = "ramesh.dev062@gmail.com";
  const password = "password123";

  console.log("Logging in via Auth API...");
  const authRes = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!authRes.ok) {
    console.error("Login failed:", await authRes.text());
    return;
  }

  const authData = await authRes.json() as any;
  const token = authData.token;
  console.log("Login successful! Token:", token.substring(0, 10) + "...");

  const headers = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    "x-shoonya-access-token": process.env.ACCESS_TOKEN || "6bb6d5517fcc856e0bf7e905026e72d494e8991d17c49545dbe65fedc1646125",
    "x-shoonya-user-id": process.env.USER_ID || "FA180616",
    "x-shoonya-account-id": process.env.ACCOUNT_ID || "FA180616",
  };

  console.log("\nFetching /api/orders?mode=live...");
  const ordersRes = await fetch("http://localhost:3000/api/orders?mode=live", { headers });
  console.log("Orders response status:", ordersRes.status);
  console.log("Orders response body:", await ordersRes.text());

  console.log("\nFetching /api/portfolio?mode=live...");
  const portfolioRes = await fetch("http://localhost:3000/api/portfolio?mode=live", { headers });
  console.log("Portfolio response status:", portfolioRes.status);
  console.log("Portfolio response body:", await portfolioRes.text());
}

main().catch(console.error);
