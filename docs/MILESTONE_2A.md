# Milestone 2A — verified full-cube solving

Delivered November 12, 2026. Scope: a local two-phase full-cube solver and solution playback. This checkpoint implements part of the original roadmap's M3 scope; it does not claim completion of M2 capture/persistence, M3 exact optimality/Next Best Move, or M4 CFOP.

## Behavior and architecture

1. `POST /api/cube/solve` accepts exactly one canonical `state` or viewed `facelets`. The existing engine proves legality before search; invalid colors, cubies, orientations, parity, and frames cannot reach the dependency.
2. The adapter passes canonical URFDLB facelets to pinned `rubik-solver-py==0.1.1`, a Python/NumPy Kociemba two-phase implementation. Its private search model is not application state. The exact artifact declares MIT; no project distribution license is selected. [PyPI](https://pypi.org/project/rubik-solver-py/) and [upstream](https://github.com/mrrtmob/rubik-solver-py).
3. A separate interpreter runs one bounded search per API process. The wall-clock worker budget is 30 seconds, including initialization; the candidate limit is 24 outer HTM. A subprocess timeout kills and waits for the worker. The API's synchronous route runs in FastAPI's thread pool, keeping search off the event loop. Busy requests fail explicitly instead of accumulating solver jobs.
4. The coordinator parses the candidate, maps canonical face names to the current grip, applies the complete sequence using `coach.cube`, checks solvedness and unchanged grip, and generates every per-turn playback snapshot through that engine. Invalid output is never returned as a solution.
5. Responses include notation, executed HTM count and metric version, backend elapsed milliseconds, input/result hashes, solver/version, budget, verification flag, status, and a verified animation plan. Every result has `optimality: unproven` and the label **Short solution · optimality unproven**. No certified gap, shortest-found comparison, global proof, or CFOP classification is asserted.
6. The Explorer previews solution steps as future timeline entries. The accepted snapshot/cursor remains unchanged on arrival. Next/previous, play/pause, and return-to-solution-start use the existing single-commit animation path and verified snapshots. History-prefix metrics count only applied turns. A manual branch clears the old solution when committed.
7. Search disables move/seek inputs; reset and Cancel remain available. Epoch and state-hash checks reject late/stale results. Errors retain the accepted state and previous valid history/preview.

An already-solved cube returns empty notation and zero HTM without starting the dependency. It remains labeled unproven by this adapter rather than introducing proof semantics in this checkpoint.

## Verification

All checks passed on the existing macOS development environment (Python 3.12.3, uv 0.13.7, Node 22.17.1, npm 10.9.2):

| Check | Result |
| --- | --- |
| Backend full pytest suite | **410 passed**, 20.32 seconds on the warm-cache run. |
| Frontend Vitest suite | **56 passed**, including the original renderer/controller regressions. |
| Frontend TypeScript + Vite production build | Passed; no build warnings. |
| Frontend ESLint, warnings treated as errors | Passed. |
| Backend Ruff lint and formatting check | Passed. |
| Backend wheel and source distribution, offline | Passed. |
| Running backend and Vite-proxied `/api/health` | Both report milestone `2A`. |

The 82 backend additions include eight known scrambles through the real HTTP boundary/worker, 24 seeded 25-face-turn scrambles, all 24 grips imported as viewed facelets, solved-state handling, invalid states, injected invalid/wrong/over-limit algorithms, malformed worker output, missing worker/crash, timeout, no-result, and bounded-busy behavior. Returned algorithms and every replay snapshot are checked with the canonical engine. Random seeds are `20261112 + [0..23]`. These are deterministic correctness samples, not proof of bounded success on every possible state.

The 21 frontend additions cover preview without mutation, state binding, exact solution start, forward/backward and complete playback, duplicate animation callbacks, pause/restart, blocked edits during search, cancellation/reset with late responses, malformed proof metadata, errors, already-solved input, and manual branching. UI fixtures are genuine engine-verified adapter responses; only elapsed time is normalized in test data. The application never reads these fixtures.

Live browser checks used the running Vite/FastAPI applications and actual Three.js rendering, with no mocked solver responses:

- Applied `x R U2 F' L D B2`: six HTM plus one grip rotation, frame `FRDBLU`.
- Solve returned a verified 13 HTM plan in 169 ms on that warm request, labeled unproven. Viewed facelets before/after preview matched exactly.
- Next and previous solution steps restored the exact starting facelets.
- Animated playback reached solved at solution step 13/13, preserving `FRDBLU`; the viewed solved export was `FFFFFFFFFRRRRRRRRRDDDDDDDDDBBBBBBBBBLLLLLLLLLUUUUUUUUU`.
- Desktop 1280px and mobile 390px layouts displayed the solution metadata and controls without horizontal document overflow. No browser warnings/errors were observed.

## Initialization and limitations

No additional setup command is required beyond the README's locked backend install. The first unsolved request builds local tables in `cubiq/backend/.cache/rubik-solver-py-0.1.1/`. Subsequent worker processes load them. Override with a writable absolute `CUBIQ_SOLVER_CACHE_DIR` before backend startup. Installation requires network; table generation and solving do not.

A fresh-cache adapter check on this machine for `R U2 F' L D B2` measured **6,832.965 ms cold** and **90.163 ms warm**; both returned independently verified 13 HTM solutions. The generated cache occupied about **8.4 MiB**. These two observations are not latency guarantees or percentile benchmarks. Initialization and search share the 30-second budget; slower hardware or an interrupted cache can time out and require rebuilding.

The upstream package is small and has one maintainer. Pinning, subprocess isolation, and verification protect application state correctness, not upstream longevity or solution quality. Even shallow positions may receive much longer algorithms than necessary. There is no certified approximation bound, global optimal search, CFOP solver, or universal timeout-success promise.

Client cancellation immediately prevents adoption and aborts its HTTP wait. The server does not yet expose persistent cancelable jobs: a worker for a disconnected request may continue until it finishes or hits its budget, and another solve may receive `solver_busy`. Run a single FastAPI worker locally. This checkpoint does not add server-side job cancellation, persisted solve sessions, timing, physical capture, analytics, or AI.

## Files changed

- Backend: `pyproject.toml`, `uv.lock`, `src/coach/solvers/{__init__,worker,two_phase}.py`, `src/coach/api/cube.py`, `src/coach/main.py`, `tests/test_solver.py`, and health contract test.
- Frontend: `src/api/cube.ts`, `src/features/cube/CubeController.ts`, `CubeExplorer.tsx`, their tests, solution styles in `src/styles/index.css`, dashboard/shell release text and route-test health fixture.
- Test data/tooling: `scripts/generate-ui-fixtures.py`, `src/test/cube-data.ts`, and `src/test/cube-solutions.json`.
- Documentation: root README; architecture, decisions, roadmap, acceptance gates, risks; this report. Earlier milestone reports retain their historical scope.

## Start and use

From the repository root, use two terminals (full install/test commands are in the [README](../README.md)):

```sh
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv uvicorn coach.main:app --host 127.0.0.1 --port 8000 --reload
```

```sh
npm --prefix cubiq run dev
```

Open [Cube Explorer](http://127.0.0.1:5173/cube-explorer), scramble or import a valid state, wait for pending turns, and click **Solve cube**. Inspect the returned plan, then step or play it. Both existing local development servers are left running.
