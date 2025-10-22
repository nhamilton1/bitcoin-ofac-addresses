import { describe, test, expect } from "bun:test";
import { getBitcoinAddresses } from "./index";
import { bitcoinAddresses } from "./static";

describe("bitcoinAddresses (static)", () => {
  test("should export Bitcoin addresses", () => {
    expect(bitcoinAddresses).toBeInstanceOf(Array);
    expect(bitcoinAddresses.length).toBeGreaterThan(0);
  });

  test("should contain valid Bitcoin addresses", () => {
    expect(bitcoinAddresses.every((addr) => typeof addr === "string")).toBe(
      true,
    );
    expect(bitcoinAddresses.every((addr) => addr.length > 0)).toBe(true);
  });

  test("should contain known sanctioned address", () => {
    expect(bitcoinAddresses).toContain("12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h");
  });

  test("should have expected count", () => {
    expect(bitcoinAddresses.length).toBeGreaterThan(400);
    expect(bitcoinAddresses.length).toBeLessThan(1000);
  });
});

describe("getBitcoinAddresses (async)", () => {
  test("should fetch Bitcoin addresses", async () => {
    const addresses = await getBitcoinAddresses();

    expect(addresses).toBeInstanceOf(Array);
    expect(addresses.length).toBeGreaterThan(400);
    expect(addresses.every((addr) => typeof addr === "string")).toBe(true);
  }, 60000);
});
