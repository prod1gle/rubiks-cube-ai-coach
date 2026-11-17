# Milestone 4 — persistence and training

SQLite lives at `cubiq/backend/.data/cubiq.sqlite3`, overridable with CUBIQ_DB_PATH. No runtime fixtures or training performance records are inserted. All write endpoints validate legal cube states and recompute outcomes server-side.

Schema migration 001: immutable `solves` (raw recording, initial state, capture source/status, server save time, content hash); ordered `moves` (monotonic input/ack times, engine before/after hashes, nullable confidence); `analyses` (engine/catalog/analytics version tuple, original raw data retained); `practice_attempts` (initial state, notation, case/version, verified outcome, source). Foreign keys cascade solve deletion. Missing confidence means unmeasured, never 100%. `schema_migrations` records successful transactional migrations. Connections are request-local with foreign keys and a busy timeout; WAL supports concurrent readers. Local single-user service, not a remote authenticated deployment.

Finalized manual runs autosave with stable recording UUIDs. The UI reports failure and offers retry. Session-local interrupted drafts survive in the existing browser transfer; no timing continuity across restarts is inferred. Reanalysis is deterministic and adds a version; it never rewrites raw moves. Analysis starts from immutable initial state and checks every accepted hash.

Dashboard: completed manual virtual solves only, no stopped runs in performance statistics. HTM mean includes completed uncertain runs; PB/TPS require valid positive time. Eligible counts and unavailable values are visible. Trends show the latest 30 completed records. No WCA averages, physical turning rates, extrapolated improvement, or invented records.

Trainer: all 57 OLL and 21 PLL registry classes; 24 coordinate-identified single-pair F2L insertion states derived from verified macros. Conventional F2L completeness is not claimed. Every setup is the inverse of its displayed algorithm in white-down/green-front grip, recognized with the existing registry/coordinates and engine verified. OLL accepts orientation with F2L preserved; PLL accepts permutation up to AUF; F2L protects initial cross and slots. Playback is a demonstration and cannot be recorded as a practice attempt. Virtual retry outcomes persist, with execution time unavailable.

Acceptance tests:
- Fresh and repeated migrations, exact save/reopen in a new app/database instance, immutable duplicate detection, invalid-record rejection, pagination, missing identifiers and cascading deletion.
- Deterministic reanalysis with same version and retained previous-version result after a version bump.
- Empty genuine dashboard, accurate PB/TPS/HTM/count eligibility for valid, uncertain and stopped fixtures.
- All 102 training cases recognized, legal, solved by the advertised algorithm; blank attempts fail; outcomes persisted/idempotent and forged success rejected.
- Retrospective practice persists only server-validated results.
- Frontend real-data navigation, loading/errors/retry, history selection/delete confirmation, empty metrics, trainer exact reset, successful retry, playback exclusion.

Fixtures are synthetic and confined to tests; restart integration tests use temporary SQLite files. Run the commands in the root README for the full suite and production build. Physical camera measurements remain outside this milestone.

Verification in this checkout: full backend **1,138 passed**, full frontend **133 passed**, TypeScript/Vite build, ESLint, Ruff check/format and Python source/wheel packaging passed. Independent second-agent persistence run: **110 passed**. Restart durability is demonstrated by reopening the same temporary SQLite database in a newly created application. Browser inspection verified genuine empty dashboard, registry-loaded 3D trainer, animation completion and exact repeat controls; no runtime performance fixtures were created.
