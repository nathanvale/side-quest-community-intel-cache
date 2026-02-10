---
'@side-quest/community-intel-cache': major
---

Add finding extraction and review workflow

BREAKING CHANGE: Cache files renamed from `community-intel.md` to `staged-intel.md`. Existing caches will be treated as stale and re-generated on next refresh.

- Add `extract` command to get unreviewed findings from staged raw data
- Add `review` command to record accept/reject decisions for findings
- Add JSON shape validation to prevent malformed gather results
- Add prompt injection protection in synthesis prompts
- Skip synthesis when all results are empty to prevent hallucinated findings
- Write `staged-raw.json` alongside synthesized markdown for finding extraction
- Track review decisions in `reviewed-hashes.json`
