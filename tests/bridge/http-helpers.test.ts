// wisp-design — Phase 1 HTTP-helper unit tests.
//
// Focused coverage for pure helpers that the server router composes. Black-box
// HTTP tests can't distinguish the token-merge spread order today (the merged
// token is currently unused downstream), so the auth-confusion guard lives
// here at the unit level.

import { describe, expect, it } from "vitest";

import { withAuthoritativeToken } from "../../src/bridge/http-helpers.js";

describe("withAuthoritativeToken", () => {
  const serverToken = "11111111-2222-4333-8444-555555555555";

  it("uses the server token when the body has none", () => {
    const merged = withAuthoritativeToken({ timeout: 1000 }, serverToken);
    expect(merged["token"]).toBe(serverToken);
    expect(merged["timeout"]).toBe(1000);
  });

  it("server token wins even if the body carries its own token (no override)", () => {
    const bogus = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
    const merged = withAuthoritativeToken(
      { token: bogus, timeout: 1000 },
      serverToken,
    );
    // Latent auth-confusion guard: a client-supplied token must NOT replace the
    // authenticated server token in the validated object.
    expect(merged["token"]).toBe(serverToken);
    expect(merged["timeout"]).toBe(1000);
  });

  it("does not mutate the input object", () => {
    const input = { token: "x", timeout: 5 };
    withAuthoritativeToken(input, serverToken);
    expect(input.token).toBe("x");
  });
});
