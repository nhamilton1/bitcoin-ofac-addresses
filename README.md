# bitcoin-ofac-addresses

Fetch OFAC (Office of Foreign Assets Control) sanctioned Bitcoin addresses from the official U.S. Treasury source. Built with Effect v4 and works with Node.js, Bun, and bundlers.

## Features

- **Typed failures** - Network, HTTP status, response body, and XML parsing errors are distinct tagged errors
- **Dependency injection** - Replace the HTTP service with an Effect layer in tests or applications
- **Dual mode** - Effect-based live data or a static cached snapshot
- **TypeScript native** - Full Effect v4 types and shipped declarations
- **Auto-updated** - Daily GitHub Actions updates static data
- **Official source** - Fetches from the OFAC Sanctions List Service (sanctionslistservice.ofac.treas.gov)
- **Runtime-friendly** - Prebuilt ESM + type declarations for Node.js and bundlers; raw TypeScript for Bun

## Installation

```bash
# Bun
bun add bitcoin-ofac-addresses effect@4.0.0-beta.101

# npm
npm install bitcoin-ofac-addresses effect@4.0.0-beta.101

# pnpm
pnpm add bitcoin-ofac-addresses effect@4.0.0-beta.101

# yarn
yarn add bitcoin-ofac-addresses effect@4.0.0-beta.101
```

## Usage

### Effect Mode (Fresh Data)

Fetches the latest sanctioned addresses directly from OFAC:

```typescript
import { Effect } from "effect";
import {
  getBitcoinAddresses,
  OfacHttpClientLive,
} from "bitcoin-ofac-addresses";

const addresses = await Effect.runPromise(
  getBitcoinAddresses().pipe(Effect.provide(OfacHttpClientLive)),
);
console.log(`Found ${addresses.length} sanctioned Bitcoin addresses`);

// Check if an address is sanctioned
const addressToCheck = "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h";
const isSanctioned = addresses.includes(addressToCheck);
console.log(`Is sanctioned: ${isSanctioned}`);
```

### Static Mode (Fast, Cached)

Uses a pre-fetched snapshot (updated daily):

```typescript
import { ofacAddresses } from "bitcoin-ofac-addresses/static";

// Instant access, no network request
console.log(`Loaded ${ofacAddresses.length} addresses`);

const isSanctioned = ofacAddresses.includes(
  "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",
);
console.log(`Is sanctioned: ${isSanctioned}`);
```

### Raw JSON (any runtime)

The address list is also exported as plain JSON, so runtimes that can't load
TypeScript directly (e.g. plain Node.js) can still consume the data:

```javascript
// CommonJS (any Node version)
const addresses = require("bitcoin-ofac-addresses/addresses.json");
```

```typescript
// ESM with import attributes (Bun, Node 20.10+)
import addresses from "bitcoin-ofac-addresses/addresses.json" with { type: "json" };
```

## When to Use Each Mode

### Use Effect Mode when:

- You need the absolute latest data
- Compliance is critical
- Network latency is acceptable
- Building regulatory/compliance tools

### Use Static Mode when:

- Speed is critical
- Offline access is needed
- Daily updates are sufficient
- Building quick validation checks

## API

### `getBitcoinAddresses()`

Fetches the latest OFAC sanctioned Bitcoin addresses. Note that this downloads
the full SDN advanced XML (tens of MB), so prefer the static export when
freshness within a day is acceptable.

**Type:** `Effect.Effect<ReadonlyArray<string>, OfacTransportError | OfacHttpStatusError | OfacBodyError | OfacParseError, OfacHttpClient>`

Provide `OfacHttpClientLive` for native fetch, or provide your own `OfacHttpClient` layer. Effect interruption cancels an in-progress response body download.

### `parseBitcoinAddresses(xml)`

Extracts Bitcoin (XBT) addresses from SDN advanced XML you've already
downloaded. Useful if you fetch/cache the OFAC feed yourself.

**Type:** `Effect.Effect<ReadonlyArray<string>, OfacParseError>` - Sorted, deduplicated Bitcoin addresses or a typed parse failure

### Errors

- `OfacTransportError` - The HTTP request could not be completed
- `OfacHttpStatusError` - OFAC returned a non-success status
- `OfacBodyError` - The response body could not be read
- `OfacParseError` - The response did not contain the expected Bitcoin data
- `OfacAccessDeniedError` - OFAC's AWS WAF served an anti-bot challenge instead of the feed. OFAC currently gates programmatic access this way; use the static export as a fallback when live fetching is blocked

### `ofacAddresses`

Static export of Bitcoin addresses (updated daily via GitHub Actions).

**Type:** `ReadonlyArray<string>` - Array of Bitcoin addresses

## Data Source

Data is fetched from the official OFAC Specially Designated Nationals (SDN) list:
`https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn_advanced.xml`

The static snapshot is automatically checked for updates every day at midnight UTC via GitHub Actions.

## Examples

### Simple Validation

```typescript
import { ofacAddresses } from "bitcoin-ofac-addresses/static";

function isAddressSanctioned(address: string): boolean {
  return ofacAddresses.includes(address);
}

console.log(isAddressSanctioned("12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h")); // true
console.log(isAddressSanctioned("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa")); // false
```

### Batch Validation

```typescript
import { Effect } from "effect";
import {
  getBitcoinAddresses,
  OfacHttpClientLive,
} from "bitcoin-ofac-addresses";

const validateAddresses = (addresses: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sanctionedAddresses = yield* getBitcoinAddresses();
    const sanctionedSet = new Set(sanctionedAddresses);

    return addresses.map((address) => ({
      address,
      isSanctioned: sanctionedSet.has(address),
    }));
  });

const results = await Effect.runPromise(
  validateAddresses([
    "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",
    "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  ]).pipe(Effect.provide(OfacHttpClientLive)),
);

console.log(results);
```

### Bun API Endpoint

```typescript
import { Effect } from "effect";
import {
  getBitcoinAddresses,
  OfacHttpClientLive,
} from "bitcoin-ofac-addresses";

Bun.serve({
  routes: {
    "/check/:address": async (req) => {
      const { address } = req.params;
      const sanctionedAddresses = await Effect.runPromise(
        getBitcoinAddresses().pipe(Effect.provide(OfacHttpClientLive)),
      );

      return Response.json({
        address,
        isSanctioned: sanctionedAddresses.includes(address),
      });
    },
  },
});
```

## Development

### Update Static Data

```bash
bun run update
```

### Build

```bash
bun run build
```

Produces the prebuilt ESM + declaration files in `dist/` that Node.js
consumers use. Run automatically during publishing.

### Run Tests

```bash
bun test

# include the live-network test (downloads the full SDN XML)
OFAC_LIVE_TEST=1 bun test
```

## How It Works

1. **Effect Mode**: Fetches the OFAC SDN XML through an injected service, parses XBT addresses, and returns typed failures
2. **Static Mode**: Imports a pre-generated JSON file containing the address list
3. **Auto-Updates**: GitHub Actions downloads the compressed SDN archive (a fraction of the raw XML size), extracts XBT addresses, and refreshes the static data daily. If OFAC's anti-bot gate blocks the advanced export, the updater falls back to OFAC's older SDN export, and failed runs are automatically retried later on a fresh runner

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or PR.

## Disclaimer

This package is provided as-is for informational purposes. While we strive for accuracy, users should verify critical compliance decisions with official OFAC sources. The authors are not responsible for any compliance violations resulting from use of this package.

## Links

- [OFAC Sanctions List Service](https://sanctionslist.ofac.treas.gov/Home/SdnList)
- [GitHub Repository](https://github.com/nhamilton1/bitcoin-ofac-addresses)
- [NPM Package](https://www.npmjs.com/package/bitcoin-ofac-addresses)
