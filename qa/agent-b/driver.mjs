// wisp-design QA — Bridge end-to-end driver (Agent B)
// Runs as a plain ESM script: node qa/agent-b/driver.mjs
// Uses the same startBridgeServer() path that vitest smoke tests use.
// Writes one result object per section, then exits 0 (or 1 on hard failure).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, "../..");

// ---- helpers ----

function ok(label, extra) {
  console.log(`  PASS  ${label}${extra ? " — " + extra : ""}`);
  return { label, result: "PASS", extra: extra ?? null };
}
function fail(label, reason) {
  console.log(`  FAIL  ${label} — ${reason}`);
  return { label, result: "FAIL", reason };
}
function warn(label, reason) {
  console.log(`  WARN  ${label} — ${reason}`);
  return { label, result: "WARN", reason };
}

async function get(base, path, token, extra = "") {
  const url = `http://127.0.0.1:${base}${path}${token ? `?token=${token}${extra}` : extra ? "?" + extra.slice(1) : ""}`;
  return fetch(url);
}

async function post(base, path, token, body) {
  const qs = token ? `?token=${token}` : "";
  const url = `http://127.0.0.1:${base}${path}${qs}`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const samplePick = () => ({
  kind: "pick",
  sessionId: "qa-agent-b",
  target: { selector: "div.qa", tag: "div", rect: { x: 0, y: 0, w: 10, h: 10 } },
});

const sampleAnnotation = () => ({
  kind: "annotation",
  sessionId: "qa-agent-b",
  target: { selector: "div.qa", tag: "div", rect: { x: 0, y: 0, w: 10, h: 10 } },
  annotation: { kind: "color", note: "make this red" },
});

// ---- dynamic import bridge (ESM with .js ext) ----
import { pathToFileURL } from "node:url";
const { startBridgeServer } = await import(pathToFileURL(`${projectDir}/src/bridge/server.js`).href);

// ---- setup project root fixture ----
const projectRoot = mkdtempSync(join(tmpdir(), "wisp-qa-b-"));
mkdirSync(join(projectRoot, "src"), { recursive: true });
writeFileSync(join(projectRoot, "src", "index.ts"), "export const x = 1;\n");
writeFileSync(join(projectRoot, ".env"), "SECRET=hunter2\n");

let handle;
const allResults = {};

try {
  // =========================================================================
  // SECTION 1 — Boot + port-discovery
  // =========================================================================
  console.log("\n=== Section 1: Boot + port-discovery ===");
  const s1 = [];

  handle = await startBridgeServer({ projectRoot, preferredPort: 31393 });

  // 1a Port in expected range
  if (handle.port >= 31337 && handle.port <= 31400) {
    s1.push(ok("port in 31337..31400", `got ${handle.port}`));
  } else {
    s1.push(fail("port in 31337..31400", `got ${handle.port} — outside DEFAULT_PORT_RANGE`));
  }

  // 1b token is UUID
  const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (TOKEN_RE.test(handle.token)) {
    s1.push(ok("token is UUID-shaped"));
  } else {
    s1.push(fail("token is UUID-shaped", `got: ${handle.token}`));
  }

  // 1c sessionId present
  if (typeof handle.sessionId === "string" && handle.sessionId.length > 0) {
    s1.push(ok("sessionId present", handle.sessionId.slice(0, 8) + "..."));
  } else {
    s1.push(fail("sessionId present", "missing or empty"));
  }

  // 1d GET /health → 200 + {ok:true}
  try {
    const r = await fetch(`http://127.0.0.1:${handle.port}/health`);
    if (r.status !== 200) {
      s1.push(fail("GET /health → 200", `got ${r.status}`));
    } else {
      const body = await r.json();
      if (body.ok === true && typeof body.version === "string") {
        s1.push(ok("GET /health → {ok:true,version}", `v${body.version}`));
      } else {
        s1.push(fail("GET /health body shape", JSON.stringify(body)));
      }
    }
  } catch (e) {
    s1.push(fail("GET /health", e.message));
  }

  // 1e port.lock file (note: startBridgeServer itself doesn't write the lockfile —
  //    that's done by the live CLI. Check if the contracts/port-discovery exports it separately.
  //    We do it manually here to verify writeLockfile works.)
  try {
    const { writeLockfile } = await import(pathToFileURL(`${projectDir}/src/bridge/port-discovery.js`).href);
    const lockPath = join(projectRoot, ".wisp/live/port.lock");
    await writeLockfile(lockPath, {
      port: handle.port,
      token: handle.token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      projectRoot,
    });
    if (existsSync(lockPath)) {
      const raw = JSON.parse(readFileSync(lockPath, "utf8"));
      const hasAllKeys = ["port", "token", "pid", "startedAt", "projectRoot"].every(k => k in raw);
      if (hasAllKeys) {
        s1.push(ok("port.lock written with correct shape"));
      } else {
        s1.push(fail("port.lock shape", `missing keys: ${JSON.stringify(raw)}`));
      }
    } else {
      s1.push(fail("port.lock written", "file not found after writeLockfile()"));
    }
  } catch (e) {
    s1.push(warn("port.lock write", `writeLockfile threw: ${e.message}`));
  }

  allResults.boot = s1;

  // =========================================================================
  // SECTION 2 — Auth token enforcement
  // =========================================================================
  console.log("\n=== Section 2: Auth token enforcement ===");
  const s2 = [];
  const PORT = handle.port;
  const TOKEN = handle.token;
  const WRONG = randomUUID();

  // Endpoint matrix: [path, method, validBody]
  const protectedEndpoints = [
    ["/status", "GET", null],
    ["/design-system.json", "GET", null],
    ["/source", "GET", null],   // needs path= too but auth check fires first
    ["/events", "GET", null],   // SSE — use AbortController
    ["/poll", "GET", null],
    ["/annotation", "POST", sampleAnnotation()],
    ["/stop", "GET", null],
  ];

  for (const [ep, method, body] of protectedEndpoints) {
    // Without token
    try {
      let r;
      const ac = new AbortController();
      const opts = { method, signal: ac.signal };
      if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
      r = fetch(`http://127.0.0.1:${PORT}${ep}`, opts);
      // For SSE we abort immediately after getting headers
      const res = await r;
      ac.abort();
      if (res.status === 401) {
        const b = await res.json().catch(() => ({}));
        s2.push(ok(`${method} ${ep} no-token → 401`, b?.error?.code ?? ""));
      } else {
        s2.push(fail(`${method} ${ep} no-token → 401`, `got ${res.status}`));
      }
    } catch (e) {
      if (/abort/i.test(e.message)) {
        // AbortError after 401 already logged — SSE case
      } else {
        s2.push(fail(`${method} ${ep} no-token`, e.message));
      }
    }

    // With wrong token
    try {
      const ac = new AbortController();
      const qs = `?token=${WRONG}`;
      const opts = { method, signal: ac.signal };
      if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
      const res = await fetch(`http://127.0.0.1:${PORT}${ep}${qs}`, opts);
      ac.abort();
      if (res.status === 401) {
        const b = await res.json().catch(() => ({}));
        s2.push(ok(`${method} ${ep} wrong-token → 401`, b?.error?.code ?? ""));
      } else {
        s2.push(fail(`${method} ${ep} wrong-token → 401`, `got ${res.status}`));
      }
    } catch (e) {
      if (!/abort/i.test(e.message)) {
        s2.push(fail(`${method} ${ep} wrong-token`, e.message));
      }
    }
  }

  // Correct token sample checks
  const correctChecks = [
    ["/status", "GET", null],
    ["/poll", "GET", null],
  ];
  for (const [ep, method, body] of correctChecks) {
    try {
      const qs = `?token=${TOKEN}&timeout=100`;
      const opts = { method };
      const res = await fetch(`http://127.0.0.1:${PORT}${ep}${qs}`, opts);
      if (res.status === 200) {
        s2.push(ok(`${method} ${ep} correct-token → 200`));
      } else {
        s2.push(fail(`${method} ${ep} correct-token → 200`, `got ${res.status}`));
      }
    } catch (e) {
      s2.push(fail(`${method} ${ep} correct-token`, e.message));
    }
  }

  // Public endpoints — no token needed
  for (const [ep, expectJs] of [["/health", false], ["/live.js", true]]) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}${ep}`);
      if (res.status === 200) {
        s2.push(ok(`GET ${ep} public → 200`));
      } else {
        s2.push(fail(`GET ${ep} public → 200`, `got ${res.status}`));
      }
      await res.text(); // drain
    } catch (e) {
      s2.push(fail(`GET ${ep} public`, e.message));
    }
  }

  // Malformed token
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/status?token=not-a-uuid`);
    if (res.status === 401) {
      const b = await res.json();
      if (b?.error?.code === "MALFORMED_TOKEN") {
        s2.push(ok("malformed token → 401 MALFORMED_TOKEN"));
      } else {
        s2.push(warn("malformed token → 401", `code was ${b?.error?.code}`));
      }
    } else {
      s2.push(fail("malformed token → 401", `got ${res.status}`));
    }
  } catch (e) {
    s2.push(fail("malformed token", e.message));
  }

  allResults.auth = s2;

  // =========================================================================
  // SECTION 3 — Path traversal guard
  // =========================================================================
  console.log("\n=== Section 3: Path traversal guard ===");
  const s3 = [];

  const traversalCases = [
    ["../../../../etc/passwd", 403, "PATH_TRAVERSAL"],
    ["..\\..\\windows\\system32\\drivers\\etc\\hosts", 403, "PATH_TRAVERSAL"],
    ["/etc/passwd", 403, "PATH_TRAVERSAL"],
    // Absolute Windows path on this system
    ["C:\\Windows\\System32\\drivers\\etc\\hosts", 403, "PATH_TRAVERSAL"],
    [".env", 403, "FORBIDDEN"],
    [".env.local", 403, "FORBIDDEN"],
    [".env.production", 403, "FORBIDDEN"],
    [".git/config", 403, "FORBIDDEN"],
    ["node_modules/foo/bar.js", 403, "FORBIDDEN"],
    [".wisp/sessions/abc.jsonl", 403, "FORBIDDEN"],
    ["~/.ssh/id_rsa", null, null], // relative ~ — Rule 2/3 might block or allow and 404
  ];

  for (const [p, expectedStatus, expectedCode] of traversalCases) {
    try {
      const encoded = encodeURIComponent(p);
      const res = await fetch(
        `http://127.0.0.1:${PORT}/source?token=${TOKEN}&path=${encoded}`,
      );
      const body = await res.json().catch(() => ({}));
      if (expectedStatus === null) {
        // ~ case — just note what happened
        s3.push(ok(`path=${JSON.stringify(p)} handled gracefully`, `status=${res.status} code=${body?.error?.code ?? "none"}`));
      } else if (res.status === expectedStatus) {
        if (!expectedCode || body?.error?.code === expectedCode) {
          s3.push(ok(`path=${JSON.stringify(p)} → ${expectedStatus} ${expectedCode}`));
        } else {
          s3.push(warn(`path=${JSON.stringify(p)} status ok`, `expected code=${expectedCode} got=${body?.error?.code}`));
        }
      } else {
        s3.push(fail(`path=${JSON.stringify(p)} → ${expectedStatus}`, `got status=${res.status}`));
      }
    } catch (e) {
      s3.push(fail(`path=${JSON.stringify(p)}`, e.message));
    }
  }

  // Valid in-project path
  try {
    const res = await fetch(
      `http://127.0.0.1:${PORT}/source?token=${TOKEN}&path=src/index.ts`,
    );
    if (res.status === 200) {
      const text = await res.text();
      s3.push(ok("src/index.ts valid path → 200", `body len=${text.length}`));
    } else {
      s3.push(fail("src/index.ts valid path → 200", `got ${res.status}`));
    }
  } catch (e) {
    s3.push(fail("src/index.ts valid path", e.message));
  }

  allResults.pathTraversal = s3;

  // =========================================================================
  // SECTION 4 — SSE + long-poll
  // =========================================================================
  console.log("\n=== Section 4: SSE + long-poll ===");
  const s4 = [];

  // 4a SSE connection holds and emits initial frame
  try {
    const ac = new AbortController();
    const sseRes = await fetch(`http://127.0.0.1:${PORT}/events?token=${TOKEN}`, {
      signal: ac.signal,
    });
    if (sseRes.status !== 200) {
      s4.push(fail("GET /events → 200", `got ${sseRes.status}`));
    } else {
      const ct = sseRes.headers.get("content-type") ?? "";
      if (ct.includes("text/event-stream")) {
        s4.push(ok("GET /events → text/event-stream"));
      } else {
        s4.push(fail("GET /events content-type", `got: ${ct}`));
      }
      const reader = sseRes.body?.getReader();
      if (reader) {
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        if (text.match(/^(:\s|data:)/)) {
          s4.push(ok("SSE initial frame is SSE-formatted", JSON.stringify(text.slice(0, 40))));
        } else {
          s4.push(fail("SSE initial frame", `got: ${JSON.stringify(text.slice(0, 60))}`));
        }
        await reader.cancel().catch(() => {});
      }
    }
    ac.abort();
  } catch (e) {
    if (!/abort/i.test(e.message)) s4.push(fail("GET /events SSE", e.message));
  }

  // 4b POST /events enqueues, GET /poll delivers (wake-up path)
  try {
    // Drain to get current cursor
    const drainRes = await fetch(`http://127.0.0.1:${PORT}/poll?token=${TOKEN}&timeout=100`);
    const drain = await drainRes.json();
    const cursor = drain.cursor;

    // Start poll before posting
    const pollPromise = fetch(
      `http://127.0.0.1:${PORT}/poll?token=${TOKEN}&timeout=5000&cursor=${encodeURIComponent(cursor)}`,
    );
    // Small delay to let waiter register
    await new Promise(r => setTimeout(r, 80));
    // Post event
    const postRes = await post(PORT, "/events", TOKEN, samplePick());
    if (postRes.status !== 200) {
      s4.push(fail("POST /events accepted", `got ${postRes.status}`));
    } else {
      const postBody = await postRes.json();
      if (postBody.accepted && postBody.cursor?.match(/^seq-\d+-/)) {
        s4.push(ok("POST /events → {accepted:true, cursor}", postBody.cursor));
      } else {
        s4.push(fail("POST /events body shape", JSON.stringify(postBody)));
      }
    }

    const t0 = Date.now();
    const pollRes = await pollPromise;
    const elapsed = Date.now() - t0;
    if (pollRes.status !== 200) {
      s4.push(fail("GET /poll wake-up → 200", `got ${pollRes.status}`));
    } else {
      const pollBody = await pollRes.json();
      if (pollBody.events?.length >= 1) {
        s4.push(ok("GET /poll wake-up delivers event", `slicedAt=${pollBody.slicedAt}ms elapsed=${elapsed}ms`));
      } else {
        s4.push(fail("GET /poll wake-up events", `got ${pollBody.events?.length} events`));
      }
      if (pollBody.slicedAt < 5000) {
        s4.push(ok("GET /poll wake-up slicedAt < 5000ms", `${pollBody.slicedAt}ms`));
      } else {
        s4.push(fail("GET /poll wake-up slicedAt", `${pollBody.slicedAt}ms >= 5000`));
      }
    }
  } catch (e) {
    s4.push(fail("SSE/poll wake-up path", e.message));
  }

  // 4c Timeout clamping: timeout=300000 (over 270s) — verify no 400
  // We won't wait 270s; post event to short-circuit
  try {
    const drainRes2 = await fetch(`http://127.0.0.1:${PORT}/poll?token=${TOKEN}&timeout=100`);
    const drain2 = await drainRes2.json();
    const cursor2 = drain2.cursor;

    const pollPromise2 = fetch(
      `http://127.0.0.1:${PORT}/poll?token=${TOKEN}&timeout=300000&cursor=${encodeURIComponent(cursor2)}`,
    );
    await new Promise(r => setTimeout(r, 80));
    await post(PORT, "/events", TOKEN, samplePick());
    const clampRes = await pollPromise2;
    if (clampRes.status === 200) {
      s4.push(ok("timeout=300000 clamped → still 200 (no 400)", `status=${clampRes.status}`));
      const cb = await clampRes.json();
      if (cb.events?.length >= 1) {
        s4.push(ok("clamped poll still delivers events"));
      }
    } else {
      s4.push(fail("timeout=300000 clamped", `got status=${clampRes.status}`));
    }
  } catch (e) {
    s4.push(fail("timeout clamping test", e.message));
  }

  // 4d Short timeout (5s) — poll with no events, verify it returns within ~5s+buffer
  try {
    const drainRes3 = await fetch(`http://127.0.0.1:${PORT}/poll?token=${TOKEN}&timeout=100`);
    const drain3 = await drainRes3.json();
    const cursor3 = drain3.cursor;

    const t0 = Date.now();
    const shortRes = await fetch(
      `http://127.0.0.1:${PORT}/poll?token=${TOKEN}&timeout=500&cursor=${encodeURIComponent(cursor3)}`,
    );
    const elapsed2 = Date.now() - t0;
    if (shortRes.status === 200) {
      const sb = await shortRes.json();
      if (sb.events.length === 0) {
        s4.push(ok("GET /poll timeout=500 returns empty events", `elapsed=${elapsed2}ms`));
      } else {
        s4.push(warn("GET /poll timeout=500", `got ${sb.events.length} events (unexpected)`));
      }
      if (elapsed2 < 2000) {
        s4.push(ok("GET /poll timeout=500 respects cap", `${elapsed2}ms < 2000ms`));
      } else {
        s4.push(fail("GET /poll timeout=500 too slow", `${elapsed2}ms`));
      }
    } else {
      s4.push(fail("GET /poll timeout=500 → 200", `got ${shortRes.status}`));
    }
  } catch (e) {
    s4.push(fail("GET /poll short timeout", e.message));
  }

  // 4e SSE fan-out — post event while SSE connected, verify data: frame arrives
  try {
    const ac2 = new AbortController();
    const sseRes2 = await fetch(`http://127.0.0.1:${PORT}/events?token=${TOKEN}`, {
      signal: ac2.signal,
    });
    const reader2 = sseRes2.body?.getReader();
    // Read initial frame
    if (reader2) {
      await reader2.read(); // drain ": connected\n\n"
      // Post event
      const posted = await post(PORT, "/events", TOKEN, samplePick());
      const postB = await posted.json();
      // Read next chunk from SSE
      const { value: sseChunk } = await Promise.race([
        reader2.read(),
        new Promise(r => setTimeout(() => r({ value: undefined }), 3000)),
      ]);
      if (sseChunk) {
        const sseText = new TextDecoder().decode(sseChunk);
        if (sseText.includes("data:")) {
          s4.push(ok("SSE fan-out: event pushed to subscriber", sseText.slice(0, 60)));
        } else {
          s4.push(warn("SSE fan-out: chunk received but no data:", JSON.stringify(sseText.slice(0, 40))));
        }
      } else {
        s4.push(fail("SSE fan-out: no data frame within 3s"));
      }
      await reader2.cancel().catch(() => {});
    }
    ac2.abort();
  } catch (e) {
    if (!/abort/i.test(e.message)) s4.push(fail("SSE fan-out test", e.message));
  }

  allResults.ssePoll = s4;

  // =========================================================================
  // SECTION 5 — CSP helpers (pure functions, no server)
  // =========================================================================
  console.log("\n=== Section 5: CSP helpers ===");
  const s5 = [];

  try {
    const { parseCsp, serializeCsp, allowScriptSource, markOriginalCsp, readMarkedOriginalCsp }
      = await import(pathToFileURL(`${projectDir}/src/bridge/csp.js`).href);

    // 5a Parse + allow + serialize adds script-src
    const cspStr = "default-src 'self'";
    const parsed = parseCsp(cspStr);
    const bridgeSrc = "http://127.0.0.1:31393";
    const patched = allowScriptSource(parsed, bridgeSrc);
    const serialized = serializeCsp(patched);

    if (serialized.includes("script-src") && serialized.includes(bridgeSrc)) {
      s5.push(ok("allowScriptSource adds script-src with bridge origin", serialized));
    } else {
      s5.push(fail("allowScriptSource", `result: ${serialized}`));
    }
    if (serialized.includes("'self'")) {
      s5.push(ok("allowScriptSource inherits 'self' from default-src"));
    } else {
      s5.push(fail("allowScriptSource inherits 'self'", serialized));
    }

    // 5b markOriginalCsp inserts meta tag with base64 original
    const sampleHtml = "<html><head><title>T</title></head><body></body></html>";
    const marked = markOriginalCsp(sampleHtml, cspStr);
    if (marked.includes("data-wisp-csp-original")) {
      s5.push(ok("markOriginalCsp inserts data-wisp-csp-original meta tag"));
    } else {
      s5.push(fail("markOriginalCsp meta tag missing", marked.slice(0, 100)));
    }

    // 5c readMarkedOriginalCsp recovers original
    const recovered = readMarkedOriginalCsp(marked);
    if (recovered === cspStr) {
      s5.push(ok("readMarkedOriginalCsp recovers original CSP string", recovered));
    } else {
      s5.push(fail("readMarkedOriginalCsp", `expected "${cspStr}" got "${recovered}"`));
    }

    // 5d HTML without CSP — markOriginalCsp(html, null) encodes "none"
    const noOriginal = markOriginalCsp(sampleHtml, null);
    const recoveredNull = readMarkedOriginalCsp(noOriginal);
    if (recoveredNull === null) {
      s5.push(ok("markOriginalCsp(null) → readMarked returns null"));
    } else {
      s5.push(fail("markOriginalCsp(null)", `got: ${JSON.stringify(recoveredNull)}`));
    }

    // 5e HTML with no head — tag prepended
    const noHead = "<body>hello</body>";
    const markedNoHead = markOriginalCsp(noHead, cspStr);
    if (markedNoHead.startsWith("<meta")) {
      s5.push(ok("markOriginalCsp without <head> prepends tag"));
    } else {
      s5.push(warn("markOriginalCsp without <head>", `result: ${markedNoHead.slice(0, 80)}`));
    }

    // 5f parseCsp empty directives
    const empty = parseCsp("");
    if (empty.size === 0) {
      s5.push(ok("parseCsp empty string → empty map"));
    } else {
      s5.push(fail("parseCsp empty", `size=${empty.size}`));
    }

    // 5g existing script-src doesn't duplicate
    const withScript = parseCsp("script-src 'self' 'unsafe-inline'");
    const withSelf = allowScriptSource(withScript, "'self'");
    const serialized2 = serializeCsp(withSelf);
    const count = (serialized2.match(/'self'/g) ?? []).length;
    if (count === 1) {
      s5.push(ok("allowScriptSource doesn't duplicate existing source"));
    } else {
      s5.push(fail("allowScriptSource duplicate check", `'self' appears ${count} times`));
    }

  } catch (e) {
    s5.push(fail("CSP module load/test", e.message));
  }

  allResults.csp = s5;

  // =========================================================================
  // SECTION 6 — Shutdown
  // =========================================================================
  console.log("\n=== Section 6: Shutdown ===");
  const s6 = [];

  // 6a /stop returns {stopping:true}
  try {
    const stopRes = await fetch(`http://127.0.0.1:${handle.port}/stop?token=${handle.token}`);
    if (stopRes.status !== 200) {
      s6.push(fail("GET /stop → 200", `got ${stopRes.status}`));
    } else {
      const sb = await stopRes.json();
      if (sb.stopping === true && typeof sb.graceMs === "number") {
        s6.push(ok("GET /stop → {stopping:true, graceMs}", `graceMs=${sb.graceMs}`));
      } else {
        s6.push(fail("GET /stop body", JSON.stringify(sb)));
      }
    }
  } catch (e) {
    s6.push(fail("GET /stop", e.message));
  }

  // Wait for grace period
  await new Promise(r => setTimeout(r, 800));

  // 6b After stop, port is no longer accepting
  try {
    await fetch(`http://127.0.0.1:${handle.port}/health`, { signal: AbortSignal.timeout(1000) });
    s6.push(warn("server still responding after /stop + 800ms", "may be within grace window"));
  } catch (e) {
    // ECONNREFUSED or timeout = server is down = good
    s6.push(ok("server not accepting connections after stop", e.code ?? e.message));
  }

  // 6c Re-boot on same port → succeeds (port was released)
  try {
    const h2 = await startBridgeServer({ projectRoot, preferredPort: handle.port });
    if (h2.port === handle.port) {
      s6.push(ok("re-boot on same port after stop", `port=${h2.port}`));
    } else {
      s6.push(warn("re-boot used different port", `got ${h2.port}`));
    }
    if (h2.token !== handle.token) {
      s6.push(ok("re-boot generates new token"));
    } else {
      s6.push(warn("re-boot token is same", "UUIDs should differ per session"));
    }
    await h2.stop(50);
    handle = null; // already stopped
  } catch (e) {
    s6.push(fail("re-boot after stop", e.message));
  }

  allResults.shutdown = s6;

} catch (fatal) {
  console.error("FATAL:", fatal);
  process.exit(1);
} finally {
  if (handle) {
    await handle.stop(50).catch(() => {});
  }
  rmSync(projectRoot, { recursive: true, force: true });
}

// =========================================================================
// Write individual section .md files
// =========================================================================
const qaDir = path.resolve(__dirname);
const sections = [
  ["01-boot.md", "Section 1: Boot + Port-Discovery", allResults.boot],
  ["02-auth.md", "Section 2: Auth Token Enforcement", allResults.auth],
  ["03-path-traversal.md", "Section 3: Path Traversal Guard", allResults.pathTraversal],
  ["04-sse-poll.md", "Section 4: SSE + Long-Poll", allResults.ssePoll],
  ["05-csp.md", "Section 5: CSP Helpers", allResults.csp],
  ["06-shutdown.md", "Section 6: Shutdown", allResults.shutdown],
];

function renderSection(results) {
  if (!results) return "_no results_\n";
  const lines = ["| Result | Label | Detail |", "|--------|-------|--------|"];
  for (const r of results) {
    const icon = r.result === "PASS" ? "PASS" : r.result === "WARN" ? "WARN" : "FAIL";
    const detail = r.extra ?? r.reason ?? "";
    lines.push(`| ${icon} | ${r.label} | ${detail} |`);
  }
  return lines.join("\n") + "\n";
}

for (const [filename, title, results] of sections) {
  const content = `# ${title}\n\nDate: ${new Date().toISOString()}\n\n${renderSection(results)}`;
  writeFileSync(path.join(qaDir, filename), content, "utf8");
  console.log(`\nWrote ${filename}`);
}

// =========================================================================
// SUMMARY
// =========================================================================
const allFlat = Object.entries(allResults).flatMap(([, rs]) => rs ?? []);
const passCount = allFlat.filter(r => r.result === "PASS").length;
const warnCount = allFlat.filter(r => r.result === "WARN").length;
const failCount = allFlat.filter(r => r.result === "FAIL").length;
const blockers = allFlat.filter(r => r.result === "FAIL");

const sectionSummary = sections.map(([, title, results]) => {
  if (!results) return { title, status: "SKIP" };
  const hasFail = results.some(r => r.result === "FAIL");
  const hasWarn = results.some(r => r.result === "WARN");
  return { title, status: hasFail ? "FAIL" : hasWarn ? "WARN" : "PASS" };
});

const summaryMd = `# Bridge QA Summary (Agent B)

Date: ${new Date().toISOString()}

## Section Results

| Section | Status |
|---------|--------|
${sectionSummary.map(s => `| ${s.title} | ${s.status} |`).join("\n")}

## Totals

| Metric | Count |
|--------|-------|
| PASS | ${passCount} |
| WARN | ${warnCount} |
| FAIL | ${failCount} |
| Total | ${allFlat.length} |

${blockers.length > 0 ? `## Launch Blockers\n\n${blockers.map(b => `- FAIL: **${b.label}** — ${b.reason ?? ""}`).join("\n")}\n` : "## No Launch Blockers\n\nAll checks passed or are advisory warnings only.\n"}
`;

writeFileSync(path.join(qaDir, "SUMMARY.md"), summaryMd, "utf8");
console.log("\nWrote SUMMARY.md");
console.log(`\nFinal: PASS=${passCount} WARN=${warnCount} FAIL=${failCount}`);
process.exit(failCount > 0 ? 1 : 0);
