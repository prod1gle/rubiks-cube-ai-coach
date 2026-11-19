# Verified algorithm alternatives

The bundled algorithm catalog is data, not executable project instructions. `coach.cube` remains the sole rules engine. All 102 existing training cases retain their original starting state and identifiers (24 F2L insertions, 57 OLL, 21 PLL). Each currently offers 2–4 choices. Importing 41 source F2L classes does not turn the Trainer’s 24-case subset into a complete conventional F2L course.

## Sources and reproducibility

- [SpeedCubeDB OLL](https://www.speedcubedb.com/a/3x3/OLL/OLL_1), [PLL](https://www.speedcubedb.com/a/3x3/PLL), and F2L notation, plus [CubeSkills OLL](https://www.cubeskills.com/uploads/pdf/tutorials/oll-algorithms.pdf).
- Notation was imported through the [MIT-licensed cube-trainer data collection](https://github.com/cellonty/cube-trainer/blob/81272971cc1e212a32645badf3292ea7153d8746/lib/data/alg_data.dart), pinned to commit `81272971cc1e212a32645badf3292ea7153d8746`. Its license is included as `CUBE_TRAINER_LICENSE.txt`.
- `alternatives.json` records retrieval date, pinned upstream URL, raw-file SHA-256, source case labels, individual source links and original notation. Only the 506 F2L/OLL/PLL notation records are imported; upstream application code and descriptive text are not included.
- `backend/scripts/import_algorithm_data.py INPUT_DART LICENSE` extracts string data and verifies the pinned raw SHA-256. It executes no Dart code. The runtime is offline and does not scrape websites.
- Original baseline algorithms and their existing attribution remain available. SolveTheCube remains the project’s recognition/reference source; this expansion does not claim the site authored every imported variant.

## Matching and verification

Source case names never establish correctness. Every imported algorithm is parsed by the canonical engine, compiled for fixed-frame matching, and checked on its inverse state. Invalid notation or broken stage preconditions fail catalog construction.

OLL matching uses corner/edge orientations, covering all 215 non-skip orientation signatures. PLL matching includes both U setup and final AUF, covering all 284 non-skip permutations. F2L algorithms are matched by target-pair coordinates and derived for all four slots with explicit y grips and U setups. Each complete candidate is then applied to the exact requested full state, checking the cross, stage objective and all starting solved F2L slots. Candidate indexing alone never authorizes a recommendation.

Source wide/slice moves remain native notation in training. Explicit regrips restore the starting grip at the end; camera orbit remains independent. Matching uses fixed-frame compiled turns. CFOP full-solve plans retain their established fixed-frame outer-turn contract and independently verify selected algorithm IDs, stage recognition, provenance and endpoint preservation. Displayed stage alternatives retain their source notation and count actual regrips; their emitted counts can therefore differ from the compiled full-solve plan.

An OLL alternative can leave a different last-layer permutation. F2L alternatives can leave different last-layer pieces. These are equivalent stage objectives, not promises of identical whole-cube endpoints. Swapping an early-stage algorithm into an already-computed full solution without recalculation is unsafe; the interface explains this. Next Best Move recalculates against the accepted current state, and retrospective comparison re-verifies its shared objective.

## Selection and integration

At most four choices are exposed for an exact case. Training retains its compatibility baseline and up to three sourced alternatives. A non-baseline option must be within 2 HTM of the shortest generated choice or within 1 coded comfort point of the lowest generated score. Distinct compiled sequences are preferred; a sourced regrip of an equivalent sequence may also be offered. Duplicate normalized notation is removed. The catalog is never padded to four.

Setups, wide and slice HTM, and explicit rotations are counted by the engine. Rotations cost 0 HTM and remain separate actions. The fixed comfort heuristic is not measured execution speed, personalized ranking or a proof of optimality. Native wide/slice choices are filtered primarily by their real HTM; coaching uses compiled outer-turn paths and its existing coded ergonomic grip ranking.

The same catalog feeds:

- Algorithm Trainer: selectable choices, sources, counts, reveal/playback, and exact-state repeat. Changing choices resets the retry; demonstration playback cannot be saved as practice.
- Cube Explorer CFOP: efficient catalog paths can be selected during planning, with original-state alternatives shown per stage.
- Next Best Move: sourced candidates join the existing protected search pool and grip ranking.
- Retrospective coaching / Solve Analysis: the shared recommendation generator supplies alternatives, then complete goal/preservation checks run again.
- CFOP registry API: versioned alternatives accompany the standard case manifest.

`cfop-2` and `alternatives-1` identify this change. SQLite continues to store immutable practice state, notation, case/catalog version and validated result JSON. The result now includes the matched algorithm ID (null for a custom sequence) and alternate catalog version. Existing database rows remain intact; no schema migration or seeded performance records are needed. Saved solve reanalysis already keys its version on the CFOP catalog, so the changed catalog produces a new deterministic analysis version.

## Acceptance evidence

Automated tests cover every Trainer choice, all 78 last-layer classes under U setups, all 24 viewer grips, full-state preservation, exact hashes, HTM/rotation counts, rejected stale frontend choices, catalog provenance tampering, shared coaching/comparison generation and SQLite restart persistence. Imported cases in tests are explicitly labeled fixtures, not measured practice results.

The Trainer keyboard map is visible immediately below the cube, uses the same bindings as Cube Explorer, and enables physical keys by default. Tests cover physical K/I turns, engine state chaining, keyboard opt-out and protected text entry. The previous hidden disclosure was removed.
