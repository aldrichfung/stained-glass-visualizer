# Defect log — suite-flagged, investigation-confirmed

Convention (standing rule, 2026-11-28):

- **Entry criteria:** the e2e suite flagged a test failure, and the follow-up
  investigation concluded the failure correctly identified a **real app defect**.
- **Exclusions:** failures caused by test flakiness, outdated assertions after
  intended product changes, or environment/infrastructure issues are suite
  maintenance — they are never logged here.
- **Entry contents:** date, flagging test(s), defect summary, root cause, fix
  commit, and the regression test that now guards it (if any).

## Entries

_No confirmed entries yet — log established 2026-11-28._

## Historical note (predates this log's criteria)

Past defects in this project were user-reported rather than suite-flagged, so
they don't qualify as entries. Recorded here for context only:

- **Pad prebake wrong-image fallback** (fixed 2026-11-26, commit `2a9ce8d`):
  user-reported slow first press on 3rd/4th pads; root cause was the prebake
  loop falling back to the active image, flooding the scene cache with
  wrong-image scenes. Guarded by E24/E25.
- **E15 video-repro regression**: a defect captured from a user's screen
  recording, encoded as E15.
- **Contain-mode arch black box** (under investigation 2026-11-28): wide images
  (aspect > 1.61) in Contain fit degenerate the gothic-arch opening (springing
  line below the box bottom). User-reported; would become a log entry only if a
  future suite test flags a recurrence.
