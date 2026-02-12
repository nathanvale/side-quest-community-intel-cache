# Changelog

## 1.3.0

### Minor Changes

- [#15](https://github.com/nathanvale/side-quest-community-intel-cache/pull/15) [`6388e4f`](https://github.com/nathanvale/side-quest-community-intel-cache/commit/6388e4f87d9349029652597405ab933e5681facc) Thanks [@nathanvale](https://github.com/nathanvale)! - Support @side-quest/last-30-days v0.1.1 --refresh flag and metadata fields

  - Pass `--refresh` to last-30-days when `--force` is used, bypassing its internal per-source cache
  - Add optional v0.1.1 metadata fields to `Last30DaysReport` type (days, generated_at, mode, model info, best_practices, prompt_pack, context_snippet_md)

## 1.2.0

### Minor Changes

- [#13](https://github.com/nathanvale/side-quest-community-intel-cache/pull/13) [`2ea0d4c`](https://github.com/nathanvale/side-quest-community-intel-cache/commit/2ea0d4c81f23281a28ed63c027344dc98bbf6ace) Thanks [@nathanvale](https://github.com/nathanvale)! - feat: add minimum quality filter to finding extraction - filters out low-score and short-summary findings via configurable minScore (default 25) and minSummaryLength (default 40) thresholds

## 1.1.0

### Minor Changes

- [#10](https://github.com/nathanvale/side-quest-community-intel-cache/pull/10) [`594f488`](https://github.com/nathanvale/side-quest-community-intel-cache/commit/594f4886e33dc75e511c14aa6caa8b6c18c8505b) Thanks [@nathanvale](https://github.com/nathanvale)! - feat: add --days CLI parameter for configurable lookback window (1-365); default changed from 30 to 7 days

## 1.0.0

### Major Changes

- [#6](https://github.com/nathanvale/side-quest-community-intel-cache/pull/6) [`2311d8c`](https://github.com/nathanvale/side-quest-community-intel-cache/commit/2311d8c609fb2b5690630c4da84c631d46fe1c8d) Thanks [@nathanvale](https://github.com/nathanvale)! - Add finding extraction and review workflow

  BREAKING CHANGE: Cache files renamed from `community-intel.md` to `staged-intel.md`. Existing caches will be treated as stale and re-generated on next refresh.

  - Add `extract` command to get unreviewed findings from staged raw data
  - Add `review` command to record accept/reject decisions for findings
  - Add JSON shape validation to prevent malformed gather results
  - Add prompt injection protection in synthesis prompts
  - Skip synthesis when all results are empty to prevent hallucinated findings
  - Write `staged-raw.json` alongside synthesized markdown for finding extraction
  - Track review decisions in `reviewed-hashes.json`

## 0.1.0

### Minor Changes

- [#4](https://github.com/nathanvale/side-quest-community-intel-cache/pull/4) [`b990912`](https://github.com/nathanvale/side-quest-community-intel-cache/commit/b9909120a2e4c0e34d6ec273fdbb1d946de4795a) Thanks [@nathanvale](https://github.com/nathanvale)! - Implement community-intel-cache CLI with gather, synthesize, and caching pipeline

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Initial release.
