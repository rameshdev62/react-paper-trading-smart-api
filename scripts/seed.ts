import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { createClient } from "@supabase/supabase-js";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

function parseSymbolFile(filePath: string): any[] {
  console.log(`Parsing symbol master file: ${path.basename(filePath)}...`);
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const instruments: any[] = [];
  
  // Validate header
  const header = lines[0].trim();
  if (!header.startsWith("Exchange")) {
    console.warn(`Warning: Unexpected header in ${filePath}: ${header}`);
    return [];
  }
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const parts = line.split(",");
    if (parts.length < 7) continue;
    
    const exchange = parts[0];
    const token = parts[1];
    const lotSize = parts[2];
    const symbol = parts[3];
    const tradingSymbol = parts[4];
    const instrument = parts[5];
    const tickSize = parts[6];
    
    // Filter down to equities and indices
    let keep = false;
    if (exchange === "NSE") {
      keep = (instrument === "EQ" || instrument === "INDEX");
    } else if (exchange === "BSE") {
      keep = (instrument === "A" || instrument === "B");
    }
    
    if (keep) {
      instruments.push({
        id: crypto.randomUUID(),
        token: token,
        symbol: tradingSymbol, // e.g. "SBIN-EQ" or "NIFTY INDEX"
        name: symbol,          // e.g. "SBIN" or "Nifty 50"
        expiry: null,
        strike: null,
        lotsize: parseInt(lotSize) || 1,
        exchSeg: exchange,
        tickSize: parseFloat(tickSize) || 0.05,
      });
    }
  }
  
  return instruments;
}

async function downloadAndExtract(url: string, zipName: string, txtName: string): Promise<string> {
  console.log(`Downloading ${zipName} from ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error ${res.status} fetching ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  
  const tempDir = process.cwd();
  const zipPath = path.join(tempDir, zipName);
  const txtPath = path.join(tempDir, txtName);
  
  fs.writeFileSync(zipPath, buffer);
  
  console.log(`Extracting ${zipName}...`);
  try {
    execSync(`unzip -o ${zipPath} -d ${tempDir}`);
  } catch (err: any) {
    console.error(`Failed to extract ${zipName}:`, err.message);
    throw err;
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
  
  return txtPath;
}

async function main() {
  console.log("Starting generation of local Instruments CSV from Shoonya API Symbol Masters...");

  let allInstrumentsToInsert: any[] = [];

  // 1. Download and Parse NSE Symbols
  try {
    const nseTxtPath = await downloadAndExtract(
      "https://api.shoonya.com/NSE_symbols.txt.zip",
      "NSE_symbols.txt.zip",
      "NSE_symbols.txt"
    );
    const nseInstruments = parseSymbolFile(nseTxtPath);
    console.log(`Found ${nseInstruments.length} NSE instruments.`);
    allInstrumentsToInsert = allInstrumentsToInsert.concat(nseInstruments);
    if (fs.existsSync(nseTxtPath)) fs.unlinkSync(nseTxtPath);
  } catch (err: any) {
    console.error("Failed to seed NSE symbols:", err.message);
  }

  // 2. Download and Parse BSE Symbols
  try {
    const bseTxtPath = await downloadAndExtract(
      "https://api.shoonya.com/BSE_symbols.txt.zip",
      "BSE_symbols.txt.zip",
      "BSE_symbols.txt"
    );
    const bseInstruments = parseSymbolFile(bseTxtPath);
    console.log(`Found ${bseInstruments.length} BSE instruments.`);
    allInstrumentsToInsert = allInstrumentsToInsert.concat(bseInstruments);
    if (fs.existsSync(bseTxtPath)) fs.unlinkSync(bseTxtPath);
  } catch (err: any) {
    console.error("Failed to seed BSE symbols:", err.message);
  }

  // 3. Deduplicate by token just in case
  const seenTokens = new Set<string>();
  const deduplicated: any[] = [];
  for (const item of allInstrumentsToInsert) {
    if (!seenTokens.has(item.token)) {
      seenTokens.add(item.token);
      deduplicated.push(item);
    }
  }

  console.log(`Total deduplicated instruments: ${deduplicated.length}`);

  // 4. Save to local CSV file
  const dataDir = path.join(process.cwd(), "src", "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const outputPath = path.join(dataDir, "instruments.csv");
  console.log(`Writing instruments to CSV: ${outputPath}...`);

  const headers = ["token", "symbol", "name", "lotsize", "exchSeg", "tickSize"];
  const csvRows = [headers.join(",")];

  for (const inst of deduplicated) {
    const row = [
      inst.token,
      inst.symbol,
      inst.name.replace(/,/g, " "),
      inst.lotsize,
      inst.exchSeg,
      inst.tickSize
    ].join(",");
    csvRows.push(row);
  }

  fs.writeFileSync(outputPath, csvRows.join("\n"), "utf-8");
  console.log(`CSV generation completed successfully! Generated ${deduplicated.length} instruments.`);
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  });
