# Learn, solve, improve

This refinement organizes the existing engine, solver, trainer, scanner, and analysis tools into a single local speedcubing workspace.

## Main journeys

- **Learn to Solve:** a dedicated beginner curriculum, explicit cube grips, interactive canonical-state exercises, demonstrations, and objective checks. Lessons are authored teaching examples; they are not a universal camera-driven beginner solver.
- **Solve Studio:** the dedicated timing area. Physical stopwatch practice, canonical virtual solves, and experimental camera assistance remain distinct input modes. Optional video supports human review without implying automatic move recognition.
- **AI Coach:** recommendations grounded in actual saved records and validated analyses. Engine coaching works without a model. An optional configured model can select approved recommendations after explicit opt-in, but cannot invent algorithms or performance facts.
- **Improve:** Cube Explorer, Algorithm Trainer, Solve Analysis, History, and Guided Scan remain directly accessible.

## Data boundaries

The Python cube engine remains the only authority for move semantics and reachability. Beginner demonstrations and practice checks use it, as do the existing solver and coaching services.

Physical stopwatch records do not contain fabricated move events, stage boundaries, TPS, or engine-confirmed completion. They use a separate SQLite table and explicitly describe their timing source. Virtual performance averages retain their existing scope.

Video is an optional browser-local recording. Recording consent, camera permission, preview, review, and download are visible actions. Download a clip before leaving the page if it is needed later. Media recording does not establish that a turn occurred, and no video is submitted to an AI provider by this workflow.

Model output is untrusted. The AI service constructs facts from actual records, restricts selections to approved fact/template pairs, rejects additional assertions, and renders the final wording itself. Model failure falls back visibly to verified engine coaching. This is constrained AI-assisted prioritization, not a trained personal performance model or unrestricted chatbot.

## Acceptance gates

1. Every navigation destination loads directly and exposes a meaningful empty, loading, failure, or working state.
2. Beginner exercise starts and demonstrations validate through the engine; success requires the stated goal and preserved prerequisites.
3. Physical and virtual timers retain monotonic timing and honest interruption behavior. Physical records survive an application/database restart.
4. Optional recording fails safely when permission, browser support, camera, or recorder startup is unavailable; timing remains usable. Tracks and object URLs are cleaned up.
5. AI provider calls require explicit opt-in and server configuration; unrecognized selections, invented facts, timeouts, and malformed responses cannot reach the UI as AI advice.
6. Existing cube, CFOP, alternatives, comparison, training, and camera regression tests continue to pass.
7. Each feature has an independent tested Git commit and push, followed by a workspace integration checkpoint.

## Remaining limits

Single-camera recognition remains conservative and experimental. Synthetic tests do not establish physical accuracy. Video review is manual; arbitrary fast-solve reconstruction and automatic video-derived CFOP analytics are not claimed.

Beginner lessons cover representative exercises with written guidance for repetition and case handling. They do not imply exhaustive recognition of every layer-by-layer beginner case. Existing general CFOP solutions remain available in Explorer.

Local model inference requires installing/running a compatible model service separately. The app never displays a successful model response when no inference occurred. Algorithm ergonomics remain explicitly coded heuristics; personal learning requires more real, suitably measured practice data.
