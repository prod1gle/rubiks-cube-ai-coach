# Milestone 3 — reliable manual-mode timer and analysis

Delivered November 15, 2026. Live Solve now captures manual virtual cube input with optional practice inspection, keyboard/button moves, explicit pauses and canonical-engine completion. Solve Analysis validates every state and timestamp, provides an interactive timeline/TPS chart, reconstructs CFOP checkpoints, and connects each nonempty stage interval to the existing retrospective coach. This is the user's timer/analysis milestone, distinct from the original roadmap M3 exact optimal-search gate.

## Capture contract and clock behavior

`features/timer/TimerController.ts` is a testable state machine with injected engine transport, monotonic/wall clocks and storage. It accepts `ready → inspection → running ↔ paused → complete/stopped`, with `stopping` while pending moves validate and `interrupted` for capture/clock failure. Solved initial states cannot start a solve. Preparation/import/scramble is outside timing. Space release starts/stops, face/grip keys and buttons enter one move, Shift selects prime, P pauses/resumes and Escape stops. Text/form editing does not enter moves. No timed algorithm batching, undo/rewrite or automatic solver completion is provided.

`performance.now()` stamps the original input intention relative to a start origin. A serialized queue sends one move at a time to the canonical engine and verifies each plan's input and state chain. Accepted entries retain submission time, acknowledgement time, token and before/after state hashes. Delayed replies never change input timestamps. The first acknowledged solved state completes at its original input time, even if acknowledgement arrives after Pause/Stop. Subsequent queued inputs are not applied and are disclosed. A manual Stop waits for earlier submitted inputs before finalizing the accepted record. Total elapsed derives from timestamps, not display ticks.

The Live Solve cube renders accepted states immediately. It does not throttle timed inputs behind animation. Existing Explorer and retrospective animation paths remain available separately. All cube legality, move/frame transformations, solvedness, counts and stage predicates stay in Python.

Optional inspection is a 15-second practice countdown with separate duration and overrun flag. Starting remains explicit; no WCA penalty/certification is claimed. Explicit pauses leave elapsed time running and subtract only from active practice time. Hidden-page, wall/monotonic clock divergence (over two seconds), invalid clock progression, failed input and page exit mark uncertainty/interruption; inspection uncertainty is carried into the solve. Wall time is only a continuity diagnostic, never the elapsed clock. Conservative uncertainty suppresses time statistics; it does not invent missing moves or abandon validated state checkpoints.

The latest schema-1 recording is kept in browser session storage, including unfinished drafts marked `interrupted`, and exposed as copyable JSON. No durable SQLite solve history, automatic restart/resume across clock origins, permanent analytics database, physical camera tracking or learned personalization is claimed. Core operation remains local after installation. Limits are 1,024 moves, 64 queued inputs, 1,024 explicit pause intervals and a 24-hour recording duration. Retrospective branches retain their existing 128-action segment cap.

## Backend validation and deterministic formulas

`POST /api/cube/recordings/analyze` accepts `TimedRecording`: source `manual-virtual`, clock source `performance.now`, clock ID/start origin, legal initial state, ordered moves with monotonic relative input/acknowledgement times and state hashes, elapsed/inspection milliseconds, explicit pause intervals, completion status, timing-integrity notes and expected final hash. It validates strict schema, finite bounded numbers, monotonic input order, pause ordering, one token per event, every canonical transition, final hash and the first solved endpoint. Complete runs require elapsed equal to the final solving input time. Non-finite request values return 422 without crashing FastAPI's error serializer; schema responses omit unsafe raw inputs.

`coach.recordings.analytics` has no clock/network/model dependency. It computes:

| Metric | Definition / limitation |
| --- | --- |
| Total elapsed | Stop timestamp or first solving input timestamp minus start; includes all explicit pauses. |
| Active practice | Total elapsed minus overlap with explicit practice pause intervals. |
| HTM / rotations | Engine-parsed face turns, doubles counted once; x/y/z cost zero HTM and one rotation action each. |
| Input TPS | HTM × 1,000 / reliable positive elapsed milliseconds. |
| Active input TPS | HTM × 1,000 / reliable positive active practice milliseconds. |
| Moving TPS | Unavailable: manual input has no measured physical turn-start/end intervals. |
| Input inactivity | Full no-input intervals ≥1,000 ms, including initial/final waits; explicit pause portions are removed first. Never labeled measured hand-motion pauses. |
| TPS chart | HTM per observed bin second; normal bins are one second, adaptive widths bound long runs to 600 bins. Last partial bin uses actual width; final-boundary inputs are included once. |
| Efficiency | Full/stage adjacent-token simplification independently applied to prove identical endpoint/frame. Exact Cross projection distance appears only for a Cross-only interval. No global full-solve proof or predicted speed savings. |

Zero or unrepresentably small durations yield unavailable rates, never NaN/Infinity. Interrupted or uncertain timing yields null time/rate/gap statistics and no TPS series; exact accepted move counts/states remain available. Inspection time/overrun is also withheld when timing is uncertain. The response carries engine-derived checkpoints with canonical states/hashes, event metadata, group intervals, milestones, raw predicate transitions, explicit pauses, gaps, notes and version `manual-checkpoints-1`. Client clocks are reported provenance, not calibrated physical timing evidence.

## CFOP checkpoint convention

All predicates use the existing fixed white-down reference. The deterministic policy is:

1. Locate the first Cross-solved state. Goals already eligible at the initial state are `initially_satisfied` with no invented move interval.
2. Track completed F2L slots. Accept a new pair checkpoint only when Cross and all previously completed slots are solved. Several pairs first eligible at one state form one combined group, with no invented internal order or individual durations. Cross plus incidental pairs can also form one combined interval.
3. Once all four slots are simultaneously protected, locate OLL, then PLL up to AUF, then full solvedness. If a goal is already satisfied at its prerequisite boundary, mark `skipped_at_prerequisite`; do not invent a separate algorithm or duration.
4. Stage intervals are contiguous between these observed state checkpoints. Pending goals remain pending. Any trailing observed time not assigned to a new checkpoint is reported separately.
5. Preserve every raw predicate attainment/loss, including individual pair events independent of Cross eligibility. Temporary breakage inside an algorithm does not automatically restart a human stage. These intervals are inferred mathematical progress, not proof of the solver's method, recognition times or intentions. Combined attribution is explicitly ambiguous.

Every group includes exact start/end indices/hashes, actual notation, HTM/rotation counts, total/active duration when available, ambiguity status and local efficiency metadata. A stage card supplies the original timed record and precise indices to milestone 2D analysis; its alternatives start from the identical original state, preserve the selected objective, and retain unproven full-solve optimality labels. Empty/skipped goals have no actual segment to compare. Intervals over 128 actions are explicitly marked for shorter manual selection.

## UI behavior

Live Solve is a real navigation destination. It provides preparation/import, accessible notation variants, immediate engine state display, inspection/elapsed digits, phase/queue/error states, explicit pause/resume/Stop, solved confirmation, analysis handoff and raw recording inspection.

Timed Solve Analysis adds real elapsed/active/input-TPS/count cards, an accessible interactive SVG chart, discrete move timeline, exact backend checkpoint inspection in the 3D viewer, raw move selection, stage cards, initial/skipped/pending milestone chips and pause/integrity explanations. Chart bins, slider, previous/next and tokens select engine states without frontend permutations. Request abort/serial/hash guards reject stale checkpoint or analysis replies. Changing a retrospective range/settings still invalidates the old comparison. The older untimed-record review remains available below the report.

## Automated verification

All commands are in the root README. No dependency was added. Environment: macOS ARM64, Python 3.12.3 / uv 0.13.7, Node 22.17.1 / npm 10.9.2.

| Check | Result |
| --- | --- |
| Full backend pytest | 1,028 passed in 61.88 seconds on the final run. |
| Full frontend Vitest | 128 passed across ten files in 17.28 seconds on the final run. |
| TypeScript + Vite production build | Passed. |
| ESLint, zero warnings | Passed. |
| Ruff lint / format | Passed. |
| Offline backend source/wheel packaging | Passed; recording analytics and existing solver registry resources included. |
| Git whitespace / local Markdown links | Passed. |

The 53 new backend tests use explicitly synthetic test clocks around real engine states. They verify independent arithmetic (2,500 ms elapsed / 500 ms pause / 3 HTM gives 1.2 overall and 1.5 active input TPS); input-gap subtraction; partial-bin boundaries; combined Cross/F2L goals; AUF-only initial skips; uncertain/zero/tiny durations; rotation-only and partial records; all 24 user frames; six full synthetic CFOP records (seeds `0x3000 + [0..5]`), contiguous stage counts/durations and exact group endpoints; local simplification; malformed hashes/times/pause intervals/completion claims; and the HTTP endpoint including non-finite validation failure.

Frontend tests inject clocks and delayed acknowledgements to verify original timestamps, rapid queue order, solved detection after Pause, Stop with pending input, inspection/overtime and inspection uncertainty, clock/background failure (including inspection and preservation after completion), stale/unmounted replies, strict engine-chain checks, keyboard focus/variants, explicit pauses, exact source recording, chart/timeline selection, unavailable physical moving TPS and direct stage-to-retrospective handoff. Navigation tests now verify Live Solve. Earlier canonical engine, full solving, CFOP, coaching and comparison regressions remain included.

`cubiq/src/test/timed-recording.json` is labeled `test_data: true`, describes synthetic timestamps, and uses `SYNTHETIC-TEST-CLOCK`. Its generator is `cubiq/scripts/generate-timed-fixtures.py`. Neither test fixture nor generator is imported by runtime code. No synthetic recording is loaded as a user demo or performance history.

## Running-app evidence

Used actual browser controls, real monotonic timestamps, local HTTP and the actual Three.js cube:

- Prepared `z2 B U' B'` in Explorer and imported its actual viewed facelets into Live Solve. Inspection lasted **6,679.7 ms**.
- Started the run, entered `y`, `R`, paused, resumed, entered `U`, then `R'`. Submission times were **284.8**, **566.0**, **9,066.1**, **9,634.6 ms**. The final engine acknowledgement arrived at **9,645.0 ms**; the result correctly stopped at the earlier final input time.
- The explicit pause ran from **850.9 to 8,784.5 ms**, totaling **7,933.6 ms**. Analysis showed **9.63 s elapsed**, **1.70 s active**, **3 HTM**, **one rotation**, **0.31 overall input TPS**, **1.76 active input TPS**, and unavailable physical moving TPS. These are automated virtual UI QA observations, not a human speedcubing result or performance claim.
- Analysis recognized initial Cross / FR / FL / BL, the BR pair interval and OLL/PLL/AUF skips at its endpoint. The timeline loaded the exact rotated state after `y`.
- The BR stage action opened the retrospective coach with original hash `5cf980e9ef2251ee3d36bb237e744130ab2e740ac88c00b529a1acaf02115bcc`, indices 0–4 and the actual timed sequence. It offered verified `B U B'` versus actual `y R U R'`: equal HTM and one fewer rotation, with no invented execution speed.
- Checked Live Solve and timed analysis at 1280×900 desktop and 390×844 mobile widths without horizontal document overflow. Chart selection loaded the exact state after the second input. Browser warning/error logs were empty, the temporary viewport override was reset, and desktop evidence was saved at `/private/tmp/cubiq-milestone-3.png`. The latest recording was reanalyzed after refresh; no continuing clock was invented across reload.

## Files and stopping scope

New backend: `coach/recordings/{__init__,analytics}.py`, strict recording models/endpoint in `coach/api/cube.py`, safe schema-error handling in `coach/main.py`, and `tests/test_recordings.py`. New frontend: `features/timer/{TimerController,LiveSolve,recording}`, controller/UI tests, `features/analysis/TimedSolveReport` and tests. Updated typed API, Solve Analysis integration, route/navigation/dashboard/milestone metadata and responsive styles. Added synthetic fixture/generator and documentation updates.

Reliable manual virtual recording and analysis are implemented. Permanent multi-solve history, competition timer certification/penalties, physical scanning/tracking, measured physical moving TPS, learned personalization, color-neutral CFOP and full-solve optimality proofs remain outside this checkpoint. Services remain stateless calculations; only the latest session-local recording is stored in the browser. The existing bounded solver/retrospective runtime limits still apply. This task stops at manual-mode analysis.
