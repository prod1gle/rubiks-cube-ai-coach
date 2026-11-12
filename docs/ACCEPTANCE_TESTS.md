# Milestone acceptance tests

Status: M0 is verified through repository/document inspection. M1A and M1B checkpoints are implemented and verified; the full M1–M9 gates remain future specifications. Test IDs are stable references for implementation reports. Historical M1A counts reflect that checkpoint; current results are in the M1B report.

## Test evidence rules

Each milestone requires its own gate plus all prior applicable regressions. Save fixture versions, deterministic seeds, actual commands and outputs, runtime/library versions, and failure counts. Integration tests must exercise the real engine and adapter; injected results are allowed only in clearly identified failure tests. Browser evidence must use the running local application. No fabricated solve history or recorded benchmark results.

Use pytest/Hypothesis for Python domain and integration tests, an independent established cube library for differential checks, frontend contract/component tests, and Playwright for end-to-end behavior. Performance measurements use a named reference laptop and fixed corpus; publish cold/warm p50/p95 and failures rather than one favorable example. Real camera tests use consented, labeled recordings and manual state ground truth. Synthetic images test transforms and recovery logic only.

## M0 — Documentation only

| ID | Check | Acceptance |
| --- | --- | --- |
| M0-01 | Inspect root, hidden files, complete scaffold, Git state, and applicable instructions | README inventory matches actual files, missing source/tests are stated, and pre-existing untracked content is preserved. |
| M0-02 | Review documentation links and delivery scope | README, architecture/tree, roadmap, decisions, acceptance tests, and risks exist; relative links resolve; proposed files/features are explicitly planned. |
| M0-03 | Review change scope | Only documentation is added. No application/configuration changes, packages, generated UI, executable tests, deployment, or application implementation. |

## M1A — Application scaffolding

| ID | Check | Evidence / acceptance |
| --- | --- | --- |
| M1A-01 | Reproducible frontend/backend install and local run | npm lockfile and uv lockfile; managed backend `.venv`; real Vite/FastAPI startup and proxied health response. Exact commands in root README. |
| M1A-02 | All six navigation destinations work | Frontend tests exercise navigation, direct routes, active links, title/focus changes, and unknown-route recovery. Browser checks cover navigation, reload, and back/forward. |
| M1A-03 | Unimplemented features are honest | Planned workflow pages explicitly say “Not implemented yet”; Dashboard has no invented solve metrics. Decorative cube is identified as an illustration. |
| M1A-04 | Actual health and local CORS | Frontend tests cover success, retry after failure, malformed JSON shape, and HTTP error. Nine backend tests cover both health paths, local/denied CORS, and absent cube routes. |
| M1A-05 | Build, lint, tests, and responsive layout | Frontend TypeScript/Vite build, ESLint, 10 Vitest tests; backend pytest, Ruff checks/format, wheel/sdist build. Browser desktop/mobile checks inspect overflow and feature availability. |

These checks establish only the application scaffold. They do not constitute the full M1 cube-state foundation gate.

## M1B — Canonical cube-state engine

| ID | Check | Evidence / acceptance |
| --- | --- | --- |
| M1B-01 | One documented immutable canonical model | `coach.cube.CubeState` owns cubies/frame. Conventions freeze all face orientations, sticker indices, piece orientations, notation, schema, and hashes. Mutable input/output arrays cannot alias live state. |
| M1B-02 | Face turns and grip rotations | All 27 variants pass two-sided inverse identities; every quarter turn repeated four times is identity. Rotations preserve canonical cubies/position hash, remap later face turns, and have zero HTM. All 24 proper frames round trip nonuniform states. |
| M1B-03 | Independent conformance | Published R-turn coordinates and sticker-index fixtures; 32 named cubejs states, 1,000 seeded sequences, and 128 independently sampled legal states/continuations agree exactly. Scrambles and inverses cancel. |
| M1B-04 | Parsing, serialization, and metric | Complete parse or rejection with position; grouping/primes/doubles normalize; unsupported notation/limits fail clearly. Serialization round trips and preserves exact grip; HTM counts executed outer actions without cancellations. |
| M1B-05 | Necessary/sufficient reachability constraints | Exact color counts/centers, real handed pieces, unique permutations, twist sum, flip sum, and parity are checked. Isolated twists/flips, odd two-piece swaps, reflected centers, mirrored/duplicate cubies, and malformed schema are rejected. Balanced legal coordinate assignments are accepted. |
| M1B-06 | Actual stateless API | Solved/import/apply/sequence endpoints call the engine; valid states round trip; errors return 422 with actionable details. Invalid sequences do not mutate supplied state. Local POST CORS and OpenAPI routes are tested. |
| M1B-07 | Frontend reflects backend only | 2D facelets, solvedness, frame, inverse, and counts come from API snapshots. Pending requests do not update the cube; rejection retains the accepted state; unavailable engine never produces a fabricated cube. |
| M1B-08 | Regression/build checks | 243 backend tests, 15 frontend tests, strict frontend build/ESLint, backend Ruff/format, and backend package build. Browser checks exercise real moves/inverses, rotation-only zero HTM, and impossible-state rejection. See delivery report for commands. |

This gate covers the user's M1B scope. It does not claim completion of sessions, checkpoints/event replay, expanded notation, stage predicates, solvers, or full M1.

## M1 — Cube-state foundation

M1C adds an independently verified checkpoint: all 26 cubies/54 stickers render from engine geometry; every descriptor and inverse lands on its exact engine snapshot; rapid-input and duplicate/stale completion tests pass; reset, local undo/redo, replay, pause/resume, keyboard guards, WebGL fallback and reduced motion are tested. Current evidence is **328 backend / 35 frontend tests**, plus actual WebGL and responsive browser checks. See [M1C report](MILESTONE_1C.md). Persistent solve logs and timer/stage metrics are not implied.

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M1-01 | Clean install on documented runtimes; start minimal frontend/backend | Lockfiles reproduce installation; health, state inspector, notation submission, and event stream work. Exact commands are documented and run. |
| M1-02 | Golden solved state and independent one-turn states for all six faces | Exact cubie arrays and oriented facelets match a separately reviewed convention, not only engine-generated expectations. |
| M1-03 | Every supported move and inverse, four quarter turns, two half turns; 1,000 seeded random sequences | Identity properties, inverse round trips, and all legality invariants hold. No mutation of input objects. |
| M1-04 | Compare at least 1,000 seeded face-turn/rotation sequences against pinned independent library | Canonical state and frame agree after documented mapping. Mismatches fail the gate. |
| M1-05 | All 24 proper frames; turn conjugations; wide/lowercase/slice equivalents | Frame round trips and corresponding transformations agree. Camera orbit leaves engine hash/revision unchanged. |
| M1-06 | Prime/double, Unicode apostrophe, `R2'`, parentheses, whitespace, wide aliases, malformed tokens | Supported grammar parses predictably; normalization preserves effect. Unsupported syntax reports position and leaves state unchanged. No silently skipped tokens. |
| M1-07 | Counts for `R`, `R2`, `R'`, `x y z`, wide turns, slices, `R R'` | Face actions cost 1 each; rotations 0; normalized wide 1, slice 2. `R R'` has executed HTM 2 and reduced HTM 0. Metric version is retained. |
| M1-08 | Valid random facelets; duplicated cubie; single flipped edge; single twisted corner; odd two-piece swap; wrong colors/centers; mirrored center layout | Valid states round trip. Every impossible state is rejected before solver access with a specific reason. |
| M1-09 | Cubie/facelet/JSON export-import under each frame and multiple color schemes | Exact state and orientation-sensitive hash survive round trip; solvedness is invariant under global rotation. Schema incompatibility fails clearly. |
| M1-10 | Replay 500 events, restart process, restore checkpoints; tamper with an event/hash | Replay matches each recorded boundary hash. Tampering is detected. Restart does not lose acknowledged events. |
| M1-11 | Resend command ID, stale revision, competing tabs, malformed atomic batch, repeated/reordered network delivery | Exactly one accepted transition per command; stale/conflicting input is rejected; invalid batches commit nothing; clients recover event order through sequence replay. |
| M1-12 | Verify valid/invalid algorithms against explicit full-solve and stage predicates | Only goal-reaching plans pass. Stage proofs cannot become full-solve proofs. Incorrect predicted hashes fail. Verification never mutates the live session. |
| M1-13 | Inspect solver/oracle adoption record | Runtime viability, exact artifact/license provenance, and planned project compatibility are recorded. Unresolved candidate selection remains visible and blocks its later integration. |

## M2 — Interactive cube and capture

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M2-01 | Keyboard, touch/buttons, notation batch, rapid moves while animating | Displayed cubies/facelets match acknowledged engine snapshots. Animation rate, reduced motion, and low frame rate do not change state, ordering, or timing. |
| M2-02 | Orbit camera, then enter `R`; explicitly enter `y R` in a separate case | Orbit has no notation effect. Explicit frame rotation remaps subsequent turns exactly. State/frame is clear in replay. |
| M2-03 | Start/stop, optional inspection, explicit practice pause, reset, DNF/+2, zero-duration run | Timer state transitions are deterministic. Monotonic elapsed duration is correct; raw result/status are retained; invalid TPS is unavailable. Paused practice is identified. |
| M2-04 | Inject monotonic timestamps and a frozen/background UI interval | Elapsed time derives from timestamps rather than ticks/frames. Practice active duration excludes only explicit pauses; thought pauses remain in speedsolve duration. Reload/sleep discontinuity marks timing integrity rather than inventing continuity. |
| M2-05 | Known complete log with inactivity and rotation events; timer-only and untimed imported logs | HTM/TPS/inactivity calculations match fixture arithmetic. Unknown or absent move timing produces unavailable pause/stage-time values. |
| M2-06 | Backend disconnect, WebSocket reconnect, app restart during capture | State controls show loss of connection and cannot report unacknowledged moves as accepted. Timer can continue with marked capture gap. Replay/history persist and deduplicate. |
| M2-07 | Keyboard-only use, input focus, reduced motion, WebGL failure, 360/768/1440 px layouts | Controls are labeled/focusable, typing in a field does not turn the cube, 2D/text fallback works, and important actions/status fit without horizontal page overflow. |
| M2-08 | 1,000 local move commands, with/without background CPU work | Publish p95 acknowledgements against roadmap targets; preserve correctness under load and bounded queues. |

## M3 — Minimum-move solver and Next Best Move

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M3-01 | Solved, known shallow states, and 200 fixed seeded random legal states | Every returned sequence solves the exact input in the canonical engine. Solved input returns an empty plan. Invalid input never enters the solver. Warm/cold timing meets the declared release target or is reported as a blocker. |
| M3-02 | Exhaustive independent BFS table for all states through HTM depth 4 from solved | Exact mode returns independently known minimum costs for a documented representative set spanning every depth and move face. Proof pruning never excludes a shortest route. Persist/reference oracle generation and corpus checksum. |
| M3-03 | Force exact-search timeout before lower depths are exhausted | A verified upper-bound candidate remains unproven; no badge or text claims global optimality. No-result timeout returns no moves. |
| M3-04 | Compare proof record to sequence cost and lower bound; inject forged proof metadata | “Proven optimal” requires validated proof conditions tied to that input/metric/goal. A two-phase library result alone is never proven. |
| M3-05 | Inject malformed tokens, wrong input convention, and a non-solving solver result | Authority rejects the result; no invalid recommendation reaches replay or Next Best Move. An error is visible and the session unchanged. |
| M3-06 | Request Next Best Move on imported intermediate state, then make a move before result arrives | Prefix and continuation validate from the requested state. Old result is stale and cannot be applied to the new revision. No scramble history is needed. |
| M3-07 | Cancel, unavailable adapter, native build failure, solver crash, table cold start | Bounded worker lifecycle and explicit statuses work. No orphan process blocks new jobs, camera, or move commands. Meet published cancellation targets. |
| M3-08 | Verify frame normalization and candidate ranking | Returned moves map to the requested frame. Best available means lowest verified HTM among candidates actually considered; provenance/budget are visible. |

## M4 — Genuine CFOP

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M4-01 | Independently labeled Cross/F2L/OLL/PLL checkpoints | Stage predicates agree with piece goals, including cross side-center alignment and final AUF. Cross-only success cannot satisfy F2L. |
| M4-02 | Cross fixtures with known distances; restricted coordinate search | Cross endpoints are correct and claimed optimal Cross costs agree with exhaustive coordinate distances. Claims explicitly exclude full-solve optimality. |
| M4-03 | Versioned F2L matrix: paired/unpaired, top/middle/bottom, trapped pieces, flipped edge, wrong slot, empty/solved slots, pair-order variants | Every supported entry has independent input and target fixtures. Returned endpoints preserve cross/previous slots and improve the requested goal; every matrix cell has a result or explicit known coverage gap. Full release has no unacknowledged matrix gaps. |
| M4-04 | 57 OLL and 21 PLL non-solved classes plus skips; all four U setups; supported frame variants | Recognizer and catalog cover every class. Algorithms validate against independently labeled cases and varied compatible last-layer configurations, preserving required lower layers and reaching the right goal. Inverse-self-generated cases alone do not count. |
| M4-05 | 200 fixed random legal states and snapshots across all stages; every cross color | Every complete plan has genuine ordered stage endpoints, each verified. Meet documented completion/time target. Remaining bounded failures are shown, never replaced by relabeled two-phase output. Color/frame conversions validate. |
| M4-06 | Cross/F2L/OLL/PLL already complete, last-layer skip, AUF-only, fully solved | Earliest unsatisfied goal is selected correctly. Skips/empty stages are explicit; no unnecessary algorithm is prescribed. |
| M4-07 | CFOP Next Best Move from arbitrary legal partial state and stale result | Recommended pair/stage sequence validates with exact preconditions and preserved goals. State changes invalidate it. Unknown initial state disables it. |
| M4-08 | Force F2L budget exhaustion and unknown catalog case | Return verified partial stage plan or no-plan status with coverage/budget reason. No invented algorithm, fabricated stage boundary, or hidden objective switch. |

## M5 — Counterfactual review and practice

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M5-01 | Completed solve with stored stage indices and original `x/y/z` rotations | Every stage start reconstructs exactly from initial state and independently from nearest checkpoint, matching full state/frame hashes before its first move. |
| M5-02 | Ordered stage milestones, skips, transient predicate loss, manual boundary edit | Classification follows its versioned first-attainment rule; inferred/annotated labels and predicate timeline remain visible. Historical events are unchanged. |
| M5-03 | Start actual and alternative branches for each stage | Both initial hashes match. Replay forward/backward and independent scrubbing produce engine-correct states; original solve never changes. |
| M5-04 | One alternative reaches exact actual endpoint; another reaches same stage goal with different remaining state | UI distinguishes these outcomes and protected slots. Later actual moves are reused only if reverified. Full-continuation comparisons are computed separately and disclose budget/proof status. |
| M5-05 | Compare known actual and alternative sequences | Counts/rotations/goals are exact. Physical alternative completion time and “seconds saved” remain unknown; replay animation is labeled simulation. Measured actual pauses retain their source. |
| M5-06 | Repeat saved case virtually and through physical setup notation | Virtual practice restores exact start/frame. Physical setup, when offered, is verified from solved to the saved state. Practice saves a new linked session, preserving the completed solve. |
| M5-07 | Missing event, corrupted checkpoint, timer-only solve, rescan gap crossing selected range | Exact comparison is unavailable with a specific reason. No substitute state or missing moves are invented. A later fully known segment can be reviewed independently. |

## M6 — History, analytics, and algorithm trainer

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M6-01 | Add/export/import history; restart and migrate a prior test database | States, logs, times, statuses, gaps, algorithm versions, and annotations round trip. Invalid imports fail atomically. Backup/restore preserves hashes. |
| M6-02 | Known duration/TPS/stage dataset with empty, small, DNF, +2, and missing-move cases | Means, bests, trends, Ao5/Ao12, and eligibility match independent arithmetic. One DNF is trimmed as worst; two give DNF. Insufficient samples are unavailable. No divide-by-zero. |
| M6-03 | Mix virtual, full physical, camera-gap, timer-only, paused practice, and imported sessions | Default filters and visible sample counts explain inclusion. Missing move/stage facts never become zero or estimated exact values. |
| M6-04 | Trainer setups with randomized AUF and an alternate valid algorithm | Each setup reaches its intended case, correctness is goal-based rather than token equality, and protected-layer violations fail. Repeated attempts affect scheduling/accuracy from real recorded attempts only. |
| M6-05 | Fresh profile and delete/export controls | Empty state contains no performance claims. Export and user-requested deletion affect the intended records and preserve unrelated sessions. |

## M7 — Guided webcam scan

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M7-01 | Camera denied/absent/disconnected, permission ignored, insecure origin | App remains usable, explains actual status, and does not imply frames were captured. Stop/unmount closes tracks. Validate localhost permission flows in supported browsers. |
| M7-02 | Real six-face scans with labeled full states and orientation | At least 50 held-out scans in the documented envelope: zero wrong confirmed states, at least 90% successful scans within two guided attempts. Report abstentions/corrections and sample size; finite results are not universal guarantees. |
| M7-03 | Glare, low light, similar colors, partial stickers, wrong face order, duplicate face, cube turned during scan | Ambiguous/incoherent observations require recapture/edit; impossible states never reach solvers. User explicitly confirms the final preview. |
| M7-04 | Inspect data path during scanning; idle/stop recording | Frames stay local by default, queues are bounded, stale frames are dropped visibly, and no video is persisted unless recording is explicitly enabled. |
| M7-05 | Rescan a different legal cube state after a known solve segment | New state is validated, resynchronization is appended as a discontinuity, and unknown moves/time/counts remain unknown. |

## M8 — Physical move tracking and resynchronization

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M8-01 | Held-out real recordings with manually verified moves, frame times, and full state checks | At least 1,000 labeled observable turns across at least 10 sessions and multiple users/cubes; no session leakage from tuning. Initial gate: zero false committed moves, at least 70% recall within declared envelope. Publish confusion counts, precision/recall, abstention, timing error and confidence intervals. This finite gate does not prove perfect real-world tracking. |
| M8-02 | Hidden-turn versus no-turn recordings with indistinguishable visible evidence; several plausible sequences | Abstain for both when evidence cannot support a unique observed transition. Do not choose a sequence based on solver convenience or expected CFOP algorithm. Report unsupported visibility. |
| M8-03 | Occlusion, fast double flicks, hand-only motion, cube rotation, blur, dropped/stale frames, deliberate unsupported hidden turn | No guessed intermediate moves. Known uncertainty freezes state-dependent coaching and opens a continuity gap. Limits on detecting completely invisible turns are disclosed; success outside the declared envelope is not claimed. |
| M8-04 | Force uncertainty mid-solve, then perform a full rescan or explicit manual correction | Timer elapsed time continues; last confirmed state is historical, not asserted current. Recovery appends evidence/source and discontinuity; automatic move metrics and exact replay across gap remain unavailable. |
| M8-05 | Backend/network/frame overload and worker crash | Camera backpressure cannot corrupt accepted commands. Reconnect does not backfill an unobserved path. Session ordering and memory bounds hold. |
| M8-06 | Evaluate quality/confidence values on held-out videos | Calibration metrics/reliability plot support any probability label; otherwise UI says heuristic quality score. Numeric certainty never substitutes for full-state observability. |
| M8-07 | Review/history/trainer after a gap-containing physical solve | Incomplete intervals are excluded from exact move analytics and counterfactual analysis. Rescanned-state practice is allowed with provenance; unknown past solve reconstruction is not. |

## M9 — Optional AI and release

| ID | Fixture / action | Acceptance |
| --- | --- | --- |
| M9-01 | No AI key/provider, provider timeout/error, and network disabled | Core solving, review, training, history, and available local vision work. Deterministic explanations remain useful. No fabricated AI response is shown. |
| M9-02 | Prompt adversarial explanation output to add invalid notation, false state facts, unsupported optimality, or made-up time savings | Only allowlisted template IDs and valid fact references are accepted; slot values come from verified data. Extra free text, unknown fields, and wrong fact types are rejected/fall back. UI never executes model output. Existing engine-validated sequences remain the only actionable algorithms. |
| M9-03 | Inspect external requests and credential handling | Opt-in explanation sends only disclosed fact bundle; no raw video or entire history by default. Secrets stay server-side and out of exports/logs. |
| M9-04 | Clean-checkout install, build, local production launch, offline restart, table cache rebuild | Exact README commands work on declared target platforms. Bundle serves locally, required data/tables are available, migrations preserve history, and no cloud account is necessary. Initially certify macOS; only claim other platforms after testing. |
| M9-05 | Untrusted HTTP/WebSocket origin, invalid local token, oversized frame/input | Requests are rejected without state changes or resource exhaustion. Services remain bound to loopback by default. |
| M9-06 | Stop application during job/capture and reopen; inspect capability UI | Camera and child processes shut down; acknowledged history survives. Missing solver/vision modules show unavailable. No demo figures masquerade as measurements. |
| M9-07 | Final full applicable regression and source/license inventory | Release report contains passed gates, measured performance, real video evidence, dependency notices, scope exclusions, and unresolved limits. Optional AI and experimental tracking status are explicit. |

## User-requested M2A — full-cube solving checkpoint

These gates describe this delivered slice; the broader M3 and M4 gates remain pending.

| ID | Action | Acceptance / evidence |
| --- | --- | --- |
| 2A-01 | Submit valid cubies or viewed facelets | Validate before any worker; canonical URFDLB search input. Known scramble and all-24-grip real HTTP tests. |
| 2A-02 | Solve known and seeded random scrambles with the actual dependency | Returned notation solves the exact state under `coach.cube`; every intermediate snapshot agrees; grip preserved. Eight known, 24 seeded 25-face-turn, and 24 grip tests. |
| 2A-03 | Inject malformed, wrong, rotation-containing, or over-limit output | 502 without notation; no unchecked candidate escapes. Solved input needs no worker. |
| 2A-04 | Inspect response and UI | Notation, HTM metric/count, elapsed backend milliseconds, method/version/budget, input/result hashes and verification returned. Optimality always unproven; no approximation-gap claim. |
| 2A-05 | Solver timeout, crash, missing dependency, no result, busy slot | Specific 502/503/504 error, worker timeout enforced with `subprocess.run(timeout=30)`, slot released on every path; health remains usable. Failure injection, not fabricated runtime success. |
| 2A-06 | Click Solve, step back/forward, play/pause, restart solution | Preview leaves accepted state unchanged. Playback begins at the saved solution start, reaches solved, and reverses using verified snapshots. Duplicate callbacks commit once. |
| 2A-07 | Reset/cancel/import/unmount during search; late reply; edit after preview | Stale result cannot replace state/history. Edits blocked during search; a committed manual branch invalidates the old solution. Explicit cancellation/epoch tests. |
| 2A-08 | Start locally, cold/warm solve, desktop/mobile layout, full regression | README commands work; local cache needs no network after installation; live browser solve reaches solved and reverses to its exact start. See [delivery report](MILESTONE_2A.md) for actual verification and limitations. |

## User-requested M2B — genuine CFOP checkpoint

The complete fixed-white pipeline is implemented; this does not claim the broader original M4 color-neutral/Next Best Move gate.

| ID | Action / fixture | Acceptance and evidence |
| --- | --- | --- |
| 2B-01 | Scrambled states, solid-but-misaligned bottom, LL cases, U-only alignment | Exact Cross/pair/F2L/OLL/PLL-up-to-AUF predicates; no recognition before prerequisites. |
| 2B-02 | Complete Cross projection and independent full-state transition tests | All 190,080 coordinates reached, maximum distance 8; emitted Cross path descends exact distances. |
| 2B-03 | All targets/protected masks, legal completions of every reachable pair coordinate | All 8,256 configurations solve with Cross and protected slots intact at macro endpoints; no wrong-slot/flip/twist subset omitted. |
| 2B-04 | Every legal OLL orientation with unrelated legal top permutations | All 216 orient correctly, 57 numbered classes plus skip; first two layers preserved. |
| 2B-05 | Every legal LL permutation after OLL | All 288 map to 21 named PLL classes plus AUF skip states, then explicit AUF solves. |
| 2B-06 | Independent requested-reference fixtures and frame transformations | All 78 IDs agree in four y views; 36 compiler transformations match the independent full-sticker oracle; all 24 user grips map correctly. |
| 2B-07 | 200 seeded 25-face-turn scrambles plus 30 random legal cubie states | Complete genuine CFOP sequence solves, grip retained, eight contiguous stage ranges and exact counts. Two-phase calls forbidden. |
| 2B-08 | Inject false stage labels/order, arbitrary non-descending Cross, non-registry LL, undeclared F2L macros, wrong AUF, worker errors | Rejected with no candidate moves. Shared worker gate released on failure; budget enforced. |
| 2B-09 | Choose CFOP in Explorer, preview, play individual/full stages, pause, reset or late response | No automatic state change on arrival. Stage playback starts at the verified hash and stops at its boundary. No generic response accepted/relabelled as CFOP. |
| 2B-10 | Full build/lint/tests, packaged resources, live local playback and responsive layouts | See [M2B delivery report](MILESTONE_2B.md); actual evidence is distinct from the broader future product gates. |
