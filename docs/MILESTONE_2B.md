# Milestone 2B — genuine CFOP solving

Delivered November 12, 2026. **Implemented: a complete strict CFOP pipeline in a fixed white-down/green-front reference**, including general protected F2L placement support, all 57 OLL cases, all 21 PLL cases, setups/rotations, AUF, and stage playback. It never calls the two-phase full-cube solver. This is the user-requested 2B checkpoint, not completion of the original broader M4 color-neutral/Next Best Move gate.

## Implementation

- The canonical `coach.cube` module owns the new stage predicates, validated reference rebasing, notation compilation, and projected piece transitions. No frontend cube mathematics is added.
- Cross uses a complete reverse BFS over 190,080 four-edge coordinates, maximum distance 8 HTM. The coordinator checks the resulting path against exact distances.
- F2L uses 27 Cross-preserving U/side insertion macros and target-pair Dijkstra tables for all target/protected-slot combinations. All 8,256 configurations are reachable and tested with unrelated legal full-state completions. The pipeline greedily selects the least-cost next pair and protects all slots solved at the start of that pair stage at every macro endpoint. It records initial/incidental solved pairs as explicit skips.
- The versioned last-layer registry contains 57 standard OLL IDs and 21 standard PLL names, original/compiled algorithms, signatures, provenance, and setup conventions. Recognition covers all 216 legal OLL orientations and all 288 legal PLL permutations, with skips and separate final AUF. Case labeling is independently checked against the requested SolveTheCube reference.
- A separate CFOP worker has a 30-second wall-clock budget. The coordinator verifies stage order, four distinct F2L slots, case identities, macro provenance/protection, goals, exact state hashes, and current-grip translation before constructing the animation plan. The shared runtime module provides only admission control/errors; no CFOP module imports the two-phase implementation.
- Cube Explorer offers **Short solution** and **CFOP** separately. It shows eight CFOP rows with case IDs, per-stage HTM, real moves, skip status, and individual stage play buttons. Full playback, stepping, pause, undo, and restart share the original guarded animation commit path. Arrival previews moves without applying them. A previous result keeps its original method label when the requested approach changes.

See [CFOP engine conventions and coverage argument](CFOP_ENGINE.md) for the algorithms, projection domains, reference mapping, counting semantics, provenance, and limits.

## Verification

All checks passed in the existing macOS ARM64 environment: Python 3.12.3, uv 0.13.7, Node 22.17.1, npm 10.9.2.

| Check | Result |
| --- | --- |
| Full backend pytest | **839 passed**, 28.92 seconds on this run. |
| New CFOP backend slice | **429 passed**, 11.54 seconds on its focused run. |
| Frontend Vitest | **71 passed**, 10.12 seconds on the final run. |
| TypeScript + Vite production build | Passed, no build warnings. |
| ESLint with zero allowed warnings | Passed. |
| Ruff lint and format check | Passed. |
| Offline backend wheel/source distribution | Passed. Registry JSON and complete MIT notice verified inside the wheel. |
| Running Vite proxy `/api/health` | Reports milestone `2B`. |
| Git whitespace/error check | Passed. |

The new backend coverage includes:

- All 8,256 target-pair/protected-mask configurations, with legal independently completed surrounding cubies, exact goal checks and macro-endpoint protection; maximum graph path cost 11 HTM.
- All 216 OLL orientations with unrelated legal corner/edge permutations; all 288 oriented LL permutations with separate AUF verification.
- All 78 standard IDs against the independent SolveTheCube/cubejs fixture, including four y reference views; 36 full-sticker slice/wide/rotation conformance outputs.
- All 24 user-grip mappings, precise prerequisite gates and skipped stages, complete Cross coverage, shallow distance checks, and full-state conformance of projected search transitions.
- 200 deterministic 25-face-turn scrambles, seeds `0xCF0F00 + [0..199]`, cycling through all 24 user grips. Plus 30 independently sampled legal cubie states, seeds `0xABC2B + [0..29]`. These run the actual staged algorithms and verify complete solutions; they do not call a generic solver or mock success.
- Actual HTTP/worker/animation-plan checks, invalid state rejection, worker timeout/failure/protocol tests, and injected wrong stage order, case labels, arbitrary Cross paths, undeclared macros, and AUF labels.

The 15 new frontend tests cover CFOP endpoint selection, unchanged preview state, exact stage start/end boundaries, stage-only playback stopping correctly, pause/resume, continuation through the whole plan, all eight skipped stages, truthful method selection, rejected generic fallback, corrupted stage metadata, reset with late results, and timeout behavior. Existing 1C/2A synchronization tests still pass.

One new frontend expectation initially assumed a solved cube must be in the default grip. It was corrected to expect the engine-provided solved snapshot in the preserved rotated grip; the actual application behavior was correct.

## Live application evidence

Used the running Vite/FastAPI applications and actual Three.js cube, without mocked responses:

1. Applied `x R U2 F' L D B2` (6 HTM and one grip rotation, frame `FRDBLU`).
2. Selected CFOP and received a verified **60 HTM** plan in **853 ms** of backend adapter time. Preview retained the exact starting facelets.
3. The chosen stages were Cross **5**, F2L FR **6**, BL **7**, BR **7**, FL **8**, OLL-47 **13**, PLL-T **14**, and skipped AUF **0** HTM.
4. Played Cross alone; it stopped at solution step 5. The actual displayed facelets independently satisfied the engine's white-Cross predicate.
5. Played the BL pair stage from its saved start; it stopped at step 18. The actual displayed state had the Cross, FR pair, and BL pair solved, with FR protected.
6. Continued full animation through OLL and PLL to solution step 60/60, solved. The grip stayed `FRDBLU`; viewed solved facelets were `FFFFFFFFFRRRRRRRRRDDDDDDDDDBBBBBBBBBLLLLLLLLLUUUUUUUUU`.
7. Inspected the stage controls at 1280px desktop and 390px mobile widths: eight readable stage rows, no horizontal document overflow, and no browser warning/error logs. A desktop screenshot was saved to `/private/tmp/cubiq-milestone-2b.png`.

The 853 ms observation is one measured request, not a latency percentile or cross-platform guarantee. Core table derivation uses only installed local code/data and no network. The worker budget can still expire on slow or overloaded machines.

## Accurate stopping status and limitations

There is **no known missing F2L placement subset** within the legal ordinary 3×3, fixed-white reference scope: both top and trapped/wrong-slot pieces, flipped edges, twisted corners, and protected-slot combinations are covered by the finite search and exhaustive projected tests. The full requested stage pipeline works end to end.

These are explicit limitations:

- White Cross only; no cross-color selection or color neutrality.
- Greedy pair selection, not global pair-order search, ergonomics-aware ranking, advanced multislotting/pseudoslotting, or a fastest-human-solve claim.
- Progress preservation at insertion boundaries; individual turns may temporarily disturb earlier pieces. During an unsolved Cross, preserving prior pairs is only a local tie break.
- Full-solve optimality always **unproven**. Exact Cross distances and shortest macro-graph pair paths do not prove a globally shortest CFOP or full solve.
- One current algorithm per OLL/PLL case; user preferences/alternates and dedicated trainer flows remain future work. Exact F2L coordinate IDs are not falsely presented as the conventional 41 basic-case numbers.
- Counts describe emitted outer HTM actions. Catalog-only slice/wide notation is compiled privately; public manual entry remains outer faces and x/y/z.
- Client cancel/reset invalidates adoption immediately, but a disconnected worker can finish within its 30-second lifetime. No durable/cancelable job API is added.
- No recorded-solve stage inference, Next Best Move API, timer/TPS, persistent solves, physical capture, analytics, or AI features were added.

## Main files added or changed for 2B

| Area | Files |
| --- | --- |
| Canonical rules helpers | `cubiq/backend/src/coach/cube.py` |
| CFOP planner | `coach/cfop/{search,registry,pipeline,worker,service}.py`, package init, `data/last_layer.json`, `data/CFOP_TRACKER_LICENSE.txt` |
| Shared worker runtime | `coach/solvers/runtime.py`; two-phase adapter reuses its gate/error type |
| HTTP and metadata | `coach/api/cube.py`, `coach/main.py`, health tests |
| Backend tests/reference tooling | `tests/test_cfop.py`, `tests/fixtures/cfop-reference.json`, `scripts/generate-cfop-reference.{py,cjs}` |
| UI | `src/features/cube/SolutionPanel.tsx`, `CubeExplorer.tsx`, `CubeController.ts`, typed API client, responsive solution styles |
| Frontend tests/fixtures | Controller/Explorer tests, `src/test/cube-cfop.json`, typed fixture exports, engine fixture generator/input snapshot |
| Dependencies | NumPy declared directly in backend `pyproject.toml` and `uv.lock`; no new frontend dependency |
| Availability/documentation | App/dashboard milestone text and health fixture; root README; CFOP engine design, architecture, decisions, roadmap, acceptance gates, risks; this report |

Earlier 1A–2A work and reports are preserved. Both local development servers are left running. Open [Cube Explorer](http://127.0.0.1:5173/cube-explorer), choose **CFOP**, scramble/import a legal state, and click **Solve cube**. Installation, start and test commands remain in the [root README](../README.md).
