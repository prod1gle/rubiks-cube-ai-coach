# Implementation roadmap

Status: M0 and checkpoints M1A–M1C and user-requested M2A (verified full-cube solving) are complete. M1C delivers the interactive 3D Explorer and local playback. Persistent solve events, timing/capture, stage predicates, extended notation, and the remaining M2–M9 work are still pending. M2A implements part of the original M3 solver scope; it does not imply completion of M2 capture/persistence or M3 exact search/Next Best Move. See the root README and milestone reports for current behavior.

## Delivery sequence

| Milestone | Outcome | Dependencies | Relative effort / uncertainty |
| --- | --- | --- | --- |
| M0 | Inspect repository and agree on documented architecture and gates | None | Completed documentation baseline |
| M1A | React/Tailwind layout, local FastAPI health/CORS, managed tooling and scaffold tests | M0 | Implemented checkpoint; full M1 remains pending |
| M1B | Canonical cube engine, legal reachability, notation/HTM, stateless API and 2D inspector | M1A | Implemented checkpoint; see cube conventions and delivery report |
| M1C | Interactive Three/Fiber cube, safe animations, controls, local undo/redo and playback | M1B | Implemented; full timer/capture/history remains future work |
| M1 | Trustworthy cube-state foundation and minimal local harness | M0 | Medium; correctness-sensitive |
| M2 | Interactive 3D cube, timing, logging, persistent replay | M1 | Medium |
| M2A | User-requested checkpoint: bounded full-cube solver, engine verification, preview and solution playback | M1C | Implemented; exact proofs, Next Best Move, CFOP remain future work |
| M3 | Verified short-solution solver and minimum-move Next Best Move | M1–M2 | Medium–large; exact-search latency uncertain |
| M4 | Genuine CFOP and CFOP Next Best Move | M1–M3 | Large; F2L coverage is the main risk |
| M5 | Stage review, alternatives, parallel replay, case practice | M2–M4 | Large |
| M6 | History, progress analytics, algorithm trainer | M2, M4; M5 for linked practice | Medium |
| M7 | Guided physical cube scan with local OpenCV | M1–M2 | Medium–large; lighting and orientation uncertainty |
| M8 | Restricted visible-turn tracking and explicit recovery | M7; M5–M6 for gap-safe integration | Research-heavy; no universal tracking promise |
| M9 | Optional validated-fact AI explanations and release hardening | M3–M8 for integrated release | Medium; optional AI is independently deferrable |

Deliver a usable virtual coach through M6 before relying on continuous physical tracking. Scanning is valuable even if M8 cannot support fast unconstrained solves. Gates are binary for their stated scope; an experimental feature does not make an unfinished full-feature gate pass.

## M0 — Planning deliverables

Inspect all existing files and repository status; preserve the scaffold; document module ownership, state/metric contracts, delivery dependencies, acceptance tests, and risks. Finish with a proposed first milestone. No source, configuration, generated artifacts, installed packages, or application tests are introduced.

Exit: documentation links resolve and content accurately distinguishes current files from proposed files. See [M0 tests](ACCEPTANCE_TESTS.md#m0--documentation-only).

## M1A — Application scaffolding checkpoint

Implemented the React/TypeScript/Vite/Tailwind application shell, six distinct navigation destinations, explicit planned-feature pages, and a real backend health/retry panel. Added a FastAPI application factory, `/health` and `/api/health`, explicit local development CORS, uv-managed Python 3.12 environment, pytest/Ruff, and npm/uv lockfiles. The root README contains macOS installation, development, build, lint, and test commands. Existing hosting metadata is unchanged. No cube engine, timing, storage, solver, camera, or analytics has been implemented.

This checkpoint does not satisfy the full M1 state-inspector or cube-conformance gates. See [M1A acceptance](ACCEPTANCE_TESTS.md#m1a--application-scaffolding).

## M1B — Mathematically correct state engine checkpoint

Implemented a single immutable Python engine, documented geometry/indexing and cubie/frame conventions, all 18 face-turn variants, all 9 x/y/z variants, full-input parsing, inverse sequences, executed HTM, serialization/hashes, and necessary/sufficient ordinary-3×3 reachability validation. Added stateless validation/apply/sequence API endpoints and a 2D inspector that exclusively renders backend snapshots. Independent fixtures come from pinned cubejs, including arbitrary legal-coordinate cases and mixed grip rotations. See [M1B acceptance](ACCEPTANCE_TESTS.md#m1b--canonical-cube-state-engine) and [the delivery report](MILESTONE_1B.md).

This checkpoint stops before persistent sessions, event logs/WebSockets, stage predicates, solvers, timing, and 3D interaction. Wide/slice notation is explicitly rejected pending its separate implementation; full M1 acceptance is not claimed.

## M1 — Trustworthy cube-state foundation

Build the smallest reliable vertical slice:

1. Select supported Node/Python versions; establish React/TypeScript/Vite and FastAPI tooling, lockfiles, local start instructions, and a meaningful CI/check entry point. Record solver/oracle license compatibility and package viability. Preserve existing hosting metadata unless a later task needs changes.
2. Freeze canonical cubie indices, facelet diagrams, frame conventions, schema/hash format, parser grammar, and HTM version. Create independent golden fixtures before solver adapters.
3. Implement pure state transforms, rotations, required wide/slice compatibility, inversion, legal-state validation, solved/stage predicates, import/export, and verified-sequence evaluation.
4. Establish idempotent commands, session revisions, ordered events, initial-state storage, minimal SQLite migration, and exact replay/checkpoint validation.
5. Expose health, state validation, commands, and event stream. Provide a minimal accessible notation/state inspector, including useful invalid-state and disconnect handling.

Exit: [M1 acceptance tests](ACCEPTANCE_TESTS.md#m1--cube-state-foundation) pass on a documented reference environment from a clean checkout. Deliver a working state foundation, not solver/camera/UI placeholders. A professional 3D experience is M2. License uncertainty can block a particular solver choice without blocking pure engine work; settle adapter selection before M3 integration.

## M2 — Virtual solve capture and 3D cube

Implement the acknowledged-snapshot 3D renderer, keyboard/touch notation controls, camera orbit, move queue, rewind/step/reset, explicit input focus rules, dark responsive layout, and a 2D/text fallback. Add timer state machine (idle/inspection/ready/running/stopped, plus explicit practice pause), original move events, HTM/TPS, inactivity intervals, solve completion, persistent history basics, and replay after restart.

Keep move state/timing independent of animation speed. Treat imported or untimed logs as untimed. Target p95 local command acknowledgement under 50 ms with no solver load and under 100 ms with a background job on the documented reference laptop. These are targets to measure. No physical move metrics without a physical capture source.

Exit: [M2 gate](ACCEPTANCE_TESTS.md#m2--interactive-cube-and-capture), including browser interaction, ordering, persistence, timing, accessibility, and responsive layouts.

## M3 — Short solutions and bounded optimality

Integrate the selected established two-phase solver behind a contract, including cold start/table caching and native/fallback compatibility. Verify all candidates with the authority. Add budgeted exact HTM search for tractable cases, proof metadata, cancellation, and honest failure states. Bind minimum-move Next Best Move to the requested state revision and prefix predictions.

Initial targets: a verified candidate within 5 seconds warm for at least 95% of a fixed 200-state random-legal corpus on reference hardware; cancellation acknowledged within 250 ms and worker terminated within 1 second. Document cold-start latency separately. Measure a practical exact-search depth/time envelope; do not promise full-depth interactive optimal solving. If a target fails, report it and optimize or revise scope before calling the milestone complete.

Exit: [M3 gate](ACCEPTANCE_TESTS.md#m3--minimum-move-solver-and-next-best-move), including independently known small-depth optima and invalid solver output injection.

## M4 — Genuine CFOP

Build exact/budgeted Cross planning, a pair-aware F2L planner with slot preservation, and OLL/PLL case recognition, setups, algorithms, and AUF. Build the catalog manifest with original fixtures/provenance and verified variants. Support skips and tested cross-color frames. Expose full CFOP plans and next-stage/pair recommendations from arbitrary valid states. Surface verified partial plans/timeouts clearly.

Develop F2L in two internal steps: a documented restricted trainer slice, then general legal configurations, pair orders, and extraction cases. The restricted slice is not full CFOP acceptance. Do not use two-phase fallback under a CFOP label. Target a verified full CFOP plan within 10 seconds warm for at least 95% of the 200-state release corpus, with every state producing either a valid plan or an explicit bounded failure; tune after profiling.

Exit: [M4 gate](ACCEPTANCE_TESTS.md#m4--genuine-cfop), including complete OLL/PLL class coverage, a published F2L coverage matrix, preservation checks, and independent algorithm case fixtures.

## M5 — What Could I Have Done Instead?

Implement deterministic stage classification with editable annotations; exact boundary reconstruction; goal-specific alternative generation; cost/preservation/outcome comparison; linked scrubbers and independent replay branches; deterministic explanations; and practice from a saved state. Support same-endpoint and same-stage-goal comparisons explicitly. Unknown history disables affected comparisons. Saved alternative plans are versioned and never replace the original solve.

Exit: [M5 gate](ACCEPTANCE_TESTS.md#m5--counterfactual-review-and-practice), including a deliberately divergent alternative endpoint and correct continuation analysis.

## M6 — History, analytics, and trainer

Add search/filter/export/import, versioned analytics, Ao5/Ao12/result status handling, transparent eligibility filters, stage/pause trends, and case accuracy. Trainer supports verified setup, random AUF, recognition/execute modes, repeat case, and scheduling from actual attempts. Different valid algorithms are accepted by goal state rather than token equality. Provide clear empty states and no seeded performance history.

Exit: [M6 gate](ACCEPTANCE_TESTS.md#m6--history-analytics-and-algorithm-trainer), including deterministic analytics fixtures and data round trips.

## M7 — Guided webcam scanning

Implement permission/device flows, local frame transport, calibration, stable face capture, six-face orientation guidance, editable preview, full legality validation, and explicit user confirmation. Include rescan into a new state checkpoint without inventing a move path. Establish an initial measured envelope of supported cube types, backgrounds, lighting, resolution, and camera orientation.

Exit: [M7 gate](ACCEPTANCE_TESTS.md#m7--guided-webcam-scan), with real annotated scans and honest failure handling. No move tracking accuracy claim is included in this milestone.

## M8 — Observable-turn tracking and recovery

Collect/annotate consented real recordings, split by session/cube/user for held-out evaluation, implement temporal transition hypotheses and conservative abstention, and integrate continuity gaps, clock uncertainty, and resynchronization. Publish precision, recall, abstention, false-commit counts, and timing error across the operating envelope. Calibrate numerical probabilities or label scores as heuristic.

The release gate prioritizes avoiding false committed moves over accepting every turn. Unconstrained high-TPS tracking may remain unavailable. If real data does not meet the stated gate, keep tracking explicitly experimental/off by default and retain scanning/manual/virtual workflows; do not claim M8 complete. Additional cameras or a smart-cube integration are possible future projects, not hidden requirements for this plan.

Exit: [M8 gate](ACCEPTANCE_TESTS.md#m8--physical-move-tracking-and-resynchronization), including adversarial hidden-turn/no-turn ambiguity and gap-safe downstream analysis.

## M9 — Optional explanations and local release

Add optional provider configuration and a fact-bound explanation adapter that selects approved templates/fact references, with rejection/fallback tests. Ship deterministic explanations regardless. Validate clean install, bundled production build, offline core use, migrations, backup/restore, browser/camera compatibility, local-origin security, worker shutdown, and user-visible feature availability. Document measured budgets, dataset limitations, third-party notices, and unresolved research limits.

Exit: [M9 gate](ACCEPTANCE_TESTS.md#m9--optional-ai-and-release), with zero-network operation for core features. A production virtual-coach release may precede M8 only if tracking is explicitly excluded from its release scope.

## How milestones are reported

Each implementation change should identify scope, passed acceptance IDs, actual commands/results, fixture versions/seeds, hardware/browser versions for measurements, known limitations, and remaining blockers. No milestone is complete merely because UI buttons exist. Do not record planned tests as passed or synthetic video as real tracking evidence.

## User-requested M2A — delivered

Full-cube two-phase solving is available in the Explorer. Inputs and proposed outputs pass the canonical engine; the API returns notation, HTM, elapsed computation time, unproven optimality metadata, and a verified animation plan. Tests cover known/random scrambles, all grips, invalid states and candidates, worker errors/budgets, and state-bound frontend playback/cancellation. See [M2A evidence](MILESTONE_2A.md). Original numbered milestones above remain planning gates; no CFOP, minimum-move proof, timer, or persistence work is claimed by this checkpoint.
