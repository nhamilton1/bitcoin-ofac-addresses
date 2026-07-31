import { Effect, Schedule } from "effect";
import { OfacAccessDeniedError, OfacHttpStatusError } from "../src/index.ts";
import { getBitcoinAddressesFromFallback } from "../src/fallback.ts";
import { getBitcoinAddressesFromZip } from "../src/zip.ts";
import { ScriptError } from "./script.ts";

const outputPath = `${import.meta.dir}/../src/data/addresses.json`;

// OFAC's edge occasionally returns transient 5xx responses to CI runners,
// so retry those with exponential backoff (60s, 120s, 240s, jittered).
// Permanent anti-bot rejections (WAF challenge, 4xx other than 429) fail fast.
const retryPolicy = Schedule.max([
  Schedule.exponential("60 seconds", 2),
  Schedule.recurs(3),
]).pipe(Schedule.jittered);

const isTransient = (error: unknown) =>
  !(error instanceof OfacAccessDeniedError) &&
  !(
    error instanceof OfacHttpStatusError &&
    error.status !== 429 &&
    error.status < 500
  );

// OFAC's WAF intermittently challenges the advanced exports per egress IP.
// When that happens, fall back to the older SDN export, which is served from
// the same official source under a different rule bucket.
const fetchFromOfac = getBitcoinAddressesFromZip().pipe(
  Effect.catch((error) => {
    const blocked =
      error instanceof OfacAccessDeniedError ||
      (error instanceof OfacHttpStatusError && error.status === 403);
    return blocked
      ? Effect.gen(function* () {
          yield* Effect.logWarning(
            "Advanced export blocked by WAF; falling back to the older SDN export",
            { error: error.message },
          );
          return yield* getBitcoinAddressesFromFallback();
        })
      : Effect.fail(error);
  }),
);

const fetchAddresses = fetchFromOfac.pipe(
  Effect.tapError((error) =>
    isTransient(error)
      ? Effect.logWarning("OFAC fetch attempt failed; retrying per schedule", {
          error: error.message,
        })
      : Effect.logError("OFAC fetch failed permanently; not retrying", {
          error: error.message,
        }),
  ),
  Effect.retry({ schedule: retryPolicy, while: isTransient }),
);

const program = Effect.gen(function* () {
  yield* Effect.logInfo("Fetching OFAC sanctions list");
  const addresses = yield* fetchAddresses;
  yield* Effect.logInfo("Fetched OFAC sanctions list", {
    addressCount: addresses.length,
  });
  if (addresses.length < 100) {
    return yield* new ScriptError({
      operation: "validate address snapshot",
      message: `Expected at least 100 addresses, received ${addresses.length}`,
    });
  }

  yield* Effect.tryPromise({
    try: () => Bun.write(outputPath, `${JSON.stringify(addresses, null, 2)}\n`),
    catch: (cause) =>
      new ScriptError({
        operation: "write address snapshot",
        message: String(cause),
      }),
  });
  yield* Effect.logInfo("Wrote OFAC address snapshot", { outputPath });
});

await Effect.runPromise(program);
