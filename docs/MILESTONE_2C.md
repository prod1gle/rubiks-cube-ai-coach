# Milestone 2C — Next Best Move and coded ergonomics

Delivered November 12, 2026. Exact-state coaching is usable in Cube Explorer: verified shortest-available complete solutions or genuine CFOP continuation, remaining-pair alternatives, three hint levels, cubie highlights, single moves, automatic recalculation and animated goal playback. Rotations are allowed in coded ergonomic ranking. Learned personalization is explicitly future work pending real practice data.

## Implementation and boundaries

The canonical Python cube engine remains the source of truth. New engine helpers locate physical piece identities in the current viewer and compute explicit shortest frame rotations. `coach.coaching` recognizes current fixed-white CFOP progress, generates bounded Cross/pair/last-layer candidates and independently verifies every endpoint. F2L weighted searches preserve the Cross and all already solved slots at insertion boundaries. Every remaining pair gets alternatives; selection is not a one-example lookup or relabeled generic solve.

Two modes are explicit. Shortest available chooses the fewest HTM among computed verified solutions: shallow one/two-turn results for simple cases, otherwise CFOP versus the existing two-phase adapter. Source failure is disclosed; no global minimum is claimed. CFOP compares next-goal sequences using HTM or the documented `comfort-1` policy. Slot loss ranks first, then ergonomic points or HTM, with rotation counts and deterministic tie breaks. The formula is:

`HTM + 2 × rotations + 2 × B + 1 × D + 0.35 × F + 0.15 × L`

These are generic right-handed heuristic points, not learned weights or measured seconds. A `y R U R'` insertion can beat `B U B'` despite a rotation. Disabling rotations keeps the current grip. The existing 2B full-CFOP Solve button retains its original HTM planner; the new ergonomic policy is used by coaching.

Subtle identifies actual target pieces, Guided supplies a deterministic strategy, and Full reveals notation and apply/play controls. Full CFOP means the selected pair/stage; Full short-solution mode means the remaining cube. Target outlines follow the actual backend-provided current cubie IDs; occluded targets remain outlined for inspection by orbiting.

The frontend binds recommendations to exact hashes/settings and rejects stale or inconsistent results. Arrival and alternative selection leave state unchanged. All applied notation goes through the existing verified plan queue and exactly-once animation commit. Ordinary manual moves clear the prior intent and trigger a new request after acceptance. Single suggested moves instead carry a validated original-state/candidate/prefix context until that insertion ends. This prevents a temporarily disturbed Cross causing the coach to recommend undoing its own insertion. Current progress remains honest during that disturbance; explicit Replan discards the context. Context errors expose retry/replan and retain the accepted cube.

See [the API contract, cost policy, runtime scope and personalization plan](COACHING.md). The canonical schema, public move grammar, hashes and counting semantics are unchanged. No dependencies, fake analytics, physical vision, timing capture or AI features were added.

## Verification

All checks run in the existing macOS ARM64 environment: Python 3.12.3, uv 0.13.7, Node 22.17.1 and npm 10.9.2.

| Check | Result |
| --- | --- |
| Complete backend pytest suite | **924 passed**, 42.24 seconds on the final run. |
| Complete frontend Vitest suite | **90 passed** across five files, 17.27 seconds on the final run. |
| TypeScript + Vite production build | Passed without build warnings. |
| ESLint, zero allowed warnings | Passed. |
| Ruff lint and format verification | Passed; 25 Python files formatted. |
| Offline backend source/wheel build | Passed. Coaching modules, registry JSON and complete MIT notice verified inside wheel. |
| Git whitespace check | Passed. |

The 85 added backend tests cover:

- Completed Cross plus only FL solved, all three remaining pairs, distinct macro alternatives, exact protected-slot endpoints, and current-view physical-piece highlights.
- `comfort-1` formula, the rotation-over-B example, fixed-grip behavior, every one of the 24 viewer frames, and all 576 source/target frame transformations.
- All 32 pair/protected-mask domains retain their complete 8,256 reachable projected configurations under weighted search; each reachable non-goal has a descending edge. Existing 2B exhaustive full-state completions still run.
- Repeated actual CFOP coaching goals solve 12 deterministic 25-face-turn scrambles, seeds `0x2C00 + [0..11]`, without calling two-phase under the CFOP label.
- Verified complete short solutions, shallow cases, unavailable native candidate fallback, rejection of injected incorrect output, exact HTTP state binding, legality/schema rejection, single-move insertion continuity and invalid-context rejection.

The 19 added frontend tests cover actual request payloads, partial-state progress, accessible hint-level tabs, alternative selection/highlights, exact first-move commit, duplicate callback protection, insertion continuity across a transient Cross break, manual alternatives clearing intent, full goal playback to solved, mode/ranking switches, explicit future personalization, errors/retry/replan, stale/reset/disconnect replies, inconsistent metadata rejection and stopping a queued algorithm at its exact accepted state. Test-only fixtures are engine-generated snapshots and recommendations; runtime code imports no test/demo results. All earlier engine, CFOP, solver and animation regressions remain included.

## Running-app evidence

Used the real local Vite/FastAPI services and Three.js scene, without mocked responses:

1. Applied `z2 B U' B'` from solved. Coaching recognized the Cross and three solved pairs, selected BR, and offered `y R U R'` at 3 HTM / 1 rotation / comfort 5, versus the rotation-free `B U B'` at 3 HTM / comfort 7. The actual target cubies were outlined.
2. Applied the suggested `y` once: grip changed and HTM did not. Applied suggested `R` once: current progress honestly showed Cross pending, while the verified remaining hint was `U R'` rather than an undo. Playing that suffix reached solved.
3. Reset and applied `z2 R U R' L U2 L' B U B'`: Cross and exactly FL solved. Coaching compared 36 generated candidates and displayed 12 alternatives across FR, BL and BR. Selecting BR changed notation/highlights without changing the cube.
4. Applied an ordinary `U`. Coaching automatically recomputed from that new accepted state, still reporting Cross / F2L 1 of 4. The recommended BL sequence changed to `U L U' L'` and protected FL.
5. Switched to Shortest available. Actual computed alternatives were two-phase **21 HTM** and CFOP **48 HTM**, both verified and unproven. Full playback reached solved.
6. Checked 1280×900 desktop and 390×844 mobile layouts: readable controls, target outlines, all hint levels and no horizontal document overflow. Temporary viewport overrides were reset. Desktop proof saved at `/private/tmp/cubiq-milestone-2c.png`.

An already-open pre-upgrade Vite tab initially retained an older controller instance through hot reload; refreshing loaded the updated class and resolved that development-only error. The documented fresh-load flows produced no further browser warnings/errors. Keep this distinction explicit rather than hiding the recorded initial log.

## Files changed

| Area | Main files |
| --- | --- |
| Canonical helpers | `cubiq/backend/src/coach/cube.py` |
| Coaching | `cubiq/backend/src/coach/coaching/{__init__,ergonomics,service}.py` |
| HTTP / metadata | `cubiq/backend/src/coach/api/cube.py`, `coach/main.py`, health tests |
| Backend coverage | `cubiq/backend/tests/test_coaching.py` |
| Typed client and synchronization | `cubiq/src/api/cube.ts`, `features/cube/CubeController.ts` |
| Controls / scene / styling | `CoachPanel.tsx`, `CubeExplorer.tsx`, `CubeViewport.tsx`, `CubeScene.tsx`, `src/styles/index.css` |
| UI tests / fixtures | `Coaching.test.tsx`, controller/viewport tests, `src/test/cube-coaching.json`, `cube-data.ts`, fixture generator |
| Milestone availability | App/dashboard text and health fixtures/tests |
| Documentation | Root README, `COACHING.md`, this report, architecture, conventions, decisions, roadmap, acceptance tests and risks |

## Accurate stopping status

The requested fixed-white virtual Next Best Move workflow is complete and usable. No globally best move, full-solve optimality proof, measured fastest execution or automatically trained model is claimed. Pair/algorithm/grip alternatives are bounded; color neutrality, advanced multislotting, global pair order, finger tricks and algorithm familiarity remain outside this checkpoint. Intermediate turns may disturb protected pieces before insertion boundaries. Automatic recalculation is state-driven and subject to real compute latency; native two-phase work keeps its 30-second isolated budget.

Personalization follows actual opt-in practice capture/storage, not fabricated data. The documented next steps specify real timing provenance and preference feedback, exclusion of animation/uncertain timings, held-out evaluation, versioned learned costs and a deterministic fallback. A future model may only rank engine-verified candidates. There is no practice dataset or trainer implemented in this milestone.

Both development servers are left running. Open [Cube Explorer](http://127.0.0.1:5173/cube-explorer), apply a scramble or legal state, and choose **Get a hint**. Exact macOS install/run/test commands remain in the [root README](../README.md). This milestone stops before timers, persistent practice records and personalization.
