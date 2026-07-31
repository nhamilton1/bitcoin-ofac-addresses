import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { OfacParseError } from "./index";
import { parseFallbackBitcoinAddresses } from "./fallback";

const FALLBACK_FIXTURE_XML = `<?xml version="1.0" standalone="yes"?>
<sdnList>
  <publshInformation>
    <Publish_Date>07/30/2026</Publish_Date>
  </publshInformation>
  <sdnEntry>
    <uid>17760</uid>
    <idList>
      <id>
        <uid>131723</uid>
        <idType>Digital Currency Address - XBT</idType>
        <idNumber>12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h</idNumber>
      </id>
      <id>
        <uid>131724</uid>
        <idType>Digital Currency Address - ETH</idType>
        <idNumber>0xEthAddressIgnored</idNumber>
      </id>
      <id>
        <uid>131725</uid>
        <idType>Digital Currency Address - XBT</idType>
        <idNumber>
          1LdNcdQ83Yxs6JtSvDtQgrznPdBYCMfhFH
        </idNumber>
      </id>
      <id>
        <uid>131726</uid>
        <idType>Digital Currency Address - XBT</idType>
        <idNumber>12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h</idNumber>
      </id>
    </idList>
  </sdnEntry>
</sdnList>`;

describe("parseFallbackBitcoinAddresses", () => {
  test("extracts only XBT addresses, deduplicated, trimmed, and sorted", () => {
    expect(
      Effect.runSync(parseFallbackBitcoinAddresses(FALLBACK_FIXTURE_XML)),
    ).toEqual([
      "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",
      "1LdNcdQ83Yxs6JtSvDtQgrznPdBYCMfhFH",
    ]);
  });

  test("returns a typed error when no XBT addresses are present", () => {
    const error = Effect.runSync(
      parseFallbackBitcoinAddresses("<sdnList></sdnList>").pipe(Effect.flip),
    );
    expect(error).toBeInstanceOf(OfacParseError);
    expect(error.message).toContain("fallback SDN export");
  });
});
