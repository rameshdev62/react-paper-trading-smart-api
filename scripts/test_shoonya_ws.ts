import fs from "fs";
import path from "path";
import WebSocket from "ws";

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

const wsUrls = [
  "wss://api.shoonya.com/NorenWSAPI/",
  "wss://api.shoonya.com/NorenWSTP/"
];

async function testWs(url: string) {
  console.log(`\nTesting connection to: ${url}`);
  return new Promise<void>((resolve) => {
    const ws = new WebSocket(url);
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        console.log(`[${url}] Timeout after 5 seconds`);
        ws.terminate();
        resolved = true;
        resolve();
      }
    }, 5000);

    ws.on("open", () => {
      console.log(`[${url}] Connection opened successfully!`);
      
      const authPayload = {
        t: "a",
        uid: process.env.USER_ID,
        actid: process.env.ACCOUNT_ID,
        accesstoken: process.env.ACCESS_TOKEN,
        source: "API",
      };

      console.log(`[${url}] Sending auth payload:`, JSON.stringify(authPayload));
      ws.send(JSON.stringify(authPayload));
    });

    ws.on("message", (data) => {
      console.log(`[${url}] Received message:`, data.toString());
      clearTimeout(timer);
      resolved = true;
      ws.close();
      resolve();
    });

    ws.on("error", (err) => {
      console.error(`[${url}] Error:`, err.message);
      clearTimeout(timer);
      resolved = true;
      resolve();
    });

    ws.on("close", (code, reason) => {
      console.log(`[${url}] Connection closed. Code: ${code}, Reason: ${reason}`);
      clearTimeout(timer);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
  });
}

async function main() {
  for (const url of wsUrls) {
    await testWs(url);
  }
}

main().catch(console.error);
