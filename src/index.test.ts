import { describe, test, expect } from "bun:test";
import { getBitcoinAddresses } from "./index";
import { ofacAddresses } from "./static";

describe("ofacAddresses (static)", () => {
  test("should export Bitcoin addresses", () => {
    expect(ofacAddresses).toBeInstanceOf(Array);
    expect(ofacAddresses.length).toBeGreaterThan(0);
  });

  test("should contain valid Bitcoin addresses", () => {
    expect(ofacAddresses.every((addr) => typeof addr === "string")).toBe(
      true,
    );
    expect(ofacAddresses.every((addr) => addr.length > 0)).toBe(true);
  });

  test("should contain known sanctioned address", () => {
    expect(ofacAddresses).toContain("12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h");
  });

  test("should have expected count", () => {
    expect(ofacAddresses.length).toBeGreaterThan(400);
    expect(ofacAddresses.length).toBeLessThan(1000);
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
