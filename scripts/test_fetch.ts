async function test() {
  console.log("Fetching instrument master...");
  try {
    const res = await fetch("https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json");
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json() as any[];
    console.log("Total instruments:", data.length);
    
    const matches = data.filter(x => x.name === "SBIN" || x.symbol === "RELIANCE-EQ" || x.name === "RELIANCE");
    console.log("Matches found:", matches.length);
    console.log(JSON.stringify(matches.slice(0, 10), null, 2));

    const exchSegs = new Set(data.map(x => x.exch_seg));
    console.log("Distinct exch_seg values:", Array.from(exchSegs));

    const instTypes = new Set(data.map(x => x.instrumenttype));
    console.log("Distinct instrumenttype values:", Array.from(instTypes).slice(0, 15));
  } catch (error) {
    console.error("Error:", error);
  }
}

test();
