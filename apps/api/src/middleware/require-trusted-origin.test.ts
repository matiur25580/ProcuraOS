import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("../config/env.js", () => ({ env: { WEB_ORIGIN: "https://app.example.com" } }));

import { requireTrustedOrigin } from "./require-trusted-origin.js";

function invoke(headers: Record<string, string | undefined>) {
  const req = {
    get: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const res = { status, json } as unknown as Response;
  const next = vi.fn();

  requireTrustedOrigin(req, res, next);
  return { status, json, next };
}

describe("trusted-origin protection", () => {
  it("allows the configured frontend origin", () => {
    const result = invoke({ origin: "https://app.example.com" });
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it("rejects a different origin, including same-site sibling subdomains", () => {
    const result = invoke({ origin: "https://evil.example.com" });
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({
      success: false,
      error: { message: "Request origin is not trusted" },
    });
    expect(result.next).not.toHaveBeenCalled();
  });

  it("rejects malformed and opaque origins", () => {
    expect(invoke({ origin: "null" }).status).toHaveBeenCalledWith(403);
    expect(invoke({ origin: "not a url" }).status).toHaveBeenCalledWith(403);
  });

  it("rejects cross-site requests even when the Origin header is absent", () => {
    expect(invoke({ "sec-fetch-site": "cross-site" }).status).toHaveBeenCalledWith(403);
  });

  it("allows non-browser clients without Fetch Metadata", () => {
    const result = invoke({});
    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });
});
