# CFOP engine v1

Milestone 2B implements a genuine strict CFOP pipeline for ordinary legal 3×3 states: Cross, four F2L pairs, OLL, PLL, and final AUF. It never invokes a generic full-cube solver. Cross color is currently fixed to white; color-neutral solving is not implemented.

## One engine and a fixed reference

`coach.cube.CubeState` remains the only cube representation and move implementation. New engine helpers expose exact layer predicates, reference-frame transformations, catalog notation compilation, and projected piece transitions. Search tables contain projections of those engine transitions, not independently authored move rules. Every stage is replayed and checked using full `CubeState` objects before returning a plan.

The canonical palette has white at color identity `U`. CFOP uses **white down, green front**, reference frame **`DLFURB`** (the engine's `z2` grip). In that reference:

| Reference face | Canonical color identity | Display color |
| --- | --- | --- |
| U | D | Yellow |
| R | L | Orange |
| F | F | Green |
| D | U | White |
| L | R | Red |
| B | B | Blue |

`in_reference(frame)` derives the viewed stickers, relabels the six centers as URFDLB, and immediately imports a validated `CubeState`. This is a temporary search coordinate view, not a competing live state. `reference_sequence` maps each planned outer turn back to the user's current grip. The coordinator checks that applying it gives exactly the same rebased cubies after each stage. The live cube's grip never changes implicitly.

Therefore an AUF may be rendered as a face other than `U` when the user is holding the cube in a different grip. Stage case IDs and registry algorithms use the white-down reference; **stage `notation` and all playback tokens use the current grip**. `reference_notation`, `setup`, and `algorithm` are explicitly reference data.

## Precise predicates

These are center-relative piece predicates, not visual guesses from one solid face. Indices below describe the rebased white-down `CubeState`, using the existing engine conventions.

| Goal | Exact condition |
| --- | --- |
| Cross | Edges DR, DF, DL, DB (indices 4–7) occupy their home positions with orientation zero, including matching side colors. |
| FR pair | DFR corner 4 and FR edge 8 are home and oriented. |
| FL pair | DLF corner 5 and FL edge 9 are home and oriented. |
| BL pair | DBL corner 6 and BL edge 10 are home and oriented. |
| BR pair | DRB corner 7 and BR edge 11 are home and oriented. |
| F2L | Cross and all four pairs are solved. |
| OLL | F2L is solved and all four top corners/edges have orientation zero. |
| PLL | OLL is solved and one of `identity`, `U`, `U2`, `U'` reaches fully solved. |
| AUF | The exact final U alignment; empty if already aligned, unavailable before PLL. |

Pairs can individually be home before Cross, but OLL and PLL recognition is gated on their actual prerequisites. A solid bottom face with mismatched side stickers is not a solved Cross. PLL up to AUF and fully solved are distinct predicates. Skips are explicit zero-move stages.

## Cross search

Track the four Cross edges by position and orientation. Their legal projection contains
`12 × 11 × 10 × 9 × 2⁴ = 190,080` states. The implementation uses a dense base-24 coordinate space of `24⁴ = 331,776`; invalid repeated-position coordinates remain unreachable.

All 18 face-turn transitions are projected from `coach.cube`. A complete reverse breadth-first search from solved generates exact HTM distances, reaching all 190,080 coordinates with maximum distance 8. Following decreasing distance yields a shortest fixed-white-Cross sequence. Among descending moves, a local tie break favors currently completed pairs. It does not optimize the remaining solve or promise preservation of pairs during an unsolved Cross.

The coordinator independently checks the Cross word's length against this exact table and verifies that each turn descends the distance. A generic full-cube solution cannot be inserted as a long Cross stage and relabeled CFOP.

## General F2L through a finite insertion graph

The engine derives 27 macros: `U/U2/U'`, and each side-turn conjugate `A Uᵏ A⁻¹` for `A ∈ {R,R',F,F',L,L',B,B'}` and `k ∈ {1,2,3}`. These are ordinary pair extraction/insertion triggers. Every macro is validated to preserve the Cross at its endpoint. Its exact preserved-slot mask and its piece-coordinate transitions come from the engine.

For each target slot and subset of other completed slots, Dijkstra search computes a path for the target corner and edge, using only macros that preserve every protected slot. Macro costs are the actual compiled outer HTM actions. A target pair is represented by:

```text
corner_coordinate = 3 × corner_position + corner_orientation
edge_coordinate   = 2 × edge_position + edge_flip
pair_coordinate   = 24 × corner_coordinate + edge_coordinate
case_id           = F2L-{FR|FL|BL|BR}-{pair_coordinate, three digits}
```

The protected-slot mask is separate context: the same pair ID can have different valid paths as other slots become protected. This identifies precise configurations rather than assigning the conventional 41 basic-case numbers to arbitrary wrong-slot states. The 41 basic cases are not a complete representation of all pieces trapped in other unsolved slots.

With `k` other protected pairs, the target corner and edge can occupy `8−k` available positions, with 3 and 2 orientations respectively. The projected graph reaches all `6(8−k)²` possibilities:

| Protected pairs | Reachable target configurations per slot/mask |
| --- | --- |
| 0 | 384 |
| 1 | 294 |
| 2 | 216 |
| 3 | 150 |

Across four target slots and all eight valid protected masks per target, this is **8,256 configurations**. Every one is completed into an unrelated legal full state in pytest, then solved and checked with the canonical engine. All require at most **11 HTM in this macro graph**. Coverage includes top-layer pieces, flipped edges, twisted corners, both pieces in place incorrectly, split pairs, and either/both pieces trapped in other available slots. There is no documented missing F2L placement subset within this fixed-reference legal-state scope.

At each pair boundary, the pipeline protects every currently solved slot and greedily chooses the remaining pair with the lowest graph cost; ties use fixed slot order. It applies and verifies each insertion macro and the final target goal. Incidental solved pairs are adopted at the next pair boundary and represented as skipped rows. All four slots appear exactly once in the returned plan.

Preservation is guaranteed at macro endpoints for slots solved at the start of the pair stage. Individual face turns can temporarily disturb them. This is not full HTM-optimal F2L, global pair-order/lookahead optimization, an ergonomics model, or advanced multislotting/pseudoslotting.

## OLL, PLL, rotations and AUF

The structured registry is `coach/cfop/data/last_layer.json`, version `cfop-1`, with 57 numbered OLL and 21 named PLL cases. Each record has an identifier, stage, original notation, and source metadata. Runtime immutable case records add compiled notation and a recognition signature. `GET /api/cube/cfop/registry` exposes the records, valid U setups, reference convention, validated macros and coverage scope.

OLL recognition uses the four top corner twists and four top edge flips, independent of last-layer permutation. The twist and flip constraints give `3³ × 2³ = 216` legal orientations. Rotating the top layer partitions the non-oriented cases into 57 classes. The registry indexes all **215 non-solved orientations**, plus an oriented skip. Tests independently permute the top-layer pieces while checking every orientation.

PLL recognition uses the top corner and edge permutations after OLL. Equal permutation parity gives `4! × 4! / 2 = 288` legal possibilities. For a case algorithm A, enumerate `Uᵃ A⁻¹ Uᵇ`; recognize its exact permutation and return the appropriate pre-U setup. This covers **284 non-AUF permutations** in 21 classes, plus the four aligned/up-to-AUF skip states. The PLL algorithm's result is checked up to AUF, and final alignment is computed as a separate stage. Tests exhaust all 288 permutations.

Case rotations are covered by reference mapping and U setups. Tests compare all 78 standard identifiers against the requested independent reference in all four y reference views, and verify reference-to-current-grip transformations in all 24 grips. No comparison of entire cube state to a single inverse-algorithm example is used as general OLL recognition.

## Catalog notation and counting

The public manual-entry grammar remains outer face turns and x/y/z. Registry-only `compile_catalog_algorithm` accepts standard slice/wide notation and rotations, expands it through engine frame semantics, then emits fixed-frame outer turns. The final grip of a reference algorithm is deliberately discarded; its full center-relative cubie transformation is preserved. Examples of intermediate decompositions are `r = x L`, `M = x' R L'`, `E = y' U D'`, and `S = z F' B`.

The independent cubejs oracle supplies full 54-sticker checks for 36 slice/wide/rotation variants. No browser notation or move logic is added. HTM counts describe the **actual emitted outer-turn actions**, including adjacent turns left separate by the planner. They are not source-algorithm token counts, ergonomic scores, or reduced/global optimal costs.

## Sources and independent validation

- [SolveTheCube algorithms](https://solvethecube.com/algorithms): requested reference for CFOP stages, basic insertions and standard case numbering. Its functional algorithms are used only by optional reference-fixture tooling; explanations, images, site code, and layout are not bundled.
- [CubeSkills F2L reference by Feliks Zemdegs and Andy Klise](https://www.cubeskills.com/uploads/pdf/tutorials/f2l.pdf): reviewed for setup-to-basic-insertion treatment and distinct trapped-piece cases. No source illustrations or prose are copied.
- [linluiben/cfop-tracker algorithm data](https://github.com/linluiben/cfop-tracker/blob/main/js/algs.js): MIT-licensed functional notation for the production last-layer registry. The exact source SHA-256 and access date are stored in the JSON. The full notice is retained in `CFOP_TRACKER_LICENSE.txt` and packaged in the backend wheel. No downloaded JavaScript is executed.
- Existing optional `cubejs@1.3.2` oracle: independently generates 78 reference starting states from SolveTheCube's alternative algorithms and the 36 compiler conformance outputs. The committed fixture makes pytest offline and independent of Node.

Optional regeneration from the repository root, after downloading the requested HTML into `.cache/cfop-reference/solvethecube.html`:

```sh
# The pinned oracle is optional tooling, not an application dependency.
npm install --prefix .tools/cube-oracle --no-save --ignore-scripts cubejs@1.3.2
cubiq/backend/.venv/bin/python cubiq/scripts/generate-cfop-reference.py
node cubiq/scripts/generate-cfop-reference.cjs
```

The HTML parser extracts notation as data and never executes page scripts. The CJS tool imports only the pinned independent oracle, not the application engine or production registry. Runtime checks also reject overlapping/incomplete case maps and algorithms that disturb required lower layers.

## Runtime contract and limits

`POST /api/cube/cfop` validates a legal state, starts a separate CFOP worker with a 30-second wall-clock budget, then re-verifies all eight stage goals, case IDs, macro provenance, protected endpoints and translated notation in the coordinator. The response contains the same top-level solution metadata as two-phase plus `stages`, `reference` and `initial_progress`.

Stage indices are zero-based half-open ranges into the verified animation plan. Counts and hashes must form one contiguous chain; frontend protocol checks reject a mismatched method, missing/duplicated slots, invalid boundaries, or a stale starting hash. Arrival previews future turns without changing the accepted cube. Whole-solution playback and per-stage playback share the existing duplicate/stale-callback protections; stage playback stops at its exact endpoint.

All full-solve optimality labels remain **unproven**. The complete fixed-Cross search does not prove full-solve optimality. The plan limit is 128 actions; the current verified component bounds sum to at most 91 actions. Searches share only a process-admission gate with two-phase, in `coach.solvers.runtime`; no CFOP module imports or invokes the two-phase solving implementation. No durable job queue is introduced. Cancel/reset prevents client adoption immediately; a disconnected worker can finish within its bounded lifetime.

Supported: all legal ordinary 3×3 placements in this fixed white-down reference, all 57 OLL and 21 PLL classes, stage skips, AUF, and all user grips. Not implemented: other cross-color selection/color neutrality, global pair-order optimization, advanced CFOP variants, a persistent algorithm trainer, recorded-solve stage inference, Next Best Move API, timing, physical tracking, or AI coaching.
