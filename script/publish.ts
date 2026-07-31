#!/usr/bin/env bun

import { $ } from "bun";
import { Effect, Schema } from "effect";
import {
  commitAndTag,
  createRelease,
  getScriptConfig,
  ScriptError,
} from "./script.ts";

const rootDir = `${import.meta.dir}/..`;
const packageJsonPath = `${rootDir}/package.json`;
const addressesPath = `${rootDir}/src/data/addresses.json`;
const JsonObject = Schema.Record(Schema.String, Schema.Unknown);
const AddressList = Schema.Array(Schema.String);

const readJson = (path: string) =>
  Effect.tryPromise({
    try: () => Bun.file(path).json(),
    catch: (cause) =>
      new ScriptError({
        operation: `read ${path}`,
        message: String(cause),
      }),
  });

const runCommand = (operation: string, command: () => PromiseLike<unknown>) =>
  Effect.tryPromise({
    try: command,
    catch: (cause) =>
      new ScriptError({ operation, message: String(cause) }),
  });

const program = Effect.gen(function* () {
  yield* Effect.logInfo("Publishing bitcoin-ofac-addresses");
  const config = yield* getScriptConfig();
  yield* Effect.logInfo("Loaded release configuration", config);

  const packageJson = yield* readJson(packageJsonPath).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(JsonObject)(value).pipe(
        Effect.mapError(
          (cause) =>
            new ScriptError({
              operation: "decode package.json",
              message: String(cause),
            }),
        ),
      ),
    ),
  );
  const updatedPackageJson = { ...packageJson, version: config.version };
  yield* Effect.tryPromise({
    try: () =>
      Bun.write(
        packageJsonPath,
        `${JSON.stringify(updatedPackageJson, null, 2)}\n`,
      ),
    catch: (cause) =>
      new ScriptError({
        operation: "update package.json version",
        message: String(cause),
      }),
  });
  yield* Effect.logInfo("Updated package.json", { version: config.version });

  const addresses = yield* readJson(addressesPath).pipe(
    Effect.flatMap((value) =>
      Schema.decodeUnknownEffect(AddressList)(value).pipe(
        Effect.mapError(
          (cause) =>
            new ScriptError({
              operation: "decode addresses",
              message: String(cause),
            }),
        ),
      ),
    ),
  );
  yield* Effect.logInfo("Loaded OFAC address snapshot", {
    addressCount: addresses.length,
  });

  yield* runCommand("run tests", () => $`bun test`);
  yield* runCommand("run typecheck", () => $`bun run typecheck`);
  yield* runCommand("build package", () => $`bun run build`);

  // Tag first so a failed publish can be retried without another version bump.
  const tagName = yield* commitAndTag(config.version);
  yield* Effect.logInfo("Created and pushed release tag", { tagName });

  yield* createRelease(config.version, addresses.length);
  yield* Effect.logInfo("Created GitHub release", { tagName });

  yield* runCommand(
    "publish npm package",
    () => $`bun publish --access public`.cwd(rootDir),
  );
  yield* Effect.logInfo("Published npm package", {
    package: `bitcoin-ofac-addresses@${config.version}`,
  });
});

await Effect.runPromise(program);
