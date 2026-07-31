// Internal updater fallback: OFAC's older SDN XML export. OFAC's WAF
// intermittently challenges the advanced exports (sdn_advanced.xml/.zip),
// while this export path keeps redirecting to S3 and serving fresh daily
// data. Same official source, same addresses, older schema:
//   <id><idType>Digital Currency Address - XBT</idType><idNumber>…</idNumber></id>
// Not part of the package's public exports; used by script/update-addresses.ts.
import { Effect } from "effect";
import {
  OfacAccessDeniedError,
  OfacBodyError,
  OfacHttpStatusError,
  OfacParseError,
  OfacTransportError,
  USER_AGENT,
} from "./index.ts";

const FALLBACK_SDN_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml";

export const parseFallbackBitcoinAddresses = Effect.fn(
  "bitcoin-ofac-addresses.parseFallbackBitcoinAddresses",
)(function* (xml: string) {
  const addresses = new Set<string>();
  const matches = xml.matchAll(
    /<idType>Digital Currency Address - XBT<\/idType>\s*<idNumber>([^<]*)<\/idNumber>/g,
  );
  for (const match of matches) {
    const address = match[1]?.trim();
    if (address) addresses.add(address);
  }

  if (addresses.size === 0) {
    return yield* new OfacParseError({
      message: "Could not find any Bitcoin addresses in the fallback SDN export",
    });
  }
  return Array.from(addresses).sort() as ReadonlyArray<string>;
});

export const fetchFallbackSdnXml = Effect.fn(
  "bitcoin-ofac-addresses.fetchFallbackSdnXml",
)(function* () {
  const response = yield* Effect.tryPromise({
    try: (signal) =>
      fetch(FALLBACK_SDN_URL, {
        headers: { "User-Agent": USER_AGENT },
        signal,
      }),
    catch: (cause) =>
      new OfacTransportError({
        message: `Failed to fetch fallback OFAC SDN list: ${String(cause)}`,
      }),
  });

  if (response.headers.get("x-amzn-waf-action") === "challenge") {
    return yield* new OfacAccessDeniedError({
      message:
        "OFAC blocked the request with an AWS WAF anti-bot challenge; programmatic access is currently unavailable",
    });
  }

  if (!response.ok) {
    return yield* new OfacHttpStatusError({
      status: response.status,
      statusText: response.statusText,
      message: `Failed to fetch fallback OFAC SDN list: ${response.status} ${response.statusText}`,
    });
  }

  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) =>
      new OfacBodyError({
        message: `Failed to read fallback OFAC SDN list: ${String(cause)}`,
      }),
  });
});

export const getBitcoinAddressesFromFallback = Effect.fn(
  "bitcoin-ofac-addresses.getBitcoinAddressesFromFallback",
)(function* () {
  const xml = yield* fetchFallbackSdnXml();
  return yield* parseFallbackBitcoinAddresses(xml);
});
