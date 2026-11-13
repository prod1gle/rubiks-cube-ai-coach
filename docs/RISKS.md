# Technical risks and limitations

Status: planning assessment, November 12, 2026. Severity combines impact on correctness and delivery uncertainty. These are project-specific limits, not evidence of observed runtime failures.

| Risk | Severity | Consequence | Planned control / acceptance gate |
| --- | --- | --- | --- |
| Move/frame/facelet convention mismatch | Critical | A plausible cube display, solver adapter, or replay represents the wrong state. | One engine; frozen conventions; independent golden and differential fixtures; full state/frame hashes. M1-02–09. |
| Invalid but color-balanced scans/imports | Critical | Solver output appears meaningful for a physically impossible cube. | Cubie uniqueness, orientation sums, parity, centers, and coherent scan validation before solving. M1-08, M7-03. |
| Two-phase mistaken for globally optimal | Critical | Misleading coaching and false minimum-move claims. | Unproven default; explicit proof scope and bounds; independent exact-depth corpus; no solver-brand proof. M3-02–04. |
| Full optimal solving is expensive | High | Long search, memory/table cost, platform-dependent responsiveness. | Budgeted isolated workers, verified incumbent, cancellation, measured depth envelope. No guaranteed deep interactive proof. M3-01, M3-07. |
| Genuine F2L planning and case coverage | High | A CFOP label hides incomplete or incorrect stage behavior. | Pair/slot state goals, extraction/insertion search, protected endpoints, coverage manifest and random-state corpus. No relabeled two-phase fallback. M4. |
| Reference algorithm orientation/setup error | High | A valid algorithm is recommended for the wrong case. | Independent case fixtures, setup/AUF handling, frame variants, protected-layer verification and source/version metadata. M4-04. |
| Single-camera observability | Critical and fundamental | Hidden turns or several move histories can have identical visible evidence. A full state cannot always be tracked uniquely. | Restricted measured envelope, evidence-based abstention, explicit gaps, guided rescan/manual recovery. No inferred hidden moves. M8-02–04. |
| Invisible turns may evade detection | Critical and fundamental | The tracker may not even observe a cue that continuity was lost. A high score for visible stickers does not certify hidden state. | State claims remain conditional on supported observations/operating restrictions; request deliberate visibility and periodic full verification. Do not advertise universal physical-state certainty. Camera confidence cannot remove this limit. |
| Blur, hands, stickerless colors, glare, auto exposure | High | Misclassification, unstable pose, false accepted transitions. | Per-session calibration, temporal evidence, quality gates, held-out multi-session recordings; keep tracking experimental if gate fails. M7–M8. |
| Uncalibrated confidence | High | Percentages imply unjustified statistical reliability. | Label heuristic scores until calibrated; publish sample sizes, error/abstention counts and uncertainty. Zero observed errors is not proof of zero error. M8-01, M8-06. |
| Camera timing and dropped frames | High | False TPS, pause duration, or stage timing even when endpoint is right. | Source timestamps, clock mapping/error, bounded queues, incomplete intervals. Do not substitute receipt/animation time. M2-04–05, M8-03–05. |
| Human stage boundaries are not uniquely inferable | Medium | Predicate milestones are mistaken for recognition/decision times; non-CFOP solves get misleading breakdowns. | Versioned inferred first-attainment labels, raw predicate timeline, manual annotation, unavailable gaps. M5-02. |
| Alternative stage ends in a different state | High | Stage-only move savings are presented as full-solve or time savings. | Explicit goal/endpoint distinctions; validate separate continuations; never blindly reuse later actual moves. M5-04–05. |
| Incomplete capture or timer-only solve | High | Exact review appears available without enough information. | Eligibility filters; unknown values remain unavailable; no reconstructed state across gaps. M5-07, M6-03. |
| Python authority introduces command latency | Medium | Animation/input feels slow or commands race. | Ordered event queue, acknowledged interpolation, no duplicate browser rules, measured local latency, worker isolation. M2-01, M2-08. |
| Browser timer/background/sleep behavior | Medium | Tick counting, reload, or clock discontinuity corrupts timing. | Monotonic clock, explicit clock IDs, original events, integrity flags and practice distinction. M2-03–04. |
| CPU worker/table lifecycle | Medium–high | Warmup stalls API, cancellation leaks processes, native solver differs across machines. | Artifact/version pinning, cache checksums, killable processes, timeout budgets and cold/warm benchmarks. M3-07, M9-04–06. |
| SQLite or schema migration failure | High | Lost solve history or changed reconstruction semantics. | Transactional event/snapshot writes, serialized writer, backups, versioned migrations and hash-preserving round trips. M1-10, M6-01. |
| Dependency/distribution compatibility | Medium–high | A convenient solver cannot be shipped under the intended project terms or runtime. | Evaluate exact artifacts and license compatibility before integration. `kociemba` is a GPL-2.0 candidate, not an adopted dependency. Keep adapters replaceable. TD-06, M1-13. |
| Algorithm content provenance | Medium | Reuse of explanations/images/catalog presentation exceeds intended reference use. | Original diagrams/text; sourced algorithm records; resolve reuse terms before bundling source-derived catalog material. TD-06. |
| Optional AI adds unsupported facts | High | Fluent explanation invents a move, proof, confidence, or performance improvement. | Minimal verified fact bundle, constrained output validation, deterministic fallback, never execute generated notation. M9-01–03. |
| Static hosting mistaken for local backend | Medium | Existing hosting metadata is treated as a deployable full application. | Local FastAPI runtime documented; no hosting mutation in this task; separate future hosting design. M0-03, M9-04. |
| Local service/camera exposure | Medium | A website or another client issues unwanted commands or captures frames. | Loopback binding, origin/token validation, explicit camera permission, bounded inputs, no recording by default. M7-01/04, M9-03/05. |
| Broad product scope | High | Polished demos hide incomplete foundational capabilities. | Sequential acceptance gates; usable virtual coach first; real measurements only; restricted tracking cannot pass a general tracking gate. Roadmap M1–M9. |

## Boundaries of the planned first release

- Only 3×3 legal cubie states; no supercube center orientation, arbitrary picture-cube rules, or other puzzles.
- The minimum-move objective returns the shortest verified candidate found under its budget. “Near-optimal” does not guarantee a known approximation ratio or move gap. Full HTM optimality requires actual proof.
- CFOP completeness is separate from full-solve optimality and from fastest human execution. Initial strict stages do not cover every advanced speedcubing technique.
- Physical capture is conditional on visible evidence and the published operating envelope. A rescan recovers a state, not missing turn history. General unconstrained high-speed single-camera tracking may remain unsolved in this project.
- A valid endpoint cannot prove which intermediate moves occurred or when they occurred. Exact stage review requires continuous, trustworthy move capture.
- Timing and analytics are coaching tools. Virtual input speed, manual timer-only solves, camera timing, and competition timer results are different measurements and remain distinguishable.
- No cloud sync, multi-user service, deployment, external AI provider, or smart-cube hardware integration is required for the local core. Initial platform certification is macOS; other platforms need tested installation paths before support is claimed.

## Decisions to resolve during implementation

M1 selects runtime versions, locks conventions, and records dependency/license suitability without changing project distribution terms by assumption. M3 measures practical proof/table/latency limits. M4 establishes F2L coverage and CFOP completion budgets. M7–M8 establish camera operating conditions and calibration from actual recordings. M9 selects an optional explanation provider only if wanted. These remain future gates beyond the delivered checkpoints; implemented limits and evidence are recorded in the milestone reports.

## M2A implementation limits

The adopted MIT-declared `rubik-solver-py==0.1.1` has a small maintainer base. Pinning and engine verification protect state correctness, not continued upstream support, completeness within a budget, or solution quality. A two-phase result may be much longer than an available solution even for a simple state. No distance from optimum is certified. CFOP and optimality proofs remain separate future work.

Cold table construction and search share a 30-second worker budget. The cache is writable, ignored, versioned local data; an interrupted/corrupt cache can require rebuilding. Only one worker is allowed per FastAPI process; this is a local single-process application, not a multi-user scheduler. Client cancel/reset prevents result adoption but does not immediately kill a disconnected request's worker. It can finish or hit the budget; another solve may receive a busy response in the meantime. The UI freezes move input during a search, and all result adoption is epoch/state-hash guarded. No solver result is ever applied automatically on arrival.

## M2B implementation limits

Fixed-white strict CFOP is implemented and verified, including all legal target-pair placements in the protected-slot graph, all 216 OLL orientations and all 288 legal PLL permutations. This coverage does not imply color-neutral support, global pair-order optimization, ergonomics-aware ranking, advanced multislotting/pseudoslotting, or recorded-solve stage inference. A shortest Cross can produce less convenient pairs; the Cross tie break only favors currently solved pairs locally. Pair-stage protection applies at macro endpoints, not during every face turn. Incidental solved slots become protected at the next pair boundary.

Case data has its own version, source hash, MIT notice, and independent-reference fixture tests. Runtime recognition maps reject overlap/incomplete coverage, and the coordinator rechecks every goal and case selection. The registry-only slice/wide compiler emits ordinary outer turns; reported HTM counts describe those emitted actions. Original notation token counts and human execution times can differ substantially. A CFOP result is never presented as globally minimal or as a relabeled two-phase result. The shared 30-second worker budget/cancellation limitations from M2A still apply.

## M2C coaching and personalization limits

Next Best Move is implemented for exact virtual canonical states; it is not an inferred physical-state tracker. Shortest available means the least HTM among generated verified candidates, not a proof or approximation bound. Fixed-white CFOP considers all remaining pairs but only a bounded path/grip pool, not every algorithm or pair ordering. Slot/Cross preservation applies at insertion boundaries; intermediate face turns can disturb them. Single-step continuation validates its original intent, while a manual alternative intentionally replans.

`comfort-1` uses generic right-handed face/rotation penalties. It does not model finger tricks, hand dominance, lookahead, familiarity or actual execution speed. Explicit regrips may reduce B turns but do not establish a faster human solve. The 2B full-CFOP Solve button is unchanged; ergonomics applies to coaching. Real practice capture, persistence and learned ranking are pending; no animation times are accepted as training data. Future fitting must account for case familiarity, pauses, sparse coverage, selection bias and timing uncertainty, retain a baseline, and only rank engine-verified candidates.

Finite CFOP hint graphs run in a synchronous API thread with bounded caches, not in a killable per-hint job. Rapid edits abort result adoption and invalidate highlights; native two-phase work retains its 30-second worker budget. Automatic recalculation is not a guaranteed instantaneous response or a multi-user performance claim. Context invalidation can require explicit Replan from current state; it never licenses applying a stale recommendation.
