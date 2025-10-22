# bitcoin-ofac-addresses

Fetch OFAC (Office of Foreign Assets Control) sanctioned Bitcoin addresses from the official U.S. Treasury source. Zero dependencies, works with Bun, Node.js, and browsers.

## Features

- **Zero dependencies** - Uses native fetch API
- **Dual mode** - Async (fresh data) or static (cached snapshot)
- **TypeScript native** - Full type safety
- **Auto-updated** - Weekly GitHub Actions updates static data
- **Official source** - Fetches from treasury.gov
- **Universal** - Works with Bun, Node.js 18+, browsers

## Installation

```bash
# Bun
bun add bitcoin-ofac-addresses

# npm
npm install bitcoin-ofac-addresses

# pnpm
pnpm add bitcoin-ofac-addresses

# yarn
yarn add bitcoin-ofac-addresses
```

## Usage

### Async Mode (Fresh Data)

Fetches the latest sanctioned addresses directly from OFAC:

```typescript
import { getBitcoinAddresses } from "bitcoin-ofac-addresses";

const addresses = await getBitcoinAddresses();
console.log(`Found ${addresses.length} sanctioned Bitcoin addresses`);

// Check if an address is sanctioned
const addressToCheck = "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h";
const isSanctioned = addresses.includes(addressToCheck);
console.log(`Is sanctioned: ${isSanctioned}`);
```

### Static Mode (Fast, Cached)

Uses a pre-fetched snapshot (updated weekly):

```typescript
import { bitcoinAddresses } from "bitcoin-ofac-addresses/static";

// Instant access, no network request
console.log(`Loaded ${bitcoinAddresses.length} addresses`);

const isSanctioned = bitcoinAddresses.includes(
  "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",
);
console.log(`Is sanctioned: ${isSanctioned}`);
```

## When to Use Each Mode

### Use Async Mode when:

- You need the absolute latest data
- Compliance is critical
- Network latency is acceptable
- Building regulatory/compliance tools

### Use Static Mode when:

- Speed is critical
- Offline access is needed
- Weekly updates are sufficient
- Building quick validation checks

## API

### `getBitcoinAddresses()`

Fetches the latest OFAC sanctioned Bitcoin addresses.

**Returns:** `Promise<string[]>` - Array of Bitcoin addresses

**Throws:** Error if the OFAC data cannot be fetched or parsed

### `bitcoinAddresses`

Static export of Bitcoin addresses (updated weekly via GitHub Actions).

**Type:** `string[]` - Array of Bitcoin addresses

## Data Source

Data is fetched from the official OFAC Specially Designated Nationals (SDN) list:
`https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn_advanced.xml`

The static snapshot is automatically updated every Sunday at midnight UTC via GitHub Actions.

## Examples

### Simple Validation

```typescript
import { bitcoinAddresses } from "bitcoin-ofac-addresses/static";

function isAddressSanctioned(address: string): boolean {
  return bitcoinAddresses.includes(address);
}

console.log(isAddressSanctioned("12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h")); // true
console.log(isAddressSanctioned("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")); // false
```

### Batch Validation

```typescript
import { getBitcoinAddresses } from "bitcoin-ofac-addresses";

async function validateAddresses(addresses: string[]) {
  const sanctionedAddresses = await getBitcoinAddresses();
  const sanctionedSet = new Set(sanctionedAddresses);

  return addresses.map((addr) => ({
    address: addr,
    isSanctioned: sanctionedSet.has(addr),
  }));
}

const results = await validateAddresses([
  "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",
  "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
]);

console.log(results);
```

### Express.js API Endpoint

```typescript
import express from "express";
import { getBitcoinAddresses } from "bitcoin-ofac-addresses";

const app = express();

app.get("/check/:address", async (req, res) => {
  const { address } = req.params;
  const sanctionedAddresses = await getBitcoinAddresses();

  res.json({
    address,
    isSanctioned: sanctionedAddresses.includes(address),
  });
});

app.listen(3000);
```

## Development

### Update Static Data

```bash
bun run update
```

### Run Tests

```bash
bun test
```

## How It Works

1. **Async Mode**: Fetches the OFAC SDN XML file, parses it for Bitcoin addresses (XBT feature type), deduplicates and sorts them
2. **Static Mode**: Imports a pre-generated JSON file containing the address list
3. **Auto-Updates**: GitHub Actions runs weekly to keep the static data fresh

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or PR.

## Disclaimer

This package is provided as-is for informational purposes. While we strive for accuracy, users should verify critical compliance decisions with official OFAC sources. The authors are not responsible for any compliance violations resulting from use of this package.

## Links

- [OFAC Sanctions List Service](https://sanctionslistservice.ofac.treas.gov/)
- [GitHub Repository](https://github.com/nhamilton1/bitcoin-ofac-addresses)
- [NPM Package](https://www.npmjs.com/package/bitcoin-ofac-addresses)
