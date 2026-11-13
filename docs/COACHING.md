# Next Best Move — contract and ranking

Implemented in milestone 2C. `coach.coaching.service` coordinates recognition and candidate generation; `coach.coaching.ergonomics` owns versioned costs and weighted pair paths. `coach.cube.CubeState` remains the sole authority. No browser permutation, reachability, stage-recognition, or move-count rules are added.

## Request and exact-state binding

`POST /api/cube/next` accepts exactly one canonical `state` or current-view `facelets`, plus:

```json
{
  "mode": "cfop",
  "ranking": "ergonomic",
  "allow_rotations": true
}
```

These fields accompany the state input; the example omits that input for brevity. Modes are `cfop` / `short`, rankings `ergonomic` / `htm`. The canonical engine validates legality before generating recommendations. Schema and legality errors return 422. Invalid candidate goals return no moves. Short mode always reports HTM ranking and no proposed grip rotations, regardless of irrelevant CFOP settings.

The response includes `input_hash`, exact CFOP `progress`, `recommended_id`, bounded `candidates`, `evaluated_candidates`, `elapsed_ms`, `comparison_scope`, warnings, `ranking_policy`, and explicit personalization status. Each candidate contains input/result hashes, goal/slot/source, normalized notation/first move, `verified: true`, `optimality: unproven`, HTM/rotation/face counts, comfort points, preserved/lost slots, endpoint progress, target piece identities/current viewer cubie IDs, and deterministic subtle/guided hints. A solved cube returns no candidates. Elapsed time measures computation, not execution speed.

React binds results to the exact snapshot hash and requested settings. Move input remains available while hints compute. Abort/serial guards reject replies after moves, reset, import, disconnect, or superseding requests. Hints are opt-in; once enabled they refresh after stable accepted transitions. Pending batch animation suppresses recalculation until idle; pause and stop pending moves to coach that intermediate snapshot. Arrival/alternative selection never mutates the cube. Applying hints uses the existing engine-plan queue and exactly-once animation commit path.

## Candidate generation

- **Cross:** complete white-Cross projection distances; the standard shortest Cross plus shortest descending first-turn alternatives, translated into candidate grips. Endpoint loss of existing pairs is disclosed and ranked first. Cross distance optimality does not imply whole-solve optimality.
- **F2L:** identify all four slots in the fixed white-down/green-front reference; consider every unsolved pair. Weighted Dijkstra uses the existing engine-derived 27 U/insertion/extraction macros. It retains all pre-existing solved slots and Cross at every macro endpoint. For each pair/grip, offer the best weighted path and bounded distinct first-macro deviations. Full states, not just pair projections, verify every path. Paths are bounded at 48 body actions.
- **OLL / PLL / AUF:** prerequisite-gated registry recognition and verified setups/algorithms, translated into candidate grips. The existing 57/21 registry coverage and separate AUF rules apply. No generic solver is relabeled CFOP.
- **Shortest available:** direct one/two-turn search for trivial states; otherwise compare independently verified complete CFOP and two-phase solutions. If two-phase is busy/unavailable, return the verified available result with a warning and retry that source on a later request. No optimality label is inferred from a solver brand or short length.

Rotation-enabled CFOP compares the current grip and four white-down y-related working grips. The engine computes explicit shortest x/y/z rotation prefixes across its 24 valid frames. It does not rotate back implicitly; the resulting grip is part of the exact final hash. Camera orbit remains unrelated. Rotation-disabled mode uses only the current grip. The UI retains up to four candidates per remaining pair, including a different macro path and a rotation-free baseline when available; other goals retain up to five. `evaluated_candidates` can exceed visible alternatives. This is a finite generated pool, not exhaustive whole-cube search or global pair-order optimization.

## Coded ergonomics `comfort-1`

Completed-slot loss ranks first. Pair candidates losing protected progress are rejected outright. HTM ranking then orders by HTM, rotation actions, comfort points, and deterministic notation. Ergonomic ranking orders by comfort points, HTM, rotations, and notation:

| Component | Points per action |
| --- | ---: |
| Any physical outer turn | 1 |
| x/y/z grip rotation | 2 |
| Additional B penalty | 2 |
| Additional D penalty | 1 |
| Additional F penalty | 0.35 |
| Additional L penalty | 0.15 |
| Additional U/R penalty | 0 |

Quarter, prime, and double turns each count as one action. HTM counts rotations as zero. Dijkstra uses integer hundredths to avoid floating-point tie errors; display values divide by 100. For example, in a white-down grip, `B U B'` scores 7, while the equivalent goal achieved by `y R U R'` scores 5 (3 HTM + one rotation). These are generic right-handed heuristic points, not measured seconds, calibrated human difficulty, finger-trick simulation, or a learned model. The original full-CFOP Solve button remains the milestone 2B HTM planner; this cost policy governs Next Best Move.

## Continuing an insertion one turn at a time

An insertion such as `R U R'` can temporarily break the Cross after `R`. Replanning a new Cross at that moment can undo the intended insertion. Single suggested moves therefore carry optional self-contained context:

```json
{"start_state": "<original canonical object>", "candidate_id": "<id>", "consumed": 1}
```

The field shown as a placeholder is a real schema-1 state object in actual requests. The backend reconstructs that original candidate under the same settings, checks its ID, applies exactly the consumed prefix, and requires equality with the supplied current state including grip. It independently verifies the remaining suffix reaches the original endpoint, then returns that suffix with current progress/highlights. It does not pretend transient progress is solved or claim the suffix is a new globally best move. Reaching the endpoint resumes ordinary next-goal coaching.

Manual moves, undo/redo, seek, reset/import, full-sequence application, solver requests and settings changes clear insertion intent. **Replan from current state** deliberately clears it, including after a context error. Missing/stale context never licenses inventing state; inconsistent context returns `hint_context` 422. No persistent server session is created.

## Personalization after actual practice capture

Not implemented; response status is `not_implemented`. Real practice capture/storage does not exist yet, so there is no honest dataset to train on. Keep `comfort-1` as the deterministic fallback and add personalization only after:

1. Add opt-in local practice records: exact start/end states, engine/catalog/profile versions, candidate alternatives shown, chosen sequence, grip/hand preference, real timestamp provenance, completion/errors, and explicit preference feedback. Never use animation duration or fabricated solves as physical execution data. Keep virtual, manual and physical measurements distinct; exclude capture gaps and uncertain timing.
2. Expose minimum-data/coverage status and allow export/deletion before fitting. Validate that comparison data is informative; different cases, familiarity, pauses and selection bias can confound duration.
3. Fit a modest regularized preference/cost ranker with versioned features, evaluate held-out sessions against the coded baseline, and report sample sizes and uncertainty. Retain the baseline for unseen cases or insufficient evidence.
4. Learned ranking may only reorder engine-verified candidates under the selected objective and preservation constraints. It cannot invent moves, override legality, or turn a preference prediction into an optimality proof.

This roadmap is a dependency on real practice work, not an automatic background-training feature or a promise that the model will improve merely by leaving the app running.

## Runtime limits

CFOP hint graphs are bounded and cached in memory (weighted tables: 160 entries); short-solution results cache 64 states. Hint coordination runs in FastAPI's synchronous request thread; finite-graph CFOP hint work is not a separately killable job. The native two-phase adapter retains its one-worker admission gate and 30-second isolated budget; the frontend hint timeout is 35 seconds. Automatic refresh means automatic computation after accepted moves, not a zero-latency guarantee. This is a local single-user workflow, not a multi-user job scheduler.

Fixed-white CFOP, bounded alternative generation and generic face costs do not cover color neutrality, advanced multislotting, user algorithm catalogs, global pair ordering, finger tricks, measured execution times, or learned familiarity. The full-cube engine and all candidate endpoints remain independently validated regardless of ranking policy.
