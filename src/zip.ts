// Internal updater helpers: fetch the compressed SDN archive and extract the
// advanced XML in-process (no unzip binary dependency). Not part of the
// package's public exports; used by script/update-addresses.ts.
import { inflateRawSync } from "node:zlib";
import { Effect } from "effect";
import {
  OfacAccessDeniedError,
  OfacBodyError,
  OfacHttpStatusError,
  OfacParseError,
  OfacTransportError,
  parseBitcoinAddresses,
  USER_AGENT,
} from "./index.ts";

const SDN_ZIP_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ADVANCED.ZIP";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

export const fetchSdnZip = Effect.fn("bitcoin-ofac-addresses.fetchSdnZip")(
  function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(SDN_ZIP_URL, {
          headers: { "User-Agent": USER_AGENT },
          signal,
        }),
      catch: (cause) =>
        new OfacTransportError({
          message: `Failed to fetch OFAC SDN archive: ${String(cause)}`,
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
        message: `Failed to fetch OFAC SDN archive: ${response.status} ${response.statusText}`,
      });
    }

    const buffer = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: (cause) =>
        new OfacBodyError({
          message: `Failed to read OFAC SDN archive: ${String(cause)}`,
        }),
    });
    return new Uint8Array(buffer);
  },
);

export const extractSdnXml = Effect.fn("bitcoin-ofac-addresses.extractSdnXml")(
  function* (zip: Uint8Array) {
    const fail = (detail: string) =>
      new OfacParseError({ message: `Invalid OFAC SDN archive: ${detail}` });

    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    // Locate the end of central directory record (searched from the tail,
    // allowing for the maximum 64 KiB trailing comment).
    let eocd = -1;
    for (
      let i = zip.length - 22;
      i >= Math.max(0, zip.length - 22 - 65535);
      i--
    ) {
      if (view.getUint32(i, true) === EOCD_SIGNATURE) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) {
      return yield* fail("not a ZIP file");
    }

    const entryCount = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);

    for (let entry = 0; entry < entryCount; entry++) {
      if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
        return yield* fail("corrupt central directory");
      }
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = new TextDecoder().decode(
        zip.subarray(offset + 46, offset + 46 + nameLength),
      );

      if (name.toUpperCase().endsWith(".XML")) {
        if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
          return yield* fail("corrupt local header");
        }
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const data = zip.subarray(dataStart, dataStart + compressedSize);

        try {
          if (method === 8) {
            return inflateRawSync(data).toString("utf8");
          }
          if (method === 0) {
            return new TextDecoder("utf-8").decode(data);
          }
          return yield* fail(`unsupported compression method ${method}`);
        } catch (cause) {
          return yield* fail(`could not decompress ${name}: ${String(cause)}`);
        }
      }

      offset += 46 + nameLength + extraLength + commentLength;
    }

    return yield* fail("no XML entry found");
  },
);

export const getBitcoinAddressesFromZip = Effect.fn(
  "bitcoin-ofac-addresses.getBitcoinAddressesFromZip",
)(function* () {
  const zip = yield* fetchSdnZip();
  const xml = yield* extractSdnXml(zip);
  return yield* parseBitcoinAddresses(xml);
});
