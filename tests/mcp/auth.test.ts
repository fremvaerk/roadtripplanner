import { describe, expect, test } from "bun:test";
import { checkBearer } from "@/mcp/auth";

describe("checkBearer", () => {
  test("fail-closed when token is undefined, even with a Bearer header", () => {
    expect(checkBearer("Bearer anything", undefined)).toBe(false);
  });

  test("fail-closed when token is empty string", () => {
    expect(checkBearer("Bearer anything", "")).toBe(false);
  });

  test("false when header is null", () => {
    expect(checkBearer(null, "secret")).toBe(false);
  });

  test("false for wrong scheme (Basic)", () => {
    expect(checkBearer("Basic xyz", "secret")).toBe(false);
  });

  test("false when token does not match", () => {
    expect(checkBearer("Bearer wrong", "secret")).toBe(false);
  });

  test("true when token matches", () => {
    expect(checkBearer("Bearer secret", "secret")).toBe(true);
  });

  test("scheme is case-insensitive", () => {
    expect(checkBearer("bearer secret", "secret")).toBe(true);
  });
});
