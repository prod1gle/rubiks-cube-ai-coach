# Technical decisions

Status: architecture decisions, November 12, 2026. M1A implements the application scaffold; M1B implements the canonical engine in `coach.cube` and stateless API/2D inspector. M2A now implements the verified full-cube adapter described in TD-04; sessions, exact optimality search, CFOP, and extended notation remain future work. See the root README, [cube conventions](CUBE_CONVENTIONS.md), and lockfiles for implemented details.

## TD-01 — One authoritative Python cube engine

**Decision:** implement a small, pure, immutable cubie-state domain package inside the backend. It owns move tables, notation semantics, legality, state/frame serialization, HTM, stage predicates, and algorithm verification. FastAPI, solver workers, replay, analytics, and vision validation all use that package. No React component or OpenCV module maintains independent move rules.

**M1B checkpoint:** `coach.cube` is the single current rules module. It implements cubies/frame, geometry-derived face turns, x/y/z, parsing, inverse, executed HTM, legal reachability, and serialization/hashes. Stage predicates and generalized goal/algorithm verification remain later work. React only paints returned snapshots and submits them unchanged.

**Reason:** a Python authority fits the requested solver/vision backend without adding a Node service or maintaining equivalent Python and TypeScript engines. Cubie arrays are compact for search; facelets are useful for import/rendering. Keeping conversions at the boundary avoids ambiguity.

**Tradeoff:** building move conventions is correctness-sensitive. Use published conventions, independently derived golden states, algebraic properties, and differential tests with an established library. Do not use only inverse tests: mutually incorrect move tables can still invert each other. Backend availability is required for committing cube moves. Measure localhost latency before considering an engine compiled for browser execution; any later port needs the same conformance suite and an explicit authority model.

## TD-02 — Modular local application, not microservices

**Decision:** React/TypeScript/Vite + Tailwind + React Three Fiber/Three.js; FastAPI/Pydantic; SQLite; a bounded Python process pool; REST and WebSockets. Use npm and uv lockfiles after runtime selection. Prefer a single FastAPI worker initially to keep in-memory sessions, job cancellation, and database ownership understandable.

**Reason:** there is one local user, CPU-intensive work, and persistent personal solve data. Processes isolate blocking solver/OpenCV work from command handling. FastAPI has [documented WebSocket support](https://fastapi.tiangolo.com/advanced/websockets/); job durability, session ownership, and backpressure remain application responsibilities.

**Tradeoff:** this is not a static-only website. The existing hosting configuration cannot provide backend services. LAN access, cloud deployment, multi-user accounts, and mobile installation are later architecture work. Retain `cubiq/` rather than migrating the scaffold without a functional reason.

## TD-03 — Notation, rotations, and move counting

**Decision:** canonical search uses the 18 outer face turns with unit HTM cost. A double face turn costs 1, as does an inverse quarter turn; `x/y/z` cost 0 and update a separate reference frame. Solvedness is center-relative, independent of whole-cube orientation. Camera orbit does not emit rotations.

Support wide turns and slices because the requested [CFOP reference](https://solvethecube.com/algorithms) uses them. Normalize lowercase wide notation, explicit wide notation, slice turns, and whole-cube rotations through tested transformations into canonical cubies plus frame. In this project's normalized HTM, wide turns cost 1 and slices cost 2. The engine must verify each decomposition's full state and frame equivalence. Keep original execution notation as well.

This paragraph describes planned extended notation. **M1B supports outer face turns and x/y/z only**, and rejects wide/slice input. It reports executed counts without algebraic reduction. Do not describe the full notation or reduced-count portions of this decision as implemented.

Maintain two distinct counts: executed HTM over committed actions, and reduced HTM for candidate sequence comparisons after adjacent cancellations/merges and frame normalization. For example, a recorded `R R'` has 2 executed HTM and 0 reduced HTM; a recorded `R2` has 1. Do not rewrite a completed user's history to make it look more efficient. A pair of observed quarter turns is merged into a half turn only when the capture system has a documented turn-segmentation rule and enough evidence; retain the raw evidence and metric version.

The [WCA notation rules](https://www.worldcubeassociation.org/regulations/#article-12) define face turns, rotations, and OBTM. This application explicitly names its HTM normalization rather than presenting slice counting or practice timing as competition certification. Store a metric version on every cost, proof, and analysis.

## TD-04 — Established two-phase adapter, explicit optimality evidence

**Initial candidate:** the Python [`kociemba` package](https://github.com/muodov/kociemba) was considered for the short-solution adapter. M2A selects the package below instead. Its upstream implementation is two-phase; evaluate its facelet mapping, outputs, native build behavior, warmup, timeout isolation, and exact pinned version before adoption. The original scaffold declared [`cubejs`](https://github.com/ldez/cubejs); M1A removes that unused runtime dependency. It remains an independent test-oracle or alternative-adapter candidate, not evidence that a solver works today.

M1B uses pinned MIT-licensed `cubejs@1.3.2` solely to generate committed independent reference data. No cubejs source, runtime dependency, or solver is added to the application. The Python engine generates its own move tables from integer geometry and passes the reference corpus. This describes the M1B checkpoint. M2A adopts the separate adapter below.

**M2A adoption:** use the PyPI artifact `rubik-solver-py==0.1.1` (released February 22, 2026), locked with NumPy in `uv.lock`. The [upstream repository](https://github.com/mrrtmob/rubik-solver-py) and installed artifact declare MIT. This avoids adopting the GPL `kociemba` candidate or introducing a Node runtime service. It is a small, single-maintainer project, so maintenance and solver quality remain risks; current-release packaging alone does not establish long-term support. Its upstream optimality wording is not accepted as proof.

`coach.solvers.two_phase` passes canonical URFDLB facelets to an isolated `sys.executable -m coach.solvers.worker` subprocess, with a 24-turn depth setting, hard 30-second subprocess timeout, and one nonblocking worker slot per API process. No search runs at API import/startup. Versioned local NumPy tables initialize on first use. Failure or interruption can require a cache rebuild; cache content is performance data, never proof. The worker's cube model stays private to candidate generation. The coordinator translates the candidate through the canonical state's frame, then verifies it entirely with `coach.cube` before returning an engine-generated animation plan. Every result is unproven, including empty solved-state responses; no lower bound or exact-search metadata is invented. `elapsed_ms` includes worker setup, table load/build, search, verification, and planning.

Client cancellation/reset invalidates adoption immediately. There is no persistent job API yet; a worker can finish its bounded computation after HTTP/client cancellation, and new requests can receive `solver_busy`. A future job protocol can add server-side cancellation. M2A does not satisfy the broader M3 optimal-search or Next Best Move gate.

Two-phase solving is an upper-bound candidate generator. A bounded exact search can improve candidates and sometimes prove them optimal. Herbert Kociemba documents [two-phase search](https://kociemba.org/math/twophase.htm) and [optimal solvers](https://kociemba.org/math/optimal.htm) separately; the project must preserve that distinction.

| Result field / UI label | Required evidence |
| --- | --- |
| `optimality: proven` / “Proven optimal in HTM” | Verified sequence plus complete exclusion of all lower costs, or an admissible certified lower bound equal to its cost. Proof scope states full-solve versus stage goal. |
| `optimality: unproven` / “Near-optimal candidate; optimality unproven” | Verified goal-reaching sequence, disclosed search budget/method; no claim of a bounded distance from optimum. Prefer “shortest found” in compact UI. |
| `status: timeout_no_result` | Search budget expired with no validated candidate; return no moves. |
| `status: unavailable` | Missing/incompatible solver; show setup guidance and preserve the session. |

Store upper bound, certified lower bound when available, completed exact-search depth, termination reason, elapsed time, and solver/heuristic versions. Never manufacture a lower bound or infer proof from a short sequence. A timeout may return an already verified candidate while keeping `optimality: unproven`. “Proven” badges cannot be set by a solver's unchecked metadata. Small-depth independent exhaustive tests and proof-bound regressions are required.

## TD-05 — CFOP is an independent staged planner

**Decision:** use explicit state predicates, Cross search, pair-aware F2L planning, and versioned OLL/PLL case recognition and algorithms. Persist stage/pair endpoints and protected slots. Do not split a two-phase solution into four labeled chunks.

Start with white cross on logical D; support all cross colors through tested frame mappings before claiming color-neutral support. Search Cross independently from remaining solve cost; a shortest Cross does not necessarily lead to the shortest or fastest full CFOP solve. F2L explores pair order and validated insertion/extraction variants, preserving completed slots at macro endpoints. Catalog algorithms require correct setup and post-AUF, and can temporarily disturb earlier pieces inside a sequence. Stage skips are valid outputs.

Initially rank by verified stage goal, HTM, and rotation count with deterministic tie breaking. Algorithm familiarity can later influence a clearly separate training objective. Fewer moves alone cannot establish better ergonomics, lookahead, or physical speed. Strict stage planning may miss advanced techniques such as X-cross or multislotting; label this scope.

**Coverage policy:** maintain a case manifest including the conventional 57 OLL and 21 PLL non-solved classes plus skips, and F2L configurations with misplaced, trapped, flipped, or paired pieces. Include AUF and rotational variants, legal last-layer permutations/orientations beyond a single representative, and arbitrary legal intermediate states. Bounded search can fail honestly; catalog gaps are defects, not a reason to silently switch objectives. Full CFOP release is gated on M4 coverage tests.

## TD-06 — Treat algorithm content and dependency adoption separately

**Decision:** algorithm records carry case ID, stage, source URL, source revision/access date, expected precondition, protected pieces, reference orientation, setup/AUF policy, original tokens, normalized moves, engine version, and validation fixtures. Recognition matches cubies, not diagram appearance or algorithm name. Verification must use independent case fixtures; constructing a case solely by inverting its own algorithm cannot prove the case label is correct.

Use [SolveTheCube](https://solvethecube.com/algorithms) as the requested reference, verify sequences independently, and create original case renderings. Do not copy its explanations, diagrams, or complete page presentation. Record content provenance before bundling a catalog and resolve reuse terms if needed.

Upstream [`kociemba` declares GPL-2.0](https://github.com/muodov/kociemba/blob/master/LICENSE). Its project compatibility is unresolved until a project distribution/license choice is made. Do not assume subprocess isolation removes license considerations. M2A instead adopts the MIT-declared `rubik-solver-py` artifact; see TD-04. No project distribution license is chosen. M1 records the dependency/license decision; if this candidate is unsuitable, evaluate another established adapter before M3. `cubejs` declares MIT in its [repository](https://github.com/ldez/cubejs); confirm the exact artifact's license. [`cubing.js`](https://github.com/cubing/cubing.js#license) is another possible development oracle with its own licensing terms. No vendoring or upstream code copying is planned here.

## TD-07 — Events and checkpoints support reproducible coaching

**Decision:** immutable accepted events plus validated initial state are the replay truth. Persist ordered event revisions and periodic state checkpoints transactionally; stage summaries and analytics are derived, versioned data. Corrections/rescans append events rather than changing history in place.

Store time source and capture provenance separately from canonical moves. Preserve gaps. A verified state after a rescan does not prove the intervening moves, their count, or their timing. Store a continuity flag per interval and refuse exact counterfactual reconstruction across unknown intervals.

**Tradeoff:** more metadata and migrations than a timer-only app, but it is required for exact stage reconstruction, independent replay, and honest statistics. Export/import includes schema versions, and migration tests must preserve event hashes or explicitly retain a legacy interpretation.

## TD-08 — Webcam scanning before continuous tracking

**Decision:** ship guided, user-confirmed six-face scanning before visible-turn tracking. Browser capture feeds local OpenCV processing. Start with controlled lighting, calibrated colors/pose, stable frames, and an editable preview. Define an operating envelope through measurements rather than announcing universal tracking.

Tracking is evidence-based state estimation with abstention. Scores are labeled heuristic quality scores until calibrated on held-out labeled recordings; do not display an arbitrary “99% confidence.” Save enough local diagnostic metadata to explain abstentions, with recording off by default. A hidden turn can be indistinguishable from no turn; restrict supported observations, request deliberate visibility, and demand recovery when continuity cannot be supported. Never promote uniqueness under an incomplete hypothesis set to certainty.

**Tradeoff:** fewer accepted turns and more resync prompts than an invented always-on tracker. Automatic physical tracking remains experimental unless M8's real-video gate passes. Timer-only, manual logging, and virtual solving remain useful without it.

## TD-09 — Facts first, optional AI second

**Decision:** deterministic explanations are available without a model. Optional AI receives a minimized verified fact bundle and initially returns only approved template IDs, ordering, and fact references. The application renders sentences and factual slots from validated data. Unknown IDs, added assertions, moves, optimality claims, timings, or performance promises are rejected. The UI never executes AI-generated notation. Fact references alone do not establish semantic correctness of free prose, so unrestricted narrative remains deferred. Disable/fallback behavior is a first-class flow.

**Reason:** valid-looking language is not cube validation. Computed candidates and exact replay are useful independently of AI. External providers, keys, costs, model choice, and consent are deferred until M9; no external service is selected now.

## TD-10 — Measure correctness before optimizing latency

**Decision:** pytest/Hypothesis for engine and solver properties, TypeScript component/contract tests, Playwright for meaningful browser flows, and independent-library conformance fixtures. Real labeled video is mandatory for tracking claims. Synthetic fixtures test failure handling, not physical-camera accuracy.

Commit bounded deterministic correctness corpora. Keep slower exhaustive/vision suites separately labeled and record seeds, hardware, versions, timeouts, and results. Suggested performance budgets in the roadmap are targets, not measured results. Profile before moving hot loops to native code. All phases retain explicit unavailable/error states; no decorative success numbers or precomputed demo results are presented as user measurements.
