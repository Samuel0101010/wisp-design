// wisp-design hook dispatcher.
//
// Phase 0 contract: every hook drains stdin (Claude Code pipes hook payloads as JSON)
// and exits 0. This guarantees the Stop-hook p99 <100ms budget is met by construction
// during Phase 0 — the hot path is empty. Phase 4 wires UserPromptSubmit (4 Narrative
// Questions), Phase 5 wires Stop (Verification-Gate), Phase 6 wires SessionEnd
// (session-log flush). PostToolUse stays empty until Phase 5.

async function drainStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function runHook(name: string | undefined): Promise<number> {
  // Drain stdin regardless of which hook this is — leaving the pipe full would block
  // Claude Code's hook executor. The actual payload is unused in Phase 0.
  await drainStdin().catch(() => "");
  switch (name) {
    case "user-prompt-submit":
    case "post-tool-use":
    case "stop":
    case "session-end":
      return 0;
    default:
      // Unknown hook — exit 0 so we don't block the harness.
      return 0;
  }
}
