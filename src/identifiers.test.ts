import { describe, expect, it } from "vitest";
import { captureIdentifier, nextIdentifier } from "./identifiers";
describe("one shared capture identifier sequence", () => {
  for (const [input, next] of [
    ["IN_PH_001", "IN_PH_002"],
    ["IN_PH_009", "IN_PH_010"],
    ["FENCE-099", "FENCE-100"],
    ["A007", "A008"],
    ["001", "002"],
    ["٠٠٩", "٠١٠"],
    ["A۰۰۷", "A۰۰۸"],
    ["SITE_02_PH_009", "SITE_02_PH_010"],
    ["  SITE 009 West  ", "  SITE 010 West  "],
    ["999", "1000"],
    ["P0099-Z", "P0100-Z"],
    ["900719925474099999", "900719925474100000"],
  ]) {
    it(`${input} → ${next}`, () => {
      expect(captureIdentifier(input)).toBe(input);
      expect(nextIdentifier(input)).toBe(next);
    });
  }
  it("assigns the alphabetic first record 001, and proposes 002 only after that record is saved", () => {
    expect(captureIdentifier("FENCE")).toBe("FENCE001");
    expect(nextIdentifier(captureIdentifier("FENCE"))).toBe("FENCE002");
    expect(captureIdentifier("Fence West ")).toBe("Fence West 001");
    expect(captureIdentifier("سياج")).toBe("سياج001");
  });
  it("does not invent a sequence for the existing empty-ID capture mode", () => {
    expect(captureIdentifier("")).toBe("");
    expect(nextIdentifier("")).toBe("");
    expect(captureIdentifier("  ")).toBe("  ");
  });
});
