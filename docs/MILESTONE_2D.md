# Milestone 2D — What Could I Have Done Instead?

Delivered November 13, 2026. Solve Analysis now reviews real applied Explorer history or a complete user-entered record, reconstructs exact segment boundaries, compares verified alternatives for a shared objective, replays two interactive cubes with synchronized steps, explains computed differences and supports retrying the original case. No timing, physical capture, durable solve database or learned personalization is claimed.

## State and objective contract

`POST /api/cube/analysis` accepts one initial canonical `state` or viewed `facelets`, the complete recorded `sequence`, zero-based `start` / exclusive `end`, ranking `objective` (`fewest`, `cfop`, `training`), shared `goal` (`auto`, `position`, `cross`, `f2l`, `oll`, `pll`, `solve`), and optional complete-record `expected_end_hash`. The UI displays one-based inclusive action indices. Every prime/double/rotation is one action; rotations cost zero HTM.

`coach.analysis.service.reconstruct` validates the complete notation and initial state, applies the exact prefix, selected segment and suffix with the immutable canonical engine, and verifies a supplied final hash. Original state, frame and history are never overwritten. Limits are 1,024 recorded actions, 128 selected replay actions and the existing 10,000-character grammar bound. Out-of-range, empty, oversized, illegal, malformed and mismatched records return a clear 422. Missing moves cannot be reconstructed or inferred.

The response supplies the start snapshot, exact actual end snapshot/plan, record hashes/indices, goal, verified alternative plans/endpoints, counts, preservation metadata, relative differences, warnings and an unproven-optimality disclosure. Each candidate is applied to the identical start using `coach.cube`; both intermediate replay snapshots and ending predicates are engine-derived. There is no competing frontend move logic.

Automatic goal recognition selects newly reached solvedness, PLL, OLL, F2L slots or Cross. F2L requires every slot solved at the actual endpoint plus previously solved protected slots and the white Cross. If progress regresses or no new goal is reached, compare the exact actual physical position instead. Explicit goals must also be satisfied by the actual segment; an unmet choice is rejected. An exact physical endpoint may have a different final grip. Both physical equality and full state/frame equality are returned and shown separately. Goal-equal alternatives can leave different remaining cubies; they never reuse the recorded tail unchecked.

## Candidate generation and ranking

- Adjacent same-face-token simplification is independently engine-verified; it does not commute turns, perform browser notation math or claim a complete optimization pass.
- CFOP alternatives vary the first generated pair/path/grip and continue the genuine protected pipeline only until the requested predicate holds. Cross and completed slots remain protected at insertion boundaries when the Cross was solved. Per-turn temporary disturbance is explicit. At most 16 opening alternatives and eight continuation goals are considered, with a 128-action output cap.
- Fewest Moves additionally compares computed complete short solutions when they satisfy the goal. Arbitrary physical endpoints use a verified bridge: solve the start, then reverse a solution of the actual end translated into the starting grip. A bridge is labeled a bridge, never CFOP. It can be longer than the actual segment and intermediate CFOP preservation is not claimed.
- Duplicate words retain verified CFOP provenance when available, so a previously found simplification cannot accidentally lose its staged qualification during ranking.
- Fewest Moves ranks by HTM, then rotations and deterministic notation. CFOP Efficiency first prefers verified staged paths, then HTM/rotations. Training Recommendation first prefers staged paths, then the fixed `comfort-1` score, HTM and rotations. The score is `HTM + 2×rotations + 2×B + D + 0.35×F + 0.15×L`, documented generic right-handed heuristic points, not seconds or learned preferences.

Up to six distinct alternatives are shown. Global optimality is always unproven. A bounded pool may find no improvement or no distinct alternative; the UI says so and retains the actual segment/boundaries. No physical execution times or speed savings are invented. Capture, persistent practice data and personalization remain later milestones.

## Replay and practice

Explorer exports its verified baseline, only the applied history prefix and accepted current hash. Future solution previews are excluded. Session storage transfers this record across navigation/refresh; it is not advertised as permanent solve history. Solve Analysis supports direct entry with an honest empty record and initial facelet editing. The UI contains a real implemented navigation destination rather than the old placeholder.

`ReplayController` orders two opaque engine plans. Their starting hashes must match; both state chains and endpoint/count metadata are checked before rendering. A completion barrier commits the shared cursor only after both animations finish. Duplicate/late callbacks cannot advance twice. Reverse steps use supplied inverse descriptors and saved snapshots. Shorter branches hold their endpoint. Pause finishes the current shared step; shared scrubbing/restart/end controls and independent camera orbit/zoom work. Animation speed is explicitly simulation. WebGL fallback and reduced motion use the same barrier contract.

Show Me Why exposes exact start/end hashes, protected slots, verified HTM/rotation differences, physical/full-state endpoint equality, source and ranking policy. It does not imply that stage-only move savings predict full-solve savings or speed.

Practice uses a separate existing `CubeController` initialized from the original validated start snapshot, not the comparison cursor or recommended endpoint. Face/grip controls and manual algorithms use the canonical plan queue. `POST /api/cube/analysis/practice` reconstructs the original record again and independently applies the retry; acceptance checks the same goal and protected endpoint constraints, not token equality. Reset returns to the exact original state/frame, invalidates active callbacks and clears only the retry. Practice does not mutate the recorded solve or create fake persistent attempts.

## Verification

Environment: macOS ARM64, Python 3.12.3 / uv 0.13.7, Node 22.17.1 / npm 10.9.2. Exact commands remain in the root README.

| Check | Result |
| --- | --- |
| Full backend pytest | 975 passed in 56.78 seconds. |
| Full frontend Vitest | 105 passed across seven files in 12.86 seconds on the final run. |
| TypeScript + Vite build | Passed. |
| ESLint with zero warnings | Passed. |
| Ruff lint / format | Passed. |
| Offline backend source distribution / wheel | Passed; analysis/coaching modules and CFOP data/license included. |
| Git whitespace and local Markdown links | Passed. |

The 51 new backend tests cover every viewer grip and rotated segment boundaries; same-goal equivalence; Cross plus one FL pair preserved; distinct physical endpoints satisfying the same F2L goal; all three ranking policies and CFOP provenance ties; arbitrary physical endpoint bridges with rotations; adjacent simplification; 1,024-action reconstruction and 128-action replay boundaries; invalid ranges/goals/states/final hashes; repeated CFOP comparisons over six deterministic scrambles (seeds `0x2D00 + [0..5]`); actual HTTP requests; and alternative practice sequences accepted by goal.

The frontend additions cover shared starts and completion barriers, duplicate/stale callbacks, inverse replay and unequal lengths, paired play/pause, corrupt chains rejected before mounting, exact record/range transport, counts/explanations, alternative selection resetting both cursors, practice initialization/verification/reset, changed/cancelled/error requests, Explorer applied-prefix export and original-case restoration. Navigation tests now verify the implemented analysis screen. The existing 60-turn user-event playback test hit its old five-second timeout under concurrent backend CPU load; its focused budget is now 15 seconds, with all state assertions retained. The final full frontend run passed. Test-only fixtures are captured from the real backend by `cubiq/scripts/generate-analysis-fixtures.py`; runtime imports none of them.

Live browser verification used the actual local services and Three.js scenes:

1. Applied `z2 B U' B' B U U U U U B'` in Explorer, then used its review link. Analysis received the original solved baseline and all 11 accepted actions with a matching final hash.
2. Selected actions 5–11 and Training Recommendation. Both starts matched hash `5cf980e9ef2251ee3d36bb237e744130ab2e740ac88c00b529a1acaf02115bcc` in grip `DLFURB`, with Cross and FR/FL/BL protected.
3. Actual `B U U U U U B'`: 7 HTM, zero rotations. Alternative `y R U R'`: 3 HTM, one rotation, coded cost 5 versus 11. Show Me Why correctly reported four fewer moves and one more rotation, no speed estimate.
4. Stepped both branches, then played to their verified solved endpoints. Actual finished at 7/7 and alternative at 4/4 with its different grip; the shorter branch held its endpoint.
5. Opened Practice after completed replay, applied `y R U R'` from the original start and received real backend confirmation: objective achieved, 3 HTM, one rotation, protected slots preserved.
6. Checked 1280×900 desktop side-by-side and 390×844 mobile stacked layouts without horizontal document overflow. Temporary viewport override was reset; browser warning/error logs were empty. Screenshot saved at `/private/tmp/cubiq-milestone-2d.png`.

## Files and stopping status

New backend package: `coach/analysis/{__init__,service}.py`; endpoints/models in `coach/api/cube.py`; new `tests/test_analysis.py`. New frontend feature directory: `src/features/analysis/{SolveAnalysis,ComparisonReplay,CasePractice}.tsx`, `ReplayController.ts`, `recording.ts` and tests. Updated typed API client, CubeController/useCube restoration/export, Explorer review link, routing/navigation, responsive styles and milestone metadata. Added engine-generated analysis fixtures/generator and updated README, roadmap, architecture, decisions, risks and acceptance gates. Earlier 2C work and its milestone report are preserved.

The requested comparison flow is complete within the fixed-white, known virtual-record scope. Durable solve storage, inferred timed stage classification, physical capture/gap recovery, full remaining-solve comparisons, physical setup notation and learned training recommendations remain future work. This checkpoint does not claim the entire original M5 persistent counterfactual-review gate.

Analysis runs finite CFOP coordination in a synchronous request thread; it is not a new killable job service. Complete-solution/bridge generation can involve existing native workers, each retaining its 30-second budget and shared admission gate. The browser waits 35 seconds then preserves the record with a retryable error; cancellation prevents adoption but does not necessarily stop backend computation. Cold/overloaded requests can time out honestly. Core operation requires no network after installation.
