import { describe, expect, it } from "vitest";
import { durationToMs } from "./duration.js";

describe("durationToMs", () => {
  it.each([
    ["15m", 900_000],
    ["7d", 604_800_000],
    ["2h", 7_200_000],
    ["30s", 30_000],
  ])("parses %s", (value, expected) => {
    expect(durationToMs(value)).toBe(expected);
  });

  it.each(["0m", "-1h", "1w", "15", "1.5h", "999999999999999999d"])(
    "rejects unsupported duration %s",
    (value) => {
      expect(() => durationToMs(value)).toThrow();
    },
  );
});
