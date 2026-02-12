---
"@side-quest/community-intel-cache": minor
---

Support @side-quest/last-30-days v0.1.1 --refresh flag and metadata fields

- Pass `--refresh` to last-30-days when `--force` is used, bypassing its internal per-source cache
- Add optional v0.1.1 metadata fields to `Last30DaysReport` type (days, generated_at, mode, model info, best_practices, prompt_pack, context_snippet_md)
