import { describe, expect, test } from "bun:test";
import { Effect, Layer, Result } from "effect";
import {
  getBitcoinAddresses,
  OfacBodyError,
  OfacHttpClient,
  OfacHttpStatusError,
  OfacParseError,
  OfacTransportError,
  parseBitcoinAddresses,
} from "./index";
import { ofacAddresses } from "./static";

const ADDRESS_FORMAT = /^[a-zA-Z0-9]+$/;

const FIXTURE_XML = `<?xml version="1.0" encoding="utf-8"?>
<Sanctions>
  <ReferenceValueSets>
    <FeatureTypeValues>
      <FeatureType ID="8">Website</FeatureType>
      <FeatureType ID="344">Digital Currency Address - XBT</FeatureType>
      <FeatureType ID="345">Digital Currency Address - ETH</FeatureType>
    </FeatureTypeValues>
  </ReferenceValueSets>
  <DistinctParties>
    <Feature ID="1" FeatureTypeID="344">
      <FeatureVersion>
        <VersionDetail DetailTypeID="1432">1BitcoinAddressBBB</VersionDetail>
      </FeatureVersion>
    </Feature>
    <Feature ID="2" FeatureTypeID="345">
      <FeatureVersion>
        <VersionDetail DetailTypeID="1432">0xEthAddressIgnored</VersionDetail>
      </FeatureVersion>
    </Feature>
    <Feature ID="3" FeatureTypeID="344">
      <FeatureVersion>
        <VersionDetail DetailTypeID="1430" DetailReferenceID="91" />
        <VersionDetail DetailTypeID="1431"></VersionDetail>
        <VersionDetail DetailTypeID="1432">
          1BitcoinAddressAAA
        </VersionDetail>
      </FeatureVersion>
    </Feature>
    <Feature ID="4" FeatureTypeID="344">
      <FeatureVersion>
        <VersionDetail DetailTypeID="1432">1BitcoinAddressBBB</VersionDetail>
      </FeatureVersion>
    </Feature>
  </DistinctParties>
</Sanctions>`;

const responseLayer = (response: {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly body: string;
}) =>
  Layer.succeed(OfacHttpClient, {
    request: () => Effect.succeed(response),
  });

const successfulResponse = (body: string) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  body,
});

describe("parseBitcoinAddresses", () => {
  test("extracts only XBT addresses, deduplicated, trimmed, and sorted", () => {
    expect(Effect.runSync(parseBitcoinAddresses(FIXTURE_XML))).toEqual([
      "1BitcoinAddressAAA",
      "1BitcoinAddressBBB",
    ]);
  });

  test("never captures markup, even with self-closing or empty details", () => {
    const addresses = Effect.runSync(parseBitcoinAddresses(FIXTURE_XML));
    expect(addresses.every((address) => ADDRESS_FORMAT.test(address))).toBe(true);
  });

  test("returns a typed error when the Bitcoin feature type is missing", () => {
    const error = Effect.runSync(
      parseBitcoinAddresses("<Sanctions></Sanctions>").pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(OfacParseError);
    expect(error.message).toBe("Could not find Bitcoin feature type");
  });

  test("returns a typed error when no Bitcoin addresses are present", () => {
    const error = Effect.runSync(
      parseBitcoinAddresses(
        '<FeatureType ID="344">Digital Currency Address - XBT</FeatureType>',
      ).pipe(Effect.flip),
    );

    expect(error).toBeInstanceOf(OfacParseError);
    expect(error.message).toBe("Could not find any Bitcoin addresses");
  });
});

describe("getBitcoinAddresses", () => {
  test("uses an injected HTTP service", async () => {
    const addresses = await Effect.runPromise(
      getBitcoinAddresses().pipe(
        Effect.provide(responseLayer(successfulResponse(FIXTURE_XML))),
      ),
    );

    expect(addresses).toEqual([
      "1BitcoinAddressAAA",
      "1BitcoinAddressBBB",
    ]);
  });

  test("returns a typed error on a non-OK response", async () => {
    const error = await Effect.runPromise(
      getBitcoinAddresses().pipe(
        Effect.provide(
          responseLayer(
            {
              ok: false,
              status: 503,
              statusText: "Service Unavailable",
              body: "",
            },
          ),
        ),
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(OfacHttpStatusError);
    if (!(error instanceof OfacHttpStatusError)) throw error;
    expect(error.status).toBe(503);
  });

  test("preserves a typed transport failure from the HTTP service", async () => {
    const layer = Layer.succeed(OfacHttpClient, {
      request: () =>
        Effect.fail(
          new OfacTransportError({ message: "The OFAC service is unavailable" }),
        ),
    });
    const error = await Effect.runPromise(
      getBitcoinAddresses().pipe(Effect.provide(layer), Effect.flip),
    );

    expect(error).toBeInstanceOf(OfacTransportError);
  });

  test("returns a typed error when the response body cannot be read", async () => {
    const layer = Layer.succeed(OfacHttpClient, {
      request: () =>
        Effect.fail(
          new OfacBodyError({ message: "Failed to read the response body" }),
        ),
    });
    const error = await Effect.runPromise(
      getBitcoinAddresses().pipe(
        Effect.provide(layer),
        Effect.flip,
      ),
    );

    expect(error).toBeInstanceOf(OfacBodyError);
  });
});

describe("ofacAddresses (static)", () => {
  test("exports Bitcoin addresses", () => {
    expect(ofacAddresses).toBeInstanceOf(Array);
    expect(ofacAddresses.length).toBeGreaterThan(0);
  });

  test("contains only plausible Bitcoin address strings", () => {
    expect(ofacAddresses.every((address) => ADDRESS_FORMAT.test(address))).toBe(
      true,
    );
  });

  test("contains a known sanctioned address", () => {
    expect(ofacAddresses).toContain("12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h");
  });

  test("has a plausible count", () => {
    expect(ofacAddresses.length).toBeGreaterThan(100);
    expect(ofacAddresses.length).toBeLessThan(5000);
  });
});

// Opt in because this downloads the full SDN XML: OFAC_LIVE_TEST=1 bun test.
// OFAC's AWS WAF currently gates the feed behind an anti-bot challenge, so
// access-denied outcomes skip the assertions instead of failing the suite.
describe("getBitcoinAddresses (live network)", () => {
  test.skipIf(!process.env.OFAC_LIVE_TEST)(
    "fetches Bitcoin addresses",
    async () => {
      const { OfacAccessDeniedError, OfacHttpClientLive, OfacHttpStatusError } =
        await import("./index");
      const result = await Effect.runPromise(
        getBitcoinAddresses().pipe(
          Effect.provide(OfacHttpClientLive),
          Effect.result,
        ),
      );

      if (Result.isFailure(result)) {
        const blocked =
          result.failure instanceof OfacAccessDeniedError ||
          (result.failure instanceof OfacHttpStatusError &&
            result.failure.status === 403);
        if (blocked) {
          console.warn(
            `Skipping live assertions: OFAC is blocking programmatic access (${result.failure.message})`,
          );
          return;
        }
        throw result.failure;
      }

      const addresses = result.success;
      expect(addresses.length).toBeGreaterThan(100);
      expect(addresses.length).toBeLessThan(5000);
      expect(addresses.every((address) => ADDRESS_FORMAT.test(address))).toBe(
        true,
      );
    },
    60000,
  );
});
