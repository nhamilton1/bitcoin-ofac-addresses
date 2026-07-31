import { $ } from "bun";
import { Config, Effect, Option, Schema } from "effect";

const PACKAGE_NAME = "bitcoin-ofac-addresses";
const REGISTRY_URL = `https://registry.npmjs.org/${PACKAGE_NAME}/latest`;

const PackageMetadata = Schema.Struct({ version: Schema.String });

export class ScriptError extends Schema.TaggedErrorClass<ScriptError>()(
  "ScriptError",
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}

export interface ScriptConfig {
  readonly version: string;
  readonly bumpType: "major" | "minor" | "patch";
}

const runCommand = (operation: string, command: () => PromiseLike<unknown>) =>
  Effect.tryPromise({
    try: command,
    catch: (cause) =>
      new ScriptError({ operation, message: String(cause) }),
  });

export const getScriptConfig = Effect.fn("Script.getConfig")(function* () {
  const config = yield* Config.all({
    bumpType: Config.literals(
      ["major", "minor", "patch"],
      "BITCOIN_OFAC_BUMP",
    ).pipe(Config.withDefault("patch")),
    version: Config.string("BITCOIN_OFAC_VERSION").pipe(Config.option),
  });

  if (Option.isSome(config.version)) {
    return {
      version: config.version.value,
      bumpType: config.bumpType,
    } satisfies ScriptConfig;
  }

  const response = yield* Effect.tryPromise({
    try: (signal) => fetch(REGISTRY_URL, { signal }),
    catch: (cause) =>
      new ScriptError({
        operation: "fetch npm package metadata",
        message: String(cause),
      }),
  });

  let currentVersion = "0.0.0";
  if (response.status !== 404) {
    if (!response.ok) {
      return yield* new ScriptError({
        operation: "fetch npm package metadata",
        message: `${response.status} ${response.statusText}`,
      });
    }

    const json = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (cause) =>
        new ScriptError({
          operation: "read npm package metadata",
          message: String(cause),
        }),
    });
    const metadata = yield* Schema.decodeUnknownEffect(PackageMetadata)(json).pipe(
      Effect.mapError(
        (cause) =>
          new ScriptError({
            operation: "decode npm package metadata",
            message: String(cause),
          }),
      ),
    );
    currentVersion = metadata.version;
  }

  const [major = 0, minor = 0, patch = 0] = currentVersion
    .split(".")
    .map((part) => Number(part) || 0);
  const version =
    config.bumpType === "major"
      ? `${major + 1}.0.0`
      : config.bumpType === "minor"
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`;

  return { version, bumpType: config.bumpType } satisfies ScriptConfig;
});

export const commitAndTag = Effect.fn("Script.commitAndTag")(function* (
  version: string,
) {
  const tagName = `v${version}`;
  const commitMessage = `chore: release v${version}`;

  yield* runCommand(
    "configure git user name",
    () => $`git config user.name "GitHub Actions"`,
  );
  yield* runCommand(
    "configure git user email",
    () => $`git config user.email "actions@github.com"`,
  );

  const dirty = yield* Effect.tryPromise({
    try: () => $`git status --porcelain package.json`.text(),
    catch: (cause) =>
      new ScriptError({
        operation: "check package.json git status",
        message: String(cause),
      }),
  });

  if (dirty.trim()) {
    yield* runCommand("stage package.json", () => $`git add package.json`);
    yield* runCommand(
      "commit package.json",
      () => $`git commit -m ${commitMessage}`,
    );
  } else {
    yield* Effect.logInfo(
      "package.json is already committed at this version; skipping commit",
    );
  }

  yield* runCommand(
    "rebase release commit",
    () => $`git pull --rebase origin master`,
  );

  const tagResult = yield* Effect.tryPromise({
    try: () => $`git rev-parse -q --verify refs/tags/${tagName}`.nothrow(),
    catch: (cause) =>
      new ScriptError({
        operation: "check release tag",
        message: String(cause),
      }),
  });
  if (tagResult.exitCode !== 0) {
    yield* runCommand("create release tag", () => $`git tag ${tagName}`);
  } else {
    yield* Effect.logInfo("Release tag already exists; skipping tag", {
      tagName,
    });
  }

  yield* runCommand(
    "push release commit and tag",
    () => $`git push origin HEAD --tags`,
  );
  return tagName;
});

export const createRelease = Effect.fn("Script.createRelease")(function* (
  version: string,
  addressCount: number,
) {
  const tagName = `v${version}`;
  const releaseNotes = `## Release v${version}

### Summary
- Updated OFAC sanctioned Bitcoin addresses
- Total addresses: **${addressCount}**
- Data source: [OFAC SDN List](https://sanctionslist.ofac.treas.gov/Home/SdnList)

### Installation

\`\`\`bash
bun add bitcoin-ofac-addresses@${version}
\`\`\`

### Usage

\`\`\`typescript
import { ofacAddresses } from "bitcoin-ofac-addresses/static";
console.log(\`Loaded \${ofacAddresses.length} addresses\`);
\`\`\`
`;

  const existingRelease = yield* Effect.tryPromise({
    try: () => $`gh release view ${tagName}`.nothrow(),
    catch: (cause) =>
      new ScriptError({
        operation: "check GitHub release",
        message: String(cause),
      }),
  });
  if (existingRelease.exitCode === 0) {
    yield* Effect.logInfo("GitHub release already exists; skipping release", {
      tagName,
    });
    return tagName;
  }

  yield* runCommand(
    "create GitHub release",
    () =>
      $`gh release create ${tagName} --title ${`v${version}`} --notes ${releaseNotes}`,
  );
  return tagName;
});
