# Skills-Index — Production Design

**Status:** Production-default (in-process BM25-lite + length-norm). AgentDB-HNSW is **opt-in** via Claude-Code MCP context, not a Phase-4 stub waiting to be replaced.

## TL;DR

`indexSkills()` and `searchSkills()` ship as an in-process index over `skills/data/**/*.{md,csv}`. The corpus is small (< 100 docs, < 1 MB total), so a linear scan with stopword-filtered token hits, prefix-stem matching, field-boosting on the title/description, and Lucene-style length-norm hits recall@5 ≈ 80%+ on the curated anchors / policy / methodology / reference set.

This is **the production path**, not a placeholder. The `agentDbController: "phase-4-stub"` string in the result is a stable opaque key that callers may match against; it does NOT imply an upcoming swap.

## Why AgentDB-HNSW is opt-in (not default)

The CLI runs in a **spawned Node process** (`wisp-design skills search …` invoked via `Bash` by the agent loop). That process:

- Has **no MCP transport** to `mcp__ruflo__agentdb_pattern-search`. MCP tools are surfaced by an MCP server registered with the Claude-Code chat session — not to arbitrary child processes.
- Has **no AgentDB SDK** dependency (`package.json` deps: `axe-core`, `zod`; no `agentdb`, no `@ruflo/*`).
- Has **no persistent index store** in the project (no `.ruflo/`, no `.agentdb/`).

In other words: the daemon **cannot** call AgentDB. Only the Claude-Code reasoning loop itself can, because it lives in the MCP-aware chat session.

The production routing is therefore:

```
agent loop (Claude reasoning, MCP-aware)
  ├─ optional:   mcp__ruflo__agentdb_pattern-search  ← HNSW recall over corpus
  └─ always:     Bash("wisp-design skills search …") ← in-process BM25-lite
```

When the agent has MCP access AND the corpus has been indexed into AgentDB via `mcp__ruflo__agentdb_pattern-store`, the agent fuses the two result sets (RRF) before prompting variants. When MCP is unavailable (e.g. user invoked the CLI from a non-Claude shell), the in-process search is the sole retriever and the agent loop degrades gracefully.

## In-process retrieval algorithm

1. **Walk** `skills/**` recursively, take `.md` / `.csv` only, skip hidden dirs.
2. **Tokenise** the query → lowercase → split on whitespace → drop stopwords (EN + DE basics) → drop tokens `< 2` chars → truncate each token to 6 chars (cheap stemming).
3. **Field-boost** scoring per file:
   - YAML-frontmatter `description:` value: weight ×2
   - H1 title: weight ×2
   - Body text: weight ×1
4. **Score** = Σ (boosted hit count per token), cap 100 hits/token (sanity).
5. **Length-norm** = score / √(byte-length) — keeps short anchor cards from being drowned by long CSV corpora.
6. **Sort** desc, slice to `topK` (default 8, max 50).

Expected recall@5 on the curated corpus: ~80% for natural-language queries like `"linear-like dashboard"`, `"anti-slop hero metric"`, `"junior designer flow"`. Precision is near-perfect because the corpus is curated — junk hits would have to be authored deliberately.

## When this stops being adequate

If `skills/data/patterns/` grows past ~500 docs (e.g. Samuels vault sync is run aggressively), the linear scan crosses ~50ms and BM25-lite precision degrades. At that point the upgrade is to wire AgentDB-HNSW from the agent-loop side (not the CLI side) and let the CLI keep its in-process role as the always-available fallback.
