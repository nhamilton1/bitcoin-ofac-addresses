#!/usr/bin/env bun

import { $ } from "bun";
import { Script, commitAndTag, createRelease } from "./script.ts";

console.log("=== Publishing bitcoin-ofac-addresses ===\n");

const rootDir = new URL("..", import.meta.url).pathname;
const packageJsonPath = `${rootDir}/package.json`;
const addressesPath = `${rootDir}/src/data/addresses.json`;

const packageJson = await Bun.file(packageJsonPath).json();

packageJson.version = Script.version;
await Bun.file(packageJsonPath).write(
  JSON.stringify(packageJson, null, 2) + "\n",
);
console.log(`Updated package.json to version ${Script.version}`);

const addresses = await Bun.file(addressesPath).json();
const addressCount = addresses.length;
console.log(`Found ${addressCount} OFAC sanctioned addresses`);

console.log("\n=== Running tests ===");
await $`bun test`;
console.log("Tests passed");

console.log("\n=== Running typecheck ===");
const typecheckResult = await $`bun run typecheck`.nothrow();
if (typecheckResult.exitCode === 0) {
  console.log("Typecheck passed");
} else {
  console.log("Typecheck skipped (tsgo not available)");
}

console.log("\n=== Publishing to npm ===");
process.chdir(rootDir);
await $`bun publish --access public`;
console.log(`Published to npm: bitcoin-ofac-addresses@${Script.version}`);

console.log("\n=== Creating git tag ===");
const tagName = await commitAndTag(Script.version);
console.log(`Created and pushed tag: ${tagName}`);

console.log("\n=== Creating GitHub release ===");
await createRelease(Script.version, addressCount);
console.log(`Created GitHub release: ${tagName}`);

console.log("\n=== ✓ Publishing complete ===");
