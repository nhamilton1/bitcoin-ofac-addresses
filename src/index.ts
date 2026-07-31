import { Context, Effect, Layer, Schema } from "effect";

const SDN_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn_advanced.xml";

// The Mozilla-compatible prefix is required: OFAC's AWS WAF hard-blocks
// (403) user agents without it, while this form receives the standard
// anti-bot challenge path that may succeed when the gate is relaxed.
export const USER_AGENT =
  "Mozilla/5.0 (compatible; bitcoin-ofac-addresses/1.0; +https://github.com/nhamilton1/bitcoin-ofac-addresses)";

export class OfacTransportError extends Schema.TaggedErrorClass<OfacTransportError>()(
  "OfacTransportError",
  { message: Schema.String },
) {}

export class OfacHttpStatusError extends Schema.TaggedErrorClass<OfacHttpStatusError>()(
  "OfacHttpStatusError",
  {
    status: Schema.Number,
    statusText: Schema.String,
    message: Schema.String,
  },
) {}

export class OfacBodyError extends Schema.TaggedErrorClass<OfacBodyError>()(
  "OfacBodyError",
  { message: Schema.String },
) {}

export class OfacAccessDeniedError extends Schema.TaggedErrorClass<OfacAccessDeniedError>()(
  "OfacAccessDeniedError",
  { message: Schema.String },
) {}

export class OfacParseError extends Schema.TaggedErrorClass<OfacParseError>()(
  "OfacParseError",
  { message: Schema.String },
) {}

export interface OfacHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly body: string;
}

export interface OfacHttpClientShape {
  readonly request: (
    url: string,
    init: RequestInit,
  ) => Effect.Effect<
    OfacHttpResponse,
    OfacTransportError | OfacBodyError | OfacAccessDeniedError
  >;
}

export class OfacHttpClient extends Context.Service<
  OfacHttpClient,
  OfacHttpClientShape
>()("bitcoin-ofac-addresses/OfacHttpClient") {}

export const OfacHttpClientLive = Layer.succeed(OfacHttpClient, {
  request: Effect.fn("OfacHttpClient.request")((url, init) =>
    Effect.tryPromise({
      try: async (signal) => {
        let response: Response;
        try {
          response = await fetch(url, { ...init, signal });
        } catch (cause) {
          throw new OfacTransportError({
            message: `Failed to fetch OFAC SDN list: ${String(cause)}`,
          });
        }

        // AWS WAF answers bots with a 202 JavaScript challenge instead of the
        // feed. Surface that honestly rather than misreading it as parseable.
        if (response.headers.get("x-amzn-waf-action") === "challenge") {
          throw new OfacAccessDeniedError({
            message:
              "OFAC blocked the request with an AWS WAF anti-bot challenge; programmatic access is currently unavailable",
          });
        }

        let body = "";
        if (response.ok) {
          try {
            body = await response.text();
          } catch (cause) {
            throw new OfacBodyError({
              message: `Failed to read OFAC SDN list: ${String(cause)}`,
            });
          }
        }

        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          body,
        };
      },
      catch: (cause) => {
        if (
          cause instanceof OfacTransportError ||
          cause instanceof OfacBodyError ||
          cause instanceof OfacAccessDeniedError
        ) {
          return cause;
        }
        return new OfacTransportError({
          message: `Failed to fetch OFAC SDN list: ${String(cause)}`,
        });
      },
    }),
  ),
});

export const parseBitcoinAddresses = Effect.fn(
  "bitcoin-ofac-addresses.parseBitcoinAddresses",
)(function* (xml: string) {
  const featureTypeMatch = xml.match(
    /<FeatureType ID="(\d+)"[^>]*>Digital Currency Address - XBT<\/FeatureType>/,
  );
  if (!featureTypeMatch) {
    return yield* new OfacParseError({
      message: "Could not find Bitcoin feature type",
    });
  }
  const featureTypeId = featureTypeMatch[1];

  const addresses = new Set<string>();
  const parts = xml.split(`FeatureTypeID="${featureTypeId}"`);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    const nextFeatureEnd = part.indexOf("</Feature>");
    if (nextFeatureEnd === -1) continue;

    const featureSection = part.slice(0, nextFeatureEnd);
    // [^<] prevents a self-closing VersionDetail from swallowing markup.
    const versionMatches = featureSection.matchAll(
      /<VersionDetail[^>]*>([^<]*)<\/VersionDetail>/g,
    );
    for (const versionMatch of versionMatches) {
      const address = versionMatch[1]?.trim();
      if (address) {
        addresses.add(address);
        break;
      }
    }
  }

  if (addresses.size === 0) {
    return yield* new OfacParseError({
      message: "Could not find any Bitcoin addresses",
    });
  }

  return Array.from(addresses).sort() as ReadonlyArray<string>;
});

export const getBitcoinAddresses = Effect.fn(
  "bitcoin-ofac-addresses.getBitcoinAddresses",
)(function* () {
  const http = yield* OfacHttpClient;
  const response = yield* http.request(SDN_URL, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!response.ok) {
    return yield* new OfacHttpStatusError({
      status: response.status,
      statusText: response.statusText,
      message: `Failed to fetch OFAC SDN list: ${response.status} ${response.statusText}`,
    });
  }

  return yield* parseBitcoinAddresses(response.body);
});
