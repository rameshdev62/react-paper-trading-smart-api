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
  const { fetchShoonyaOrders } = await import("../src/lib/shoonya");
  const userId = process.env.USER_ID;
  const accessToken = process.env.ACCESS_TOKEN;
  console.log("Using USER_ID:", userId);
  console.log("Using ACCESS_TOKEN:", accessToken);

  if (!userId || !accessToken) {
    console.error("Missing USER_ID or ACCESS_TOKEN in .env");
    return;
  }

  try {
    const data = await fetchShoonyaOrders(userId, accessToken);
    console.log("Response data:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error executing fetchShoonyaOrders:", error);
  }
}

main().catch(console.error);
