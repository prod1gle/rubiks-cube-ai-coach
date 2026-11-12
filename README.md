# Cubiq — Rubik’s Cube AI Coach

A local workspace for more intentional 3×3 practice. **Milestones 1A–1C and 2A are implemented: application scaffolding, the canonical state engine, an interactive 3D Cube Explorer, and verified full-cube solving.** CFOP, optimality proofs, timer, analytics, algorithm trainer, persistent solve storage, physical camera tracking, and AI features are not implemented yet.

## Available now

- React + TypeScript + Vite frontend with Tailwind CSS, a responsive dark layout, keyboard focus styles, reduced-motion support, and skip navigation.
- Six working routes: Dashboard, Cube Explorer, Live Solve, Solve Analysis, Algorithm Trainer, and History. The four future solve/training/history workflows explicitly say **Not implemented yet**.
- Cube Explorer: Three.js / React Three Fiber rendering of all 26 cubies and 54 stickers, smooth face/grip animations, orbit/zoom, keyboard and button moves, manual algorithms, legal random scrambles, reset, undo/redo, and playback. The 2D state inspector and import/export remain available. The frontend never computes cube permutations.
- Full-cube two-phase solving: state validation, independent solution verification, honest optimality labeling, and step-by-step solution playback.
- One immutable Python cubie engine with all face-turn variants, x/y/z grip rotations, complete parsing, serialization, inversion, HTM, and reachability validation. See [the exact cube conventions](docs/CUBE_CONVENTIONS.md).
- A real API connection check on the Dashboard, with checking, reachable, unavailable, and retry states. No sample solves or fabricated analytics.
- FastAPI application factory, typed health response, explicit local CORS policy, pytest, Ruff, and a uv-managed virtual environment.
- Locked frontend/backend dependencies and build, lint, and test commands.

The Dashboard hero cube remains a decorative CSS illustration. The separate interactive Cube Explorer renders real engine-provided geometry and snapshots. The full-cube solver returns engine-verified two-phase solutions with optimality explicitly unproven. The interface makes no timing, vision, or AI claims. Full M1 acceptance remains pending for sessions/events, persistence, stage predicates, and expanded notation; 1B does not imply those are implemented.

## macOS prerequisites

Tested here with **Node 22.17.1, npm 10.9.2, Python 3.12.3, and uv 0.13.7**. Use Node 22.17 or newer within the 22.x line, and Python 3.12. The backend intentionally requires Python `>=3.12,<3.13`; `python3` on your machine may point to another version.

If needed, install Node/Python with an existing Homebrew installation:

```sh
brew install node@22 python@3.12
export PATH="$(brew --prefix node@22)/bin:$(brew --prefix python@3.12)/bin:$PATH"
node --version
npm --version
python3.12 --version
```

Alternatively, use an existing Node version manager with the root `.nvmrc` and your existing Python 3.12 installation. No global Python package installation is required.

## Install both applications

Run these exact commands from the repository root. The quoted path below matches this checkout; change only that path if you move the project.

```sh
cd "/Users/paartharora/Documents/ChatGPT/rubiks cube ai coach"

# Bootstrap the pinned environment manager into an ignored local environment.
python3.12 -m venv .tools
.tools/bin/python -m pip install uv==0.13.7

# Frontend: install exactly the versions in package-lock.json.
npm --prefix cubiq ci

# Backend: create cubiq/backend/.venv and install uv.lock, including dev tools.
.tools/bin/uv sync --locked --project cubiq/backend --python python3.12 --cache-dir .cache/uv
```

Initial installation needs Internet access. `.tools/`, `.cache/`, `node_modules/`, `.venv/`, and generated builds are ignored by Git. uv manages the backend environment; there is no need to activate it. Subsequent core operation uses only local assets and services.

## Run in development

Use two terminal windows.

**Terminal 1 — backend** (from the root):

```sh
cd "/Users/paartharora/Documents/ChatGPT/rubiks cube ai coach"
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv uvicorn coach.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 — frontend**:

```sh
cd "/Users/paartharora/Documents/ChatGPT/rubiks cube ai coach"
npm --prefix cubiq run dev
```

Open [Cubiq](http://127.0.0.1:5173). The Dashboard checks the running backend; start it and click **Check connection** if it was unavailable when the page loaded. Status is the result of the last check, with its timestamp, rather than continuous monitoring. All navigation destinations support direct entry, refresh, and browser back/forward through Vite’s SPA fallback.

- [Health endpoint](http://127.0.0.1:8000/health)
- [Interactive API docs](http://127.0.0.1:8000/docs)
- [OpenAPI schema](http://127.0.0.1:8000/openapi.json)

Stop each process with `Ctrl+C`. Both services bind to loopback. Ports are fixed: Vite exits if 5173 is busy. Stop the existing listener or deliberately update the scripts/proxy/CORS configuration together. No Docker, database, camera access, API key, or cloud service is required.

## Health and local CORS

`GET /health` returns:

```json
{"status":"ok","service":"cubiq-api","version":"0.1.0","milestone":"2A"}
```

`GET /api/health` is an equivalent alias for the frontend’s `/api` proxy. Both Vite development and preview forward `/api/*` to `http://127.0.0.1:8000`. The health endpoint reports API availability, not readiness of future cube features.

Allowed browser origins are explicitly limited to `http://localhost:5173`, `http://127.0.0.1:5173`, and their preview equivalents on port `4173`. GET and POST are allowed; credentials are disabled. CORS controls browser cross-origin access and is not an authentication layer. Cube endpoints are stateless calculations and do not store a shared session.

Check the direct and proxied endpoints:

```sh
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:5173/api/health
```

## Cube engine API

Open [Cube Explorer](http://127.0.0.1:5173/cube-explorer) after starting both applications. Until an engine snapshot arrives, no cube is displayed. Invalid notation/imports retain the last accepted snapshot and show the backend's validation error. Counts describe the current local history prefix; they are not a recorded speedsolve. A page reload starts a new solved workspace; persistent history is not implemented.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/cube` | Validated solved snapshot. |
| `POST /api/cube/validate` | Import exactly one `state` object or `facelets` string. |
| `POST /api/cube/apply` | Import the supplied state and apply `sequence` atomically. |
| `POST /api/cube/sequence` | Return normalized notation, inverse, executed HTM, and rotation count. |
| `POST /api/cube/plan` | Validate up to 128 moves and return exact per-turn snapshots and animation descriptors. |
| `POST /api/cube/scramble` | Return a plan of 20 random legal outer turns from the supplied state. |
| `POST /api/cube/solve` | Validate a legal state, run a bounded two-phase search, independently verify its solution, and return metadata plus a playback plan. |

For example, from another terminal:

```sh
curl --fail http://127.0.0.1:8000/api/cube
curl --fail -H 'Content-Type: application/json' \
  -d '{"facelets":"UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB","sequence":"x R U2 F2"}' \
  http://127.0.0.1:8000/api/cube/apply
```

Responses contain a canonical schema-1 state, current-view and canonical facelets, display faces, solvedness, hashes, and sequence metadata. Subsequent requests may send the returned `state` object unchanged. Engine validation failures return HTTP 422 with a stable error code, message, and optional notation position. The [conventions document](docs/CUBE_CONVENTIONS.md) specifies every sticker index, corner/edge orientation, frame mapping, and validation condition. Slice/wide notation remains unsupported and is explicitly rejected in 1B.

## Interactive Cube Explorer controls

- Drag / one-finger touch to orbit; scroll / pinch to zoom. Camera buttons and focused-canvas arrow keys provide keyboard alternatives. Plus/minus zoom the focused canvas. Orbiting never changes cube state or notation frame.
- Use U/R/F/D/L/B and x/y/z buttons or keys. Choose Quarter, Inverse, or Double; Shift always selects a prime turn. Shortcuts are disabled in text/editing fields. Ctrl/Command Z undoes; Ctrl/Command Shift Z or Ctrl Y redoes.
- **Run algorithm** validates the entire input before starting. Rapid inputs queue in order; they do not overlap or use stale states. The queue accepts 64 pending requests, algorithms up to 128 actions, and local history up to 1,024 turns. Limits produce visible errors.
- **Undo/Redo** and **Step backward/forward** animate saved engine-verified transitions. The slider and start/end controls jump to saved states. Play replays from the cursor, or from the initial state when already at the end. Replay never appends duplicate moves.
- **Pause** lands the current turn before stopping. Resume continues pending moves or replay. Reset interrupts the queue, invalidates stale callbacks, and starts a new solved history after a successful engine response.
- **Scramble** applies 20 randomly selected legal face turns from the current state. This is a random move walk, not a uniform random-state/WCA competition scramble.
- The HTM count sums backend-provided costs in the current history prefix; rotations count separately at zero HTM. Undo reduces the prefix count. These controls do not measure solve times or TPS.
- WebGL2 failure/context loss uses the exact 2D fallback, with working controls and immediate state updates. System reduced-motion preference disables turn interpolation. No backend means no invented cube.

The renderer is loaded lazily and split into separate Three.js / Fiber chunks. Pinned Three.js 0.182.0 is compatible with the stable Fiber 9 animation clock. No remote images, environment maps, fonts, or other assets are needed at runtime.

## Full-cube solving (milestone 2A)

In Cube Explorer, finish any pending turns, then click **Solve cube**. The solution is computed from the exact current state, including its grip. Solve displays the verified plan without applying moves. Use **Next/Previous solution move**, **Play/Pause solution**, or **Go to solution start** to practice it. Future moves appear separately from applied moves in the local timeline; the HTM total counts only the applied prefix. A manual turn creates a new branch and clears the previous solution when that turn commits.

The adapter uses pinned [`rubik-solver-py==0.1.1`](https://pypi.org/project/rubik-solver-py/), a Python/NumPy Kociemba two-phase implementation. It is a candidate generator, never the source of cube truth. The canonical engine validates the input, translates canonical face names to the current grip, applies the entire proposed algorithm, verifies solvedness, and produces every playback snapshot. All successful responses use **“Short solution · optimality unproven.”** There is no certified approximation gap, global shortest-move guarantee, CFOP classification, or optimality proof. Even simple states can receive a longer-than-necessary solution.

`POST /api/cube/solve` accepts exactly one `state` object or `facelets` string, like `/validate`. It returns `notation`, `move_count`, `metric: "HTM-outer-v1"`, `elapsed_ms`, `optimality: "unproven"`, `verified: true`, solver/version, search limits, input/result hashes, status, and a per-turn `plan`. `elapsed_ms` measures the backend adapter, including process startup, cold table generation/loading, search, verification, and plan construction; it excludes HTTP transit and animation. An already-solved state returns empty notation and zero moves without launching the library.

```sh
curl --fail -H 'Content-Type: application/json' \
  -d '{"facelets":"UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"}' \
  http://127.0.0.1:8000/api/cube/solve
```

One worker is allowed per API process. The worker has a **30-second wall-clock budget**, including initialization, and a **24 HTM candidate limit**. HTTP 422 rejects invalid states; 502 rejects malformed or incorrect solver output; 503 reports busy/unavailable/no result; 504 reports timeout. Failures return no solution moves and preserve the displayed cube. The frontend waits up to 35 seconds and rejects late responses after reset, cancellation, import, or unmount. Cancel stops waiting/adoption immediately; a disconnected request's worker can continue until completion or its 30-second limit. A new solve may report busy during that interval. Run one FastAPI worker locally.

The first unsolved request creates versioned NumPy tables in **`cubiq/backend/.cache/rubik-solver-py-0.1.1/`**. This ignored cache is local derived data, requires a writable directory, and needs no network. Subsequent subprocesses reload it. For a different cache location, set `CUBIQ_SOLVER_CACHE_DIR` to a writable absolute path before starting the backend. No additional install or warmup command is required. Measured cold/warm evidence and known limits are recorded in [the 2A report](docs/MILESTONE_2A.md). This is a small, single-maintainer upstream dependency; the adapter is isolated, pinned, and regression-tested so it can be replaced.

## Build, lint, and test

From the repository root:

```sh
cd "/Users/paartharora/Documents/ChatGPT/rubiks cube ai coach"

# Frontend production bundle, strict TypeScript checking, ESLint, and Vitest.
npm --prefix cubiq run build
npm --prefix cubiq run lint
npm --prefix cubiq test

# Backend tests, lint, formatting verification, and distributable build.
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv pytest cubiq/backend/tests
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv ruff check cubiq/backend
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv ruff format --check cubiq/backend
.tools/bin/uv build --project cubiq/backend --cache-dir .cache/uv
```

Backend pytest covers all move/inverse and fourth-power identities, 32 named oracle states, 1,000 seeded oracle sequences, 128 arbitrary legal-state fixtures, all 24 grips, parser/metric/serialization behavior, impossible states, and the real HTTP API. The committed corpus comes from pinned `cubejs@1.3.2`; pytest requires no Node process or network access. Current verification includes 410 backend tests and 56 frontend tests. The 2A additions run the real solver on known scrambles, 24 seeded 25-face-turn scrambles, and all 24 grips; inject invalid output, worker failure, timeout, and busy conditions; and verify preview, step/playback, state binding, cancellation, and stale-result rejection in the frontend. The 1C tests cover exact animation endpoints, rapid inputs, duplicate/stale callbacks, reset and disconnect races, undo/redo branching, pause/resume, playback, keyboard editing guards, WebGL fallback, and reduced motion. See [M1C delivery evidence](docs/MILESTONE_1C.md); the [M1B report](docs/MILESTONE_1B.md) records the earlier engine checkpoint.

For frontend test watch mode: `npm --prefix cubiq run test:watch`.

To inspect the built frontend locally, keep the backend running and use:

```sh
npm --prefix cubiq run preview
```

Open [the built frontend](http://127.0.0.1:4173). Build output is in `cubiq/dist/`; the backend wheel/source distribution is in `cubiq/backend/dist/`. Serving the built frontend directly from FastAPI is planned later. The preserved static hosting configuration does not deploy a Python backend; no publication was performed.

## Structure and design baseline

```text
README.md                      # current setup, behavior, and limitations
.nvmrc / .gitignore             # runtime selection and local/generated exclusions
cubiq/
  src/app/                     # layout, routes, dashboard, planned workflow pages
  src/api/                     # typed health client and cancellable connection check
  src/components/              # brand mark and connection status panel
  src/features/cube/           # 3D renderer, command/history controller, 2D fallback
  src/styles/                  # Tailwind entry point and responsive design system
  src/test/                    # test setup; route/connection tests sit beside App
  public/                      # local favicon
  backend/
    pyproject.toml / uv.lock   # backend package and locked dependencies
    src/coach/main.py          # application factory, CORS, and health
    src/coach/cube.py          # single authoritative state/rules module
    src/coach/api/cube.py      # stateless HTTP adapters, no move rules
    src/coach/solvers/         # bounded third-party worker and independent verification
    tests/test_health.py       # health and CORS integration tests
    tests/test_cube*.py        # engine and API tests
    tests/test_solver.py       # real solver and failure-injection tests
    tests/fixtures/            # independent oracle outputs
  scripts/generate-cube-fixtures.cjs # optional, local-only oracle regeneration
  scripts/generate-ui-fixtures.py # engine snapshots/plans used by frontend tests
  .openai/hosting.json          # preserved existing static hosting metadata
  package.json / package-lock.json
  vite.config.ts / tsconfig*.json / eslint.config.js
docs/                          # architecture, decisions, roadmap, gates, and risks
```

The original `cubejs` runtime dependency was removed from the scaffold. M1B uses pinned `cubejs` only in ignored tooling to regenerate independent test data; it is not installed by the applications or imported at runtime. [Fixture regeneration commands](docs/CUBE_CONVENTIONS.md#independent-verification-and-fixture-regeneration) are optional. The lint dependency override pins `minimatch` to the patched 11.x line across the current lint tools; retain the lockfile and recheck compatibility when upgrading those tools.

The [architecture](docs/ARCHITECTURE.md), [technical decisions](docs/TECHNICAL_DECISIONS.md), [roadmap](docs/ROADMAP.md), [acceptance tests](docs/ACCEPTANCE_TESTS.md), and [risks](docs/RISKS.md) remain the implementation baseline. The Python cube engine is the sole state authority. Future recommendations must use it for verification. Two-phase solving will remain distinct from proven optimality. Physical tracking will abstain when evidence is uncertain.

The requested [SolveTheCube CFOP reference](https://solvethecube.com/algorithms) remains a future catalog source; no catalog has been imported in this milestone.

## Stopping point

Milestone **2A ends here**. Verified full-cube solutions and solution playback are available. See the [2A delivery report](docs/MILESTONE_2A.md) and earlier [1C report](docs/MILESTONE_1C.md). Persistent solve sessions/event logs, CFOP, exact optimality search, timing, and physical tracking remain future work. Earlier reports preserve the [1B engine](docs/MILESTONE_1B.md) and [1A scaffold](docs/MILESTONE_1A.md) checkpoints.
