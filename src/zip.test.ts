import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { Effect } from "effect";
import { OfacParseError, parseBitcoinAddresses } from "./index";
import { extractSdnXml } from "./zip";

const FIXTURE_XML = `<?xml version="1.0" encoding="utf-8"?>
<Sanctions>
  <ReferenceValueSets>
    <FeatureTypeValues>
      <FeatureType ID="344">Digital Currency Address - XBT</FeatureType>
    </FeatureTypeValues>
  </ReferenceValueSets>
  <DistinctParties>
    <Feature ID="1" FeatureTypeID="344">
      <FeatureVersion>
        <VersionDetail DetailTypeID="1432">1BitcoinAddressAAA</VersionDetail>
      </FeatureVersion>
    </Feature>
  </DistinctParties>
</Sanctions>`;

const buildZip = (name: string, content: string, compress = true) => {
  const nameBytes = new TextEncoder().encode(name);
  const raw = new TextEncoder().encode(content);
  const data = new Uint8Array(
    compress ? deflateRawSync(raw) : raw,
  );
  const method = compress ? 8 : 0;

  const local = new Uint8Array(30 + nameBytes.length + data.length);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, 0x04034b50, true);
  localView.setUint16(4, 20, true);
  localView.setUint16(8, method, true);
  localView.setUint32(18, data.length, true);
  localView.setUint32(22, raw.length, true);
  localView.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.length);

  const central = new Uint8Array(46 + nameBytes.length);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, 0x02014b50, true);
  centralView.setUint16(10, method, true);
  centralView.setUint32(20, data.length, true);
  centralView.setUint32(24, raw.length, true);
  centralView.setUint16(28, nameBytes.length, true);
  central.set(nameBytes, 46);

  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, 1, true);
  eocdView.setUint16(10, 1, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, local.length, true);

  const zip = new Uint8Array(local.length + central.length + eocd.length);
  zip.set(local, 0);
  zip.set(central, local.length);
  zip.set(eocd, local.length + central.length);
  return zip;
};

describe("extractSdnXml", () => {
  test("extracts a deflated XML entry", () => {
    const zip = buildZip("SDN_ADVANCED.XML", FIXTURE_XML);
    expect(Effect.runSync(extractSdnXml(zip))).toBe(FIXTURE_XML);
  });

  test("extracts a stored (uncompressed) XML entry", () => {
    const zip = buildZip("SDN_ADVANCED.XML", FIXTURE_XML, false);
    expect(Effect.runSync(extractSdnXml(zip))).toBe(FIXTURE_XML);
  });

  test("returns a typed error for non-ZIP data", () => {
    const error = Effect.runSync(
      extractSdnXml(new TextEncoder().encode("not a zip file at all")).pipe(
        Effect.flip,
      ),
    );
    expect(error).toBeInstanceOf(OfacParseError);
    expect(error.message).toContain("not a ZIP file");
  });

  test("returns a typed error when no XML entry exists", () => {
    const zip = buildZip("readme.txt", "hello");
    const error = Effect.runSync(extractSdnXml(zip).pipe(Effect.flip));
    expect(error).toBeInstanceOf(OfacParseError);
    expect(error.message).toContain("no XML entry found");
  });

  test("extracted XML feeds the address parser", () => {
    const zip = buildZip("SDN_ADVANCED.XML", FIXTURE_XML);
    const program = extractSdnXml(zip).pipe(
      Effect.flatMap(parseBitcoinAddresses),
    );
    expect(Effect.runSync(program)).toEqual(["1BitcoinAddressAAA"]);
  });
});
