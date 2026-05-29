// wisp-design — Phase 1 CSP-helper unit tests.
//
// csp.ts is an OPT-IN pure helper set for dev-mode CSP relaxation. It is not
// yet wired into bridge/server.ts (the bridge serves live.js + data endpoints
// but does not proxy/rewrite the dev server's HTML, so there is no CSP header
// to patch in-process). These tests guard the helpers so they are correct and
// ready for the source-inject layer to consume — and so the module is covered
// rather than untested dead code.

import { describe, expect, it } from "vitest";

import {
  allowScriptSource,
  markOriginalCsp,
  parseCsp,
  readMarkedOriginalCsp,
  serializeCsp,
} from "../../src/bridge/csp.js";

describe("parseCsp / serializeCsp", () => {
  it("round-trips a multi-directive policy", () => {
    const header = "default-src 'self'; script-src 'self' https://cdn.example.com";
    const parsed = parseCsp(header);
    expect(parsed.get("default-src")).toEqual(["'self'"]);
    expect(parsed.get("script-src")).toEqual(["'self'", "https://cdn.example.com"]);
    expect(serializeCsp(parsed)).toBe(header);
  });

  it("lowercases directive names and skips empty segments", () => {
    const parsed = parseCsp("DEFAULT-SRC 'self';  ; SCRIPT-SRC 'none'");
    expect(parsed.has("default-src")).toBe(true);
    expect(parsed.has("script-src")).toBe(true);
    expect(parsed.size).toBe(2);
  });

  it("serializes a sourceless directive without a trailing space", () => {
    const parsed = parseCsp("upgrade-insecure-requests");
    expect(serializeCsp(parsed)).toBe("upgrade-insecure-requests");
  });
});

describe("allowScriptSource", () => {
  const origin = "http://127.0.0.1:31338";

  it("appends to an existing script-src", () => {
    const next = allowScriptSource(parseCsp("script-src 'self'"), origin);
    expect(next.get("script-src")).toEqual(["'self'", origin]);
  });

  it("is idempotent — no duplicate source", () => {
    const once = allowScriptSource(parseCsp("script-src 'self'"), origin);
    const twice = allowScriptSource(once, origin);
    expect(twice.get("script-src")).toEqual(["'self'", origin]);
  });

  it("seeds script-src from default-src when script-src is absent", () => {
    const next = allowScriptSource(parseCsp("default-src 'self'"), origin);
    expect(next.get("script-src")).toEqual(["'self'", origin]);
    // default-src must be left untouched.
    expect(next.get("default-src")).toEqual(["'self'"]);
  });

  it("creates a permissive script-src when neither directive exists", () => {
    const next = allowScriptSource(parseCsp("img-src 'self'"), origin);
    expect(next.get("script-src")).toEqual(["'self'", origin]);
  });

  it("does not mutate the input map", () => {
    const input = parseCsp("script-src 'self'");
    allowScriptSource(input, origin);
    expect(input.get("script-src")).toEqual(["'self'"]);
  });
});

describe("markOriginalCsp / readMarkedOriginalCsp", () => {
  it("round-trips an original CSP header (base64 in <head>)", () => {
    const original = "default-src 'self'; script-src 'self'";
    const html = "<html><head><title>x</title></head><body></body></html>";
    const marked = markOriginalCsp(html, original);
    expect(marked).toContain("data-wisp-csp-original");
    expect(readMarkedOriginalCsp(marked)).toBe(original);
  });

  it("encodes the no-CSP case as null (content=none)", () => {
    const html = "<html><head></head></html>";
    const marked = markOriginalCsp(html, null);
    expect(readMarkedOriginalCsp(marked)).toBeNull();
  });

  it("prepends the marker when there is no <head>", () => {
    const html = "<div>no head here</div>";
    const marked = markOriginalCsp(html, "script-src 'self'");
    expect(marked.startsWith("<meta")).toBe(true);
    expect(readMarkedOriginalCsp(marked)).toBe("script-src 'self'");
  });

  it("returns undefined when the marker tag is absent", () => {
    expect(readMarkedOriginalCsp("<html><head></head></html>")).toBeUndefined();
  });
});
