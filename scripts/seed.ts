import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Starting database seed...");

  // 1. Clean existing instruments
  console.log("Cleaning up existing instruments...");
  const { error: deleteError } = await supabase
    .from("Instrument")
    .delete()
    .neq("id", "");
  if (deleteError) throw deleteError;

  // 2. Fetch scrip master JSON
  console.log("Fetching instrument master list from Angel One...");
  const url = "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch instrument list: HTTP ${response.status}`);
  }
  const allInstruments = (await response.json()) as any[];
  console.log(`Successfully fetched ${allInstruments.length} instruments.`);

  // 3. Filter for equities and main indices
  console.log("Filtering cash equities and indices...");
  const filtered = allInstruments.filter(
    (item) =>
      (item.exch_seg === "NSE" || item.exch_seg === "BSE") &&
      (item.instrumenttype === "" || item.instrumenttype === "AMXIDX")
  );

  console.log(`Filtered down to ${filtered.length} instruments.`);

  // 4. Map to structure and deduplicate in memory
  const seenTokens = new Set<string>();
  const instrumentsToInsert: any[] = [];

  for (const item of filtered) {
    if (!seenTokens.has(item.token)) {
      seenTokens.add(item.token);
      instrumentsToInsert.push({
        id: require("crypto").randomUUID(),
        token: item.token,
        symbol: item.symbol,
        name: item.name,
        expiry: item.expiry || null,
        strike: item.strike || null,
        lotsize: item.lotsize || null,
        exchSeg: item.exch_seg,
        tickSize: item.tick_size || null,
      });
    }
  }

  console.log(`Deduplicated to ${instrumentsToInsert.length} unique instruments.`);

  // 5. Batch insert
  const batchSize = 1000;
  console.log(`Seeding ${instrumentsToInsert.length} instruments in batches of ${batchSize}...`);

  for (let i = 0; i < instrumentsToInsert.length; i += batchSize) {
    const batch = instrumentsToInsert.slice(i, i + batchSize);
    
    const { error: insertError } = await supabase
      .from("Instrument")
      .insert(batch);
    if (insertError) throw insertError;

    const progress = Math.min(i + batchSize, instrumentsToInsert.length);
    console.log(`Seeded ${progress}/${instrumentsToInsert.length} instruments...`);
  }

  console.log("Database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  });
