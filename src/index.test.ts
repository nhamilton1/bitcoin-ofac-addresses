import { describe, test, expect, afterEach } from "bun:test";
import { getBitcoinAddresses, parseBitcoinAddresses } from "./index";
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

describe("parseBitcoinAddresses", () => {
  test("extracts only XBT addresses, deduplicated, trimmed, and sorted", () => {
    expect(parseBitcoinAddresses(FIXTURE_XML)).toEqual([
      "1BitcoinAddressAAA",
      "1BitcoinAddressBBB",
    ]);
  });

  test("never captures markup, even with self-closing or empty details", () => {
    const addresses = parseBitcoinAddresses(FIXTURE_XML);
    expect(addresses.every((addr) => ADDRESS_FORMAT.test(addr))).toBe(true);
  });

  test("throws when the Bitcoin feature type is missing", () => {
    expect(() => parseBitcoinAddresses("<Sanctions></Sanctions>")).toThrow(
      "Could not find Bitcoin feature type",
    );
  });
});

describe("getBitcoinAddresses error handling", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("throws a descriptive error on a non-OK response", async () => {
    globalThis.fetch = (async () =>
      new Response("Service Unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      })) as unknown as typeof fetch;

    await expect(getBitcoinAddresses()).rejects.toThrow(
      "Failed to fetch OFAC SDN list: 503",
    );
  });
});

describe("ofacAddresses (static)", () => {
  test("should export Bitcoin addresses", () => {
    expect(ofacAddresses).toBeInstanceOf(Array);
    expect(ofacAddresses.length).toBeGreaterThan(0);
  });

  test("should contain only plausible Bitcoin address strings", () => {
    expect(ofacAddresses.every((addr) => ADDRESS_FORMAT.test(addr))).toBe(
      true,
    );
  });

  test("should contain known sanctioned address", () => {
    expect(ofacAddresses).toContain("12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h");
  });

  test("should have a plausible count", () => {
    expect(ofacAddresses.length).toBeGreaterThan(100);
    expect(ofacAddresses.length).toBeLessThan(5000);
  });
});

// opt-in, downloads the full SDN XML: OFAC_LIVE_TEST=1 bun test
describe("getBitcoinAddresses (async, live network)", () => {
  test.skipIf(!process.env.OFAC_LIVE_TEST)(
    "should fetch Bitcoin addresses",
    async () => {
      const addresses = await getBitcoinAddresses();

      expect(addresses).toBeInstanceOf(Array);
      expect(addresses.length).toBeGreaterThan(100);
      expect(addresses.length).toBeLessThan(5000);
      expect(addresses.every((addr) => ADDRESS_FORMAT.test(addr))).toBe(true);
    },
    60000,
  );
});
