# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

`@side-quest/community-intel-cache` is a CLI tool and library that automates community intelligence gathering for Claude Code plugin skills. It queries `@side-quest/last-30-days` for Reddit/X/web results, optionally synthesizes them via `claude --print`, and writes cached markdown + raw JSON to disk. A review workflow lets consumers accept/reject individual findings before they reach end-user context.

## Commands

```bash
bun dev                  # Watch mode (runs src/index.ts)
bun run build            # Build via bunup (ESM, Bun target, code-split)
bun test --recursive     # Run all tests (currently no test files exist)
bun run check            # Biome lint + format (write mode)
bun run typecheck        # tsc via tsconfig.eslint.json
bun run validate         # Full pipeline: lint + typecheck + build + test
```

### CLI Usage (the built artifact)

```bash
# Refresh cache (gather + synthesize + write)
bunx @side-quest/community-intel-cache refresh \
  --config ./community-intel.json --cache-dir ./cache

# Force refresh (ignore staleness)
bunx @side-quest/community-intel-cache refresh \
  --config ./community-intel.json --cache-dir ./cache --force

# Custom lookback window (default: 7 days, range: 1-365)
bunx @side-quest/community-intel-cache refresh \
  --config ./community-intel.json --cache-dir ./cache --days 14

# Skip LLM synthesis (raw markdown only)
bunx @side-quest/community-intel-cache refresh \
  --config ./community-intel.json --cache-dir ./cache --no-synthesize

# Reset cache files
bunx @side-quest/community-intel-cache reset --cache-dir ./cache

# Extract unreviewed findings from staged data
bunx @side-quest/community-intel-cache extract --cache-dir ./cache

# Record review decisions
bunx @side-quest/community-intel-cache review \
  --cache-dir ./cache --hashes hash1,hash2 --decision accepted
```

## Architecture

Two entry points in `bunup.config.ts`: `src/index.ts` (library) and `src/cli.ts` (CLI binary).

### Pipeline (refresh command)

```
community-intel.json --> cli.ts (parseCliArgs)
                           |
                    cache.ts (isCacheFresh) --> exit early if fresh
                           |
                    gather.ts (gatherTopics) --> parallel bunx @side-quest/last-30-days calls
                           |
                    synthesize.ts (synthesize) --> claude --print with stdin piping
                           |  (falls back to format.ts on failure)
                    format.ts (formatMarkdown) --> raw markdown fallback
                           |
                    write.ts (writeCacheFiles) --> atomic writes: staged-intel.md, staged-raw.json, last-updated.json
```

### Review workflow (extract + review commands)

```
staged-raw.json --> extract.ts (extractFindings) --> flat Finding[] with SHA-256 URL hashes
                         |
                  reviewed-hashes.json --> filter out already-reviewed
                         |
                  cli.ts review --> append accept/reject to reviewed-hashes.json
```

### Key files

| File | Purpose |
|------|---------|
| `src/cli.ts` | CLI entry point, arg parsing, command dispatch. Always exits 0 (never blocks hooks). |
| `src/types.ts` | All shared types + config defaults + timeout constants |
| `src/gather.ts` | Parallel `@side-quest/last-30-days` queries via `@side-quest/core/spawn` |
| `src/synthesize.ts` | LLM synthesis via `claude --print` with stdin piping |
| `src/cache.ts` | Staleness checking, interval calculation (30d full / 7d thin), backoff (4h) |
| `src/extract.ts` | Finding extraction from raw reports, SHA-256 URL hashing, dedup |
| `src/format.ts` | Raw markdown fallback (no LLM) - topic-by-topic, source-by-source |
| `src/write.ts` | Atomic file writes via `@side-quest/core/fs` (content first, metadata last) |
| `src/diagnostics.ts` | Error collection + JSON status emission to stdout |

### Cache files (written to --cache-dir)

| File | Purpose |
|------|---------|
| `staged-intel.md` | Synthesized (or raw) markdown for skill consumption |
| `staged-raw.json` | Raw `Last30DaysReport[]` for finding extraction |
| `last-updated.json` | `CacheMetadata` with `next_update_after` for staleness |
| `reviewed-hashes.json` | Persisted review decisions (`ReviewedHashes`) |

### Dependencies

- `@side-quest/core` - Shared utilities (fs atomic writes, spawn with timeout, SHA-256 hashing)
- `@side-quest/last-30-days` - Research CLI queried at runtime via `bunx`

### Design decisions

- **Always exits 0** - The CLI is designed for Claude Code hooks, so it must never block the tool
- **Content-first write ordering** - staged-intel.md is written before last-updated.json; if process crashes mid-write, missing metadata means "stale" (safe), not "fresh with missing content" (unsafe)
- **Self-healing cache** - When <50% of queries succeed, uses 7-day interval instead of 30-day so cache recovers faster
- **4-hour backoff** - When all queries fail, backs off instead of retrying immediately

## Code Conventions

| Area | Convention |
|------|------------|
| Files | kebab-case (`my-util.ts`) |
| Functions | camelCase |
| Types | PascalCase |
| Exports | Named only (no defaults) |
| Formatting | Biome: tabs, single quotes, 80-char lines, semicolons as-needed |
| Tests | Colocated `*.test.ts` or in `__tests__/` (line width relaxed to 100) |

## Git Workflow

**Branch pattern:** `type/description` (e.g., `feat/add-feature`)

**Commits:** Conventional Commits enforced by commitlint + Husky

**Before pushing:** Always run `bun run validate`
