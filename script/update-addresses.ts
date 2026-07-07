import { getBitcoinAddresses } from "../src/index.ts";

console.log("Fetching OFAC sanctions list...");
const addresses = await getBitcoinAddresses();
console.log(`Found ${addresses.length} Bitcoin addresses`);

const outputPath = `${import.meta.dir}/../src/data/addresses.json`;
await Bun.write(outputPath, JSON.stringify(addresses, null, 2) + "\n");
console.log(`Written to ${outputPath}`);
