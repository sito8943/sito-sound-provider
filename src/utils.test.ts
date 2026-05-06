import { describe, expect, it } from "vitest";
import { getInitialValue } from "./utils";

describe("getInitialValue", () => {
  it("returns the literal value when provided", () => {
    expect(getInitialValue(42)).toBe(42);
  });

  it("executes and returns the result of a factory function", () => {
    expect(getInitialValue(() => "hello")).toBe("hello");
  });
});
