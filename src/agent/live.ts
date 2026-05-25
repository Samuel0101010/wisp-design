// wisp-design — `wisp-design live` runner (Phase 7).
//
// SKELETON. Coder fills the TODOs marked below; this scaffold is responsible
// for the contract shape, lifecycle (boot/teardown), and the wiring between
// the bridge, source-inject, session-logger, poll-loop, and verify-gate.
//
// Why a skeleton: the runner orchestrates 6+ subsystems (bridge, inject,
// poll-loop, route, verify, session-log). Locking the shape first lets the
// fill-in be mechanical — each TODO maps to exactly one existing module.
//
// Lifecycle (must remain in this order):
//   1. parseFlags + LiveCliFlagsSchema.parse — exit 2 on bad input.
//   2. startBridgeServer({projectRoot, preferredPort?}).
//   3. writeLockfile(.wisp/live/port.lock, {port,token,pid,startedAt,
//      projectRoot}) — server.ts does NOT write this; the runner must.
//   4. (optional) injectLiveScript(<flags.inject>, {bridgeUrl, token}).
//   5. createSessionLogger.start(sessionId, {projectRoot, meta}).
//   6. Install SIGINT/SIGTERM handler: log session-end → removeLiveScript
//      every injectedFile → bridge.stop → releaseLockfile → exit 0.
//   7. Poll loop: while !terminated → runPollOnce → for each event in
//      result.events → routeEvent(evt) → handlers below.
//
// Event routing (synchronous classifier mirrors agent/poll-loop.routeEvent):
//   • configure   → generateVariants (deterministic stub for v1.0.0)
//                   → wrapVariantBlock if source-edit-capable
//                   → postEvent kind=cycling
//                   → sessionLogger.logVariantsEmitted
//   • accept      → gate.run({mode: live-accept|live-with-screenshot})
//                   → if !blocked: acceptVariant → log → postEvent ack
//                     else: postEvent kind=error with rule citation
//   • discard     → discardVariantBlock → sessionLogger.log
//   • annotation  → sessionLogger.log
//   • pick/cycling/parameter-change/generating/heartbeat/error → ignore
//
// Exit codes (match _helpers.EXIT_*):
//   0  clean shutdown via SIGINT/SIGTERM
//   1  IO error (couldn't write lock, couldn't inject, couldn't open session)
//   2  bad flags
//   3  bridge boot failure / fatal runtime error

import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import { startBridgeServer } from "../bridge/server.js";
import { generateVariantsFromIntent } from "./variant-catalog.js";

// Module-level cache: selector → most recent configure context. Used to
// recover (freeText, targetTag) on `accept` so the regenerated variant set
// matches what the user actually picked. Cheap LRU bound: 20 entries.
const lastConfigureContext: Map<string, { freeText: string; targetTag: string }> = new Map();
import {
  DEFAULT_LOCK_PATH,
  releaseLockfile,
  writeLockfile,
} from "../bridge/port-discovery.js";
import {
  LiveCliFlagsSchema,
  type LiveCliFlags,
  type LiveSessionState,
  type LiveVariantBatch,
  LIVE_MAX_VARIANTS,
} from "../contracts/live.js";
import type { BridgeEvent } from "../contracts/bridge.js";
import {
  EXIT_ARG,
  EXIT_IO,
  EXIT_OK,
  flagAsBoolean,
  flagAsNumber,
  flagAsString,
  parseFlags,
  writeError,
  writeJsonResult,
} from "./_helpers.js";

// ---------------------------------------------------------------------------
// Help text.
// ---------------------------------------------------------------------------

const LIVE_HELP_TEXT = `\
wisp-design live — boot bridge + inject live.js into your dev page.

Usage:
  wisp-design live [options]

Options:
  --target <url>                Your dev-server URL (e.g. http://localhost:5173).
                                Required when --inject is set.
  --inject <path>               Path to an HTML file to inject the <script> into.
  --port <n>                    Preferred bridge port. Default: auto-discover (31337..31400).
  --strict                      Verify-gate blocks accept on hard-bans (default: warn).
  --max-variants <n>            Cap variants per generate (1..8). Default: 3.
  --verify-mode <m>             stop-hook | live-accept | live-with-screenshot. Default: live-accept.
  --agent-driven                Delegate variant generation to an external agent
                                (e.g. the Claude session running /wisp-design live).
                                The in-process loop only handles accept/discard/
                                annotation. Variants come from
                                "wisp-design post-event --kind cycling".
  --quiet                       Emit boot info as one-line JSON to stdout; no banner.
  --non-interactive             Skip wizard; use sensible defaults.
  --help, -h                    Print this help.

Examples:
  # Auto-discover port, print connect snippet:
  wisp-design live

  # Inject into your Next.js page + connect to dev server:
  wisp-design live --inject pages/index.tsx --target http://localhost:3000

  # Strict mode for CI:
  wisp-design live --strict --quiet --inject src/App.tsx --target http://localhost:5173
`;

// ---------------------------------------------------------------------------
// Flag mapping — convert `parseFlags` output to LiveCliFlags input, then
// hand to zod for refinement.
// ---------------------------------------------------------------------------

function mapFlags(args: string[]): { ok: true; flags: LiveCliFlags } | { ok: false; message: string } {
  const parsed = parseFlags(args);
  const raw: Record<string, unknown> = {
    target: flagAsString(parsed, "target"),
    port: flagAsNumber(parsed, "port"),
    inject: flagAsString(parsed, "inject"),
    quiet: flagAsBoolean(parsed, "quiet", false),
    strict: flagAsBoolean(parsed, "strict", false),
    verifyMode: flagAsString(parsed, "verify-mode") ?? flagAsString(parsed, "verifyMode"),
    maxVariants: flagAsNumber(parsed, "max-variants") ?? flagAsNumber(parsed, "maxVariants"),
    // Phase 7.8 — defaults to TRUE when the flag is present in any form.
    // Old runs (no flag) keep the legacy stub behaviour for back-compat.
    // Accept three aliases: `--agent-driven`, `--agentDriven`, `--no-stub-variants`.
    agentDriven:
      parsed.flags["agent-driven"] === true ||
      parsed.flags["agentDriven"] === true ||
      parsed.flags["no-stub-variants"] === true ||
      parsed.flags["external-agent"] === true ||
      undefined,
    // Phase 7.10 — when set, agent-driven mode does NOT spawn `claude -p`
    // internally. Instead it leaves `generating` events in the bridge queue
    // for an external poller (an active Claude conversation) to handle.
    externalAgent:
      parsed.flags["external-agent"] === true ||
      parsed.flags["externalAgent"] === true ||
      undefined,
    // non-interactive is consumed by tests but not in the schema — strip it.
  };
  // Strip undefineds so zod's `.default(...)` clauses fire.
  for (const k of Object.keys(raw)) {
    if (raw[k] === undefined) delete raw[k];
  }
  const checked = LiveCliFlagsSchema.safeParse(raw);
  if (!checked.success) {
    return {
      ok: false,
      message: checked.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }
  return { ok: true, flags: checked.data };
}

// ---------------------------------------------------------------------------
// generateVariantsStub — deterministic CSS delta library for v1.0.0.
//
// Returns up to `maxVariants` variants keyed off the pick selector:
//   0: identity — no changes (baseline to compare against)
//   1: increased visual weight — font-weight +200, font-size +10%, letter-spacing -0.02em
//   2: reduced visual weight — font-weight -100, desaturated color (-20%), opacity 0.9
//   3: open air — increased line-height (1.8) and generous padding (1.5em)
//   4: compact — reduced line-height (1.2) and tight padding (0.25em)
//   5: high contrast — color #111, background #fafafa, border 1px solid #333
//   6: accent shift — color var(--color-accent, oklch(55% 0.2 260)), bold
//   7: ghost — opacity 0.65, border 1px dashed currentColor, background transparent
//
// The selector is embedded into each variant's CSS @scope rule. Real LLM
// generation replaces this stub in v1.1 without changing LiveVariantBatch shape.
// ---------------------------------------------------------------------------

// Each variant CSS targets BOTH `:scope` (the variant-host wrapper) AND
// `:scope *` (every descendant). The descendant rule uses `!important` for
// text-style declarations so it beats utility-class frameworks like Tailwind
// or shadcn (`.font-medium`, `.text-base`, etc. — class specificity .001 ties
// with our `[data-wisp-variant="N"]` attribute selector, but Tailwind ships
// in the `<head>` and our style block ships after, so source order would
// normally save us — except some Tailwind classes use `!important` flags via
// arbitrary value syntax). With `!important` on the live-preview side, every
// declared property is *guaranteed* visible regardless of the underlying CSS
// system; the carbonized output substitutes `:scope` for the picked element's
// actual class chain (`h3.font-medium.text-base.text-neutral-900`) which has
// higher specificity than the original Tailwind classes alone, so the
// permanent style block drops the `!important` flag naturally.
const VARIANT_DELTAS: ReadonlyArray<{ css: string; rationale: string }> = [
  {
    css: "/* identity — baseline */",
    rationale: "Baseline: no changes applied — compare other variants against this.",
  },
  {
    css: `:scope, :scope * { font-weight: calc(var(--font-weight, 400) + 200) !important; font-size: calc(1em * 1.1) !important; letter-spacing: -0.02em !important; }`,
    rationale: "Increased weight: heavier type creates stronger visual hierarchy and draws the eye.",
  },
  {
    css: `:scope, :scope * { font-weight: max(100, calc(var(--font-weight, 400) - 100)) !important; filter: saturate(0.8); opacity: 0.9; }`,
    rationale: "Reduced weight: lighter, desaturated treatment recedes into the background.",
  },
  {
    css: `:scope, :scope * { line-height: 1.8 !important; } :scope { padding: 1.5em; }`,
    rationale: "Open air: generous line-height and padding improves readability for long-form content.",
  },
  {
    css: `:scope, :scope * { line-height: 1.2 !important; } :scope { padding: 0.25em; }`,
    rationale: "Compact: tight spacing suits dense data tables or navigation lists.",
  },
  {
    css: `:scope, :scope * { color: #111 !important; } :scope { background-color: #fafafa; outline: 1px solid #333; }`,
    rationale: "High contrast: pure-black type on near-white meets WCAG AAA contrast ratio.",
  },
  {
    css: `:scope, :scope * { color: var(--color-accent, oklch(55% 0.2 260)) !important; font-weight: 600 !important; }`,
    rationale: "Accent shift: uses your design-system accent token for brand-aligned emphasis.",
  },
  {
    css: `:scope { opacity: 0.65; border: 1px dashed currentColor; background: transparent; }`,
    rationale: "Ghost: transparent background with dashed border signals a secondary or disabled state.",
  },
];

export function generateVariantsStub(
  selector: string,
  maxVariants: number,
  context?: { freeText?: string; targetTag?: string },
): LiveVariantBatch["variants"] {
  // Phase 7.7 — actually use freeText + targetTag to pick a tag-aware
  // variant set from the catalog. Backward-compat: when context is absent,
  // fall back to the legacy fixed VARIANT_DELTAS table.
  if (context !== undefined) {
    const catalogVariants = generateVariantsFromIntent({
      freeText: context.freeText ?? "",
      targetTag: context.targetTag ?? "",
      maxVariants,
    });
    const out: LiveVariantBatch["variants"] = [];
    for (let i = 0; i < catalogVariants.length; i += 1) {
      out.push({
        id: `v${i}`,
        css: catalogVariants[i]!.css,
        rationale: catalogVariants[i]!.rationale,
      });
    }
    return out;
  }
  // Legacy fallback (used by tests that call with the old 2-arg signature).
  const count = Math.min(Math.max(1, maxVariants), LIVE_MAX_VARIANTS, VARIANT_DELTAS.length);
  const variants: LiveVariantBatch["variants"] = [];
  for (let i = 0; i < count; i += 1) {
    const delta = VARIANT_DELTAS[i]!;
    const id = `v${i}`;
    variants.push({ id, css: delta.css, rationale: delta.rationale });
  }
  void selector;
  return variants;
}

// ---------------------------------------------------------------------------
// dispatchEvent — handle one BridgeEvent from the poll loop.
// ---------------------------------------------------------------------------

export async function dispatchEvent(
  ev: BridgeEvent,
  state: LiveSessionState,
  flags: LiveCliFlags,
  cwd: string,
): Promise<void> {
  const { sessionLogger } = await import("../session/logger.js");
  const { postEvent } = await import("./poll-loop.js");
  const bridgeUrl = `http://127.0.0.1:${state.bridge.port}`;
  const token = state.bridge.token;
  const logOpts = { projectRoot: cwd };

  switch (ev.kind) {
    case "generating": {
      const selector = ev.target.selector;
      const targetId = ev.target.selector; // use selector as targetId for stub

      // Log the configure event — happens in all modes so session-replay
      // captures the user's intent and the active session timeline.
      await sessionLogger.logConfigure(state.sessionId, { targetId, freeText: ev.freeText }, logOpts);

      // Cache the freeText+tag context so the later accept-with-stub-fallback
      // path (when variantCss is missing from the event) can still recover.
      lastConfigureContext.set(selector, {
        freeText: ev.freeText,
        targetTag: ev.target.tag,
      });
      const variantCount = Math.min(ev.variantCount, flags.maxVariants);

      // Phase 7.9 — agent-driven mode: spawn headless `claude -p` to design
      // real LLM variants, post them back via SSE. The in-process loop is the
      // DAEMON: bridge polls, claude designs, browser renders. No interactive
      // Claude session required for live operation.
      if (flags.agentDriven) {
        // Wrap source block (best-effort) so a later accept can splice.
        if (state.injectedFiles.length > 0) {
          const filePath = state.injectedFiles[0]!;
          try {
            const { wrapVariantBlock } = await import("../source/wrap.js");
            await wrapVariantBlock(
              filePath,
              { id: targetId, selector },
              state.sessionId,
              variantCount,
              { projectRoot: cwd },
            );
          } catch {
            // best-effort; live preview still works without source wrap
          }
        }

        // Phase 7.10 — external-agent mode: skip the in-process claude
        // spawn. The active Claude conversation is expected to be subscribed
        // to SSE and design hand-crafted variants. Phase 7.13: instead of
        // leaving the event in the queue silently (which made the overlay
        // appear dead for up to 5min until the browser-side fallback fired),
        // we ALSO post deterministic stub variants immediately. The active
        // session can supersede them by POSTing a second `cycling` event —
        // the browser re-renders on the newer payload. Net effect: the user
        // sees SOMETHING within ~1s in every case, and Opus-in-chat still
        // gets to design real variants when present.
        // Phase 7.13b — external-agent mode keeps the browser in its
        // `generating` state (spinner over the bar) until the active Claude
        // session POSTs a real cycling event. Source wrap above is preserved
        // so accept-splice works later. No fallback variants are emitted —
        // the user experience is: spinner → silence → real Opus variants
        // arrive, no [loading…] placeholder confusion.
        if (flags.externalAgent) {
          if (!flags.quiet) {
            process.stdout.write(
              `wisp-design live: external-agent — generating event waiting for active Claude session to design variants. freeText="${ev.freeText.slice(0, 60)}…"\n`,
            );
          }
          break;
        }

        if (!flags.quiet) {
          process.stdout.write(
            `wisp-design live: designing ${variantCount} variants for "${ev.freeText.slice(0, 60)}…" via claude (haiku)…\n`,
          );
        }

        let claudeVariants: LiveVariantBatch["variants"];
        let claudeMeta: { costUsd?: number; durationMs?: number } = {};
        try {
          const { invokeClaudeForVariants } = await import("./claude-invoke.js");
          const result = await invokeClaudeForVariants(
            {
              target: { selector: ev.target.selector, tag: ev.target.tag },
              freeText: ev.freeText,
              variantCount,
            },
            {},
          );
          if (result.ok) {
            claudeVariants = result.variants.map((v) => ({
              id: v.id,
              css: v.css,
              rationale: v.rationale,
            }));
            claudeMeta = { costUsd: result.costUsd, durationMs: result.durationMs };
            if (!flags.quiet) {
              process.stdout.write(
                `wisp-design live: ✓ ${claudeVariants.length} variants from claude ` +
                  `(${result.durationMs}ms, $${result.costUsd.toFixed(4)})\n`,
              );
            }
          } else {
            if (!flags.quiet) {
              process.stderr.write(
                `wisp-design live: claude invocation failed (${result.reason})` +
                  (result.detail ? ` — ${result.detail.slice(0, 200)}` : "") +
                  `. Falling back to intent-catalog stub.\n`,
              );
            }
            claudeVariants = generateVariantsStub(selector, variantCount, {
              freeText: ev.freeText,
              targetTag: ev.target.tag,
            });
          }
        } catch (err) {
          if (!flags.quiet) {
            process.stderr.write(
              `wisp-design live: claude-invoke threw (${(err as Error).message}). Falling back to stub.\n`,
            );
          }
          claudeVariants = generateVariantsStub(selector, variantCount, {
            freeText: ev.freeText,
            targetTag: ev.target.tag,
          });
        }

        // Post cycling so browser renders the variants.
        await postEvent({
          bridgeUrl,
          token,
          event: {
            kind: "cycling",
            sessionId: state.sessionId,
            target: ev.target,
            variants: claudeVariants,
            activeIndex: 0,
          },
        });

        await sessionLogger.logVariantsEmitted(
          state.sessionId,
          {
            targetId,
            variants: claudeVariants.map((v) => ({
              id: v.id,
              rationale: v.rationale,
              primaryAxis: "claude-designed",
            })),
          },
          logOpts,
        );
        void claudeMeta;
        break;
      }

      const variants = generateVariantsStub(selector, variantCount, {
        freeText: ev.freeText,
        targetTag: ev.target.tag,
      });

      // Wrap the source file with a `wisp-variants-start/end` marker block
      // bound to this (sessionId, targetId). Without this, the later
      // `acceptVariant` call has nothing to splice into and throws
      // "no variants block for session=X target=Y" — bug #28. The wrap is
      // best-effort: if the file is generated/built/non-source-safe, the
      // safety guard refuses and we still post the cycling event so the
      // live preview works (accept will just fail with a surfaced error).
      // Wrap is best-effort. A failed wrap (target_not_found etc.) means
      // accept-splice will later fail, but the LIVE PREVIEW still works
      // (browser renders @scope CSS in-DOM independent of source markers).
      // Critical: do NOT post `kind: "error"` to the browser — the
      // state-machine treats incoming errors as `generate-error`, which
      // kicks the state from `generating` back to `configuring` BEFORE
      // the cycling event lands, so the variant cycling UI is never
      // entered. Log to stderr (visible in the live process's terminal)
      // for diagnostics instead.
      if (state.injectedFiles.length > 0) {
        const filePath = state.injectedFiles[0]!;
        try {
          const { wrapVariantBlock } = await import("../source/wrap.js");
          const wrapResult = await wrapVariantBlock(
            filePath,
            { id: targetId, selector },
            state.sessionId,
            variantCount,
            { projectRoot: cwd },
          );
          if (!wrapResult.ok && !flags.quiet) {
            process.stderr.write(
              `wisp-design live: wrap-variants refused (${wrapResult.reason}) ` +
                `for selector "${selector.slice(0, 80)}…" — accept-splice will be unavailable for this target.\n`,
            );
          }
        } catch (err) {
          if (!flags.quiet) {
            process.stderr.write(
              `wisp-design live: wrap-variants threw: ${(err as Error).message}\n`,
            );
          }
        }
      }

      // Post cycling event back to bridge so browser enters cycling mode.
      await postEvent({
        bridgeUrl,
        token,
        event: {
          kind: "cycling",
          sessionId: state.sessionId,
          target: ev.target,
          variants,
          activeIndex: 0,
        },
      });

      // Log variants emitted.
      await sessionLogger.logVariantsEmitted(
        state.sessionId,
        {
          targetId,
          variants: variants.map((v) => ({
            id: v.id,
            rationale: v.rationale,
            primaryAxis: "typography",
          })),
        },
        logOpts,
      );
      break;
    }

    case "accept": {
      const { run: gateRun } = await import("../verify/gate.js");
      const report = await gateRun({
        mode: flags.verifyMode,
        projectRoot: cwd,
        sessionId: state.sessionId,
        bridgeUrl,
        token,
      });

      const blocked = flags.strict && report.blocked;

      if (blocked) {
        // Build a human-readable citation from the blocking violations.
        const citations = report.checks
          .filter((c) => c.severity === "fail")
          .map((c) => c.name)
          .join(", ");
        await postEvent({
          bridgeUrl,
          token,
          event: {
            kind: "error",
            sessionId: state.sessionId,
            message: `verification-gate blocked accept: ${citations || "hard-ban rule"}`,
            code: "ACCEPT_BLOCKED",
          },
        });
        await sessionLogger.logVerifyReport(
          state.sessionId,
          {
            verdict: "blocked",
            hardBanCount: report.hardBanCount,
            a11yFailCount: report.a11yFailCount,
          },
          logOpts,
        );
        break;
      }

      // Gate passed (or warn-only in non-strict mode) — try to splice the file.
      //
      // Phase 7.8 — variant CSS resolution order:
      //   1. `ev.variantCss` (browser-provided) — accurate even for non-
      //      deterministic LLM-generated variants from agent-driven mode.
      //   2. stub regeneration (legacy fallback for tests / older browsers).
      // This decouples accept-splice from the in-process variant generator
      // and lets Claude design variants without the live process needing to
      // know how to reproduce them.
      if (state.injectedFiles.length > 0) {
        const filePath = state.injectedFiles[0]!;
        try {
          let variantCss = ev.variantCss ?? "";
          if (variantCss === "") {
            const ctx = lastConfigureContext.get(ev.target.selector);
            const allVariants = generateVariantsStub(ev.target.selector, flags.maxVariants, ctx);
            const accepted = allVariants.find((v) => v.id === ev.variantId);
            variantCss = accepted?.css ?? "";
          }
          if (variantCss === "") {
            // Defensive: variantId from the browser doesn't match any stub
            // ID. Don't fail the accept silently — surface via error event.
            await postEvent({
              bridgeUrl,
              token,
              event: {
                kind: "error",
                sessionId: state.sessionId,
                message: `accept: variant id "${ev.variantId}" not in stub set`,
                code: "ACCEPT_UNKNOWN_VARIANT",
              },
            });
            break;
          }
          const { acceptVariant } = await import("../source/accept.js");
          const acceptResult = await acceptVariant(
            {
              filePath,
              sessionId: state.sessionId,
              targetId: ev.target.selector,
              variantId: ev.variantId,
              variantCss,
              paramOverrides: {},
              carbonize: true,
            },
            { projectRoot: cwd },
          );
          await sessionLogger.logAccept(
            state.sessionId,
            { variantId: ev.variantId, filePath },
            logOpts,
          );
          void acceptResult; // hashes available for future use
        } catch (err) {
          // Accept splice failed (e.g. no marker block) — post error but don't crash.
          await postEvent({
            bridgeUrl,
            token,
            event: {
              kind: "error",
              sessionId: state.sessionId,
              message: `accept-splice failed: ${(err as Error).message}`,
              code: "ACCEPT_SPLICE_FAILED",
            },
          });
        }
      }

      await sessionLogger.logVerifyReport(
        state.sessionId,
        {
          verdict: report.blocked ? "warn" : "pass",
          hardBanCount: report.hardBanCount,
          a11yFailCount: report.a11yFailCount,
        },
        logOpts,
      );

      // Ack: post the accepted variant back as a cycling event (activeIndex = accepted id index)
      await postEvent({
        bridgeUrl,
        token,
        event: {
          kind: "cycling",
          sessionId: state.sessionId,
          target: ev.target,
          variants: [{ id: ev.variantId, css: "", rationale: "accepted" }],
          activeIndex: 0,
        },
      });
      break;
    }

    case "discard": {
      if (state.injectedFiles.length > 0) {
        const filePath = state.injectedFiles[0]!;
        try {
          const { discardVariantBlock } = await import("../source/wrap.js");
          await discardVariantBlock(
            filePath,
            state.sessionId,
            ev.target.selector,
            { projectRoot: cwd },
          );
        } catch {
          // No marker block — nothing to discard, that's fine.
        }
      }
      await sessionLogger.log(
        {
          ts: new Date().toISOString(),
          sessionId: state.sessionId,
          kind: "configure", // nearest available kind for a discard note
          detail: { targetId: ev.target.selector, freeText: "discard" },
        },
        logOpts,
      );
      break;
    }

    case "annotation": {
      // Log with the dedicated `annotation-added` kind so replay tooling
      // can distinguish annotations from configure events. Prior to this
      // fix annotations were mis-logged as `configure` with the payload
      // packed into freeText — confusing both the replay-builder and the
      // /sessions endpoint (which only surfaces accept-variant entries).
      await sessionLogger.logAnnotationAdded(
        state.sessionId,
        {
          targetId: ev.target.selector,
          annotationKind: ev.annotation.kind,
          note: ev.annotation.note,
        },
        logOpts,
      );
      break;
    }

    // All other kinds (pick, cycling, parameter-change, generating, heartbeat, error) → ignore.
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// runLive — the CLI runner. Returns an exit code; src/index.ts wraps with
// process.exit().
// ---------------------------------------------------------------------------

export async function runLive(args: string[]): Promise<number> {
  // Fast-exit for --help / -h. Must be checked BEFORE mapFlags so we never
  // attempt to boot the bridge server (which would hang in non-TTY contexts).
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(LIVE_HELP_TEXT);
    return EXIT_OK;
  }

  // (1) Parse + validate flags.
  const parsed = mapFlags(args);
  if (!parsed.ok) {
    writeError({ code: "BAD_FLAG", message: parsed.message });
    return EXIT_ARG;
  }
  const flags = parsed.flags;

  // (2) Boot the bridge. The lockPath captured in the onBeforeStop closure
  //     is assigned BELOW (after bridge boot) — the closure fires only when
  //     someone later calls `stop()` (HTTP /stop endpoint, SIGINT/SIGTERM via
  //     our shutdown handler, or a test calling `handle.stop()`), by which
  //     time `lockPath` has been set. Releasing the lock from the bridge's
  //     teardown path means even an HTTP-triggered stop cleans up — the
  //     verifier flagged that as launch-blocker #11.
  // eslint-disable-next-line prefer-const
  let lockPath: string = resolve(process.cwd(), DEFAULT_LOCK_PATH);
  let handle: Awaited<ReturnType<typeof startBridgeServer>>;
  try {
    handle = await startBridgeServer({
      projectRoot: process.cwd(),
      ...(flags.port !== undefined ? { preferredPort: flags.port } : {}),
      onBeforeStop: async () => {
        await safeReleaseLock(lockPath);
      },
    });
  } catch (err) {
    writeError({
      code: "BRIDGE_BOOT_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }

  // (3) Write the port.lock. server.ts does NOT do this; the runner owns it
  //     because the lifecycle of the lock is bound to the CLI process, not
  //     to the in-memory handle. The path was resolved above so the bridge's
  //     onBeforeStop closure has it ready.
  try {
    await writeLockfile(lockPath, {
      port: handle.port,
      token: handle.token,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      projectRoot: process.cwd(),
    });
  } catch (err) {
    await safeStop(handle);
    writeError({
      code: "PORT_LOCK_WRITE_FAILED",
      message: (err as Error).message,
    });
    return EXIT_IO;
  }

  // (4) Build session state.
  const state: LiveSessionState = {
    sessionId: handle.sessionId,
    bridge: { port: handle.port, token: handle.token },
    ...(flags.target !== undefined ? { target: flags.target } : {}),
    injectedFiles: [],
    started: new Date().toISOString(),
  };

  // (5) Optional <script> injection. When --inject is omitted, print the
  //     paste-this-snippet for the user instead.
  if (flags.inject !== undefined) {
    // TODO(coder): filled — injectLiveScript wired below.
    const bridgeUrl = `http://127.0.0.1:${handle.port}`;
    try {
      const { injectLiveScript } = await import("../source/inject.js");
      await injectLiveScript(
        flags.inject,
        { bridgeUrl, token: handle.token, inline: false, preferredAnchor: "auto" },
        { projectRoot: process.cwd(), sessionId: handle.sessionId },
      );
      state.injectedFiles.push(flags.inject);
    } catch (err) {
      // Non-fatal: log and fall through. User can paste manually.
      if (!flags.quiet) {
        process.stderr.write(
          `wisp-design live: inject failed (${(err as Error).message}) — ` +
            `add the script tag manually:\n` +
            `  <script src="${bridgeUrl}/live.js?token=${handle.token}"></script>\n`,
        );
      }
    }
  } else if (!flags.quiet) {
    process.stdout.write(
      [
        `wisp-design live: bridge listening on 127.0.0.1:${handle.port}`,
        `session: ${handle.sessionId}`,
        ``,
        `Add this to your dev-server HTML <head>:`,
        `  <script src="http://127.0.0.1:${handle.port}/live.js?token=${handle.token}"></script>`,
        ``,
      ].join("\n"),
    );
  }

  // (5b) Auto-discover files that already carry a wisp-inject script tag
  // (re-attached during a previous live session whose script the user kept).
  // Without this step, `accept` would silently skip the source-splice
  // because `injectedFiles` is empty — bug found Phase 7.1.
  // We refresh the token in those files to match this session so the
  // browser POSTs authenticate. Errors are non-fatal.
  try {
    const { discoverInjectedFiles } = await import("../source/inject.js");
    const discovered = await discoverInjectedFiles({ projectRoot: process.cwd() });
    for (const filePath of discovered) {
      if (!state.injectedFiles.includes(filePath)) {
        state.injectedFiles.push(filePath);
      }
    }
    // Best-effort token refresh so the existing script tag works.
    if (discovered.length > 0) {
      const { refreshInjectToken } = await import("../source/inject.js");
      for (const filePath of discovered) {
        try {
          await refreshInjectToken(
            filePath,
            { bridgeUrl: `http://127.0.0.1:${handle.port}`, token: handle.token },
            { projectRoot: process.cwd() },
          );
        } catch {
          // tolerated — user can refresh tab manually
        }
      }
    }
    // Phase 7.6 — cleanup stale wrap markers from previously-crashed sessions.
    // A user closing their tab mid-cycle (or a bridge crash) leaves
    // wisp-variants-start..end markers in the source. On the next session
    // start we walk every discovered file and discard each block back to
    // its originalLines payload. Without this, the page renders ghost
    // `data-wisp-variants-host` div elements even when no live session is
    // running.
    if (discovered.length > 0) {
      const { cleanupStaleWraps } = await import("../source/wrap.js");
      for (const filePath of discovered) {
        try {
          const cleaned = await cleanupStaleWraps(filePath, {
            projectRoot: process.cwd(),
          });
          if (cleaned > 0 && !flags.quiet) {
            process.stderr.write(
              `wisp-design live: cleaned ${cleaned} stale wrap-variants block(s) in ${filePath}\n`,
            );
          }
        } catch {
          // tolerated — file may be locked / readonly
        }
      }
    }
  } catch {
    // discoverInjectedFiles may not exist yet — feature-flagged.
  }

  // (6) Open the session log. Schema asserts session-start before any other
  //     entry; doing this AFTER inject means the very first entry captures
  //     which files we touched.
  const { sessionLogger } = await import("../session/logger.js");
  await sessionLogger.start(state.sessionId, {
    projectRoot: process.cwd(),
    meta: {
      bridgePort: state.bridge.port,
      target: state.target ?? null,
      injectedFiles: state.injectedFiles,
      verifyMode: flags.verifyMode,
      strict: flags.strict,
      maxVariants: flags.maxVariants,
    },
  });

  // (7) Install signal handlers. Both SIGINT (ctrl-c) and SIGTERM (parent
  //     kill) trigger the same cleanup path. The handler is idempotent.
  let terminated = false;
  const cwd = process.cwd();
  const shutdown = async (signal: NodeJS.Signals | "internal"): Promise<void> => {
    if (terminated) return;
    terminated = true;
    // End the session log.
    try {
      await sessionLogger.end(state.sessionId, { projectRoot: cwd });
    } catch {
      // ignore
    }
    // Remove injected script tags, one file at a time.
    for (const filePath of state.injectedFiles) {
      try {
        const { removeLiveScript } = await import("../source/inject.js");
        await removeLiveScript(filePath, { projectRoot: cwd, sessionId: state.sessionId });
      } catch (err) {
        if (!flags.quiet) {
          process.stderr.write(
            `wisp-design live: could not remove script from ${filePath}: ${(err as Error).message}\n`,
          );
        }
      }
    }
    await safeStop(handle);
    await safeReleaseLock(lockPath);
    if (!flags.quiet) {
      process.stdout.write(`wisp-design live: stopped (${signal}).\n`);
    }
  };
  process.on("SIGINT", () => {
    void shutdown("SIGINT").then(() => process.exit(EXIT_OK));
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM").then(() => process.exit(EXIT_OK));
  });

  // Surface the boot details on stdout in machine-parseable form for any
  // wrapping skill that needs the URL programmatically.
  if (flags.quiet) {
    writeJsonResult({
      sessionId: state.sessionId,
      port: handle.port,
      token: handle.token,
      bridgeUrl: `http://127.0.0.1:${handle.port}`,
      injectedFiles: state.injectedFiles,
    });
  }

  // (8) Main poll loop. NB: routeEvent fan-out is intentionally sequential
  //     within a single batch — out-of-order accepts/discards corrupt the
  //     marker block. Concurrency is across BATCHES, not within one.
  const bridgeUrl = `http://127.0.0.1:${handle.port}`;
  const { pollOnce } = await import("./poll-loop.js");
  let cursor: string | undefined = undefined;
  while (!terminated) {
    let result: Awaited<ReturnType<typeof pollOnce>>;
    try {
      result = await pollOnce({
        bridgeUrl,
        token: handle.token,
        timeoutMs: 270_000,
        leaseMs: 30_000,
        cursor,
        transport: "long-poll",
      });
    } catch {
      // Bridge stopped or network error during shutdown — exit cleanly.
      if (terminated) break;
      // Brief settle before retry to avoid tight error loop.
      await new Promise<void>((r) => setTimeout(r, 500));
      continue;
    }
    for (const ev of result.events) {
      if (terminated) break;
      try {
        await dispatchEvent(ev, state, flags, cwd);
      } catch {
        // Per-event dispatch errors are non-fatal; the loop continues.
      }
    }
    cursor = result.cursor;
    // shouldRetry === true is the normal "bridge sliced" path — just continue.
  }

  return EXIT_OK;
}

// ---------------------------------------------------------------------------
// Cleanup helpers — never throw.
// ---------------------------------------------------------------------------

async function safeStop(handle: { stop: (graceMs?: number) => Promise<void> }): Promise<void> {
  try {
    await handle.stop(500);
  } catch {
    // ignore
  }
}

async function safeReleaseLock(lockPath: string): Promise<void> {
  try {
    await releaseLockfile(lockPath);
  } catch {
    // ignore
  }
}

// Suppress unused-import warning for randomUUID (used conceptually for future
// real LLM variant IDs; keep so the import survives tree-shaking).
void randomUUID;
