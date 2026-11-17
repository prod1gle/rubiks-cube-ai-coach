# Cubiq — Rubik’s Cube AI Coach

A local workspace for more intentional 3×3 practice. **Milestones 1A–1C, 2A–2D and user-requested milestones 3–4 are implemented:** canonical cube states, interactive 3D, verified full-cube/CFOP solving, Next Best Move, retrospective comparison/practice, and manual virtual timing with deterministic solve analysis. SQLite solve history, genuine progress trends and verified F2L/OLL/PLL training are available. Full-solve optimality proofs, physical camera tracking, AI and learned personalization remain future work.

## Available now

- React + TypeScript + Vite frontend with Tailwind CSS, a responsive dark layout, keyboard focus styles, reduced-motion support, and skip navigation.
- Six working routes: Dashboard, Cube Explorer, Live Solve, Solve Analysis, Algorithm Trainer, and History. Trainer and History use real engine-validated cases and local saved data.
- Cube Explorer: Three.js / React Three Fiber rendering of all 26 cubies and 54 stickers, smooth face/grip animations, orbit/zoom, keyboard and button moves, manual algorithms, legal random scrambles, reset, undo/redo, and playback. The 2D state inspector and import/export remain available. The frontend never computes cube permutations.
- Two independent solving approaches: engine-verified two-phase short solutions, and genuine Cross → four F2L pairs → OLL → PLL → AUF with stage counts and playback. Both label full-solve optimality unproven.
- Live Solve: optional 15-second practice inspection, Space/face-key/button controls, explicit pauses, monotonic input capture and engine-confirmed completion. Manual virtual timing is separate from animation and physical turning.
- Timed Solve Analysis: interactive exact-state timeline, input TPS chart, inferred Cross/pair/OLL/PLL/AUF checkpoints, skips/combined goals, timing integrity, pause breakdown and stage-to-retrospective coaching.
- Solve Analysis: import applied Explorer history or a complete known move record, select a segment, compare verified alternatives with synchronized 3D replay, inspect exact differences, and retry the original case.
- Next Best Move: exact-state CFOP progress, remaining-pair alternatives, three hint levels, target cubie highlights, single-move/full-sequence playback, and automatic recalculation after manual moves. Compare HTM or explicit ergonomic costs, with optional working-grip rotations.
- One immutable Python cubie engine with all face-turn variants, x/y/z grip rotations, complete parsing, serialization, inversion, HTM, and reachability validation. See [the exact cube conventions](docs/CUBE_CONVENTIONS.md).
- A real API connection check on the Dashboard, with checking, reachable, unavailable, and retry states. No sample solves or fabricated analytics.
- FastAPI application factory, typed health response, explicit local CORS policy, pytest, Ruff, and a uv-managed virtual environment.
- Locked frontend/backend dependencies and build, lint, and test commands.

The Dashboard hero cube remains a decorative CSS illustration. The separate interactive Cube Explorer renders real engine-provided geometry and snapshots. Both solving approaches return engine-verified solutions with full-solve optimality explicitly unproven. Timing describes manual virtual input only; physical vision and AI features remain unavailable. Full M1 acceptance remains pending for sessions/events, persistence, and expanded public notation; 1B does not imply those are implemented.

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
{"status":"ok","service":"cubiq-api","version":"0.1.0","milestone":"4"}
```

`GET /api/health` is an equivalent alias for the frontend’s `/api` proxy. Both Vite development and preview forward `/api/*` to `http://127.0.0.1:8000`. The health endpoint reports API availability, not readiness of future cube features.

Allowed browser origins are explicitly limited to `http://localhost:5173`, `http://127.0.0.1:5173`, and their preview equivalents on port `4173`. GET, POST and DELETE are allowed; credentials are disabled. CORS controls browser cross-origin access and is not an authentication layer. Cube endpoints are stateless calculations and do not store a shared session.

Check the direct and proxied endpoints:

```sh
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:5173/api/health
```

## Cube engine API

Open [Cube Explorer](http://127.0.0.1:5173/cube-explorer) after starting both applications. Until an engine snapshot arrives, no cube is displayed. Invalid notation/imports retain the last accepted snapshot and show the backend's validation error. Counts describe the current local history prefix; they are not a recorded speedsolve. A page reload starts a new solved workspace; saved timed recordings persist in SQLite; Explorer scratch work remains transient.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/cube` | Validated solved snapshot. |
| `POST /api/cube/validate` | Import exactly one `state` object or `facelets` string. |
| `POST /api/cube/apply` | Import the supplied state and apply `sequence` atomically. |
| `POST /api/cube/sequence` | Return normalized notation, inverse, executed HTM, and rotation count. |
| `POST /api/cube/plan` | Validate up to 128 moves and return exact per-turn snapshots and animation descriptors. |
| `POST /api/cube/scramble` | Return a plan of 20 random legal outer turns from the supplied state. |
| `POST /api/cube/solve` | Validate a legal state, run a bounded two-phase search, independently verify its solution, and return metadata plus a playback plan. |
| `POST /api/cube/cfop` | Generate and independently verify genuine Cross, four pairs, OLL, PLL and AUF stages. |
| `POST /api/cube/cfop/recognize` | Return exact stage predicates and eligible case recognition in the fixed white-down reference. |
| `POST /api/cube/recordings/analyze` | Validate a timed manual recording, replay every move/hash and compute deterministic state checkpoints and analytics. |
| `POST /api/cube/analysis` | Reconstruct an exact recorded segment and compare verified alternatives for the same goal. |
| `POST /api/cube/analysis/practice` | Replay a retry from the original segment start and verify the shared objective. |
| `POST /api/cube/next` | Exact-state progress, verified CFOP/short-solution candidates, hints, target cubies, explicit ranking metrics, and validated insertion continuation. |
| `GET /api/cube/cfop/registry` | Versioned 57 OLL / 21 PLL records, source metadata, compiled notation, U setup conventions, and insertion macros. |

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

## Genuine CFOP solving (milestone 2B)

Choose **CFOP** under Solving approach, then **Solve cube**. The plan contains Cross, all four F2L slots in the chosen order, OLL, PLL, and final AUF. Each row shows its case ID, actual emitted HTM count, translated moves, and a stage play button. A skipped goal is explicit with zero moves. **Play a stage** restores its exact verified starting state and stops at its endpoint. **Play solution**, next/previous, pause, and restart use the same verified animation path. Switching approaches never relabels an existing short solution as CFOP.

This pipeline uses a fixed **white Cross down, green front** reference. The current cube grip is preserved and all playback notation is translated into that grip. OLL/PLL IDs and registry algorithms refer to the fixed reference, so AUF can appear as a different face in the displayed current-grip notation. This is not color-neutral solving.

The implementation is independent of the two-phase solver: an exact 190,080-state Cross search; a pair-selection/insertion graph that covers all 8,256 target-pair/protected-slot configurations; full **57 OLL** recognition across all 216 legal orientations; full **21 PLL** recognition across all 288 legal permutations; and separate AUF. All slots solved at the start of a pair stage remain solved at each insertion boundary. Individual turns can temporarily disturb them. The pair order is greedy, and the result is not optimized for global HTM or human execution speed.

There is no known missing F2L placement subset within this fixed-reference legal-state scope. Color neutrality, advanced multislotting/pseudoslotting, user algorithm preferences, global pair-order optimization, and recorded-solve stage inference are not implemented. The conventional 41 basic F2L numbers are not used to mislabel arbitrary trapped-piece configurations; exact coordinate case IDs are documented in [CFOP engine conventions](docs/CFOP_ENGINE.md).

Both approaches share a single worker-admission slot per API process and a 30-second worker budget. CFOP derives its search tables locally in memory; it needs no downloaded tables, external solver service, API key, or extra startup command. Every stage's goals, registry identity, protected endpoints, hashes and complete notation are rechecked by the canonical engine before a result is returned. Failures return no candidate moves. The current plan cap is 128 outer-turn actions.

Registry slice/wide notation is privately compiled through the canonical engine into outer turns; the public manual-entry grammar still supports only face turns and x/y/z. Counts are the actual emitted outer HTM actions, not original source token counts or reduced move counts. Production last-layer notation is sourced from an MIT-licensed registry with its notice packaged. All 78 case labels are independently checked against the requested SolveTheCube reference using committed cubejs oracle states. See [the complete design and provenance](docs/CFOP_ENGINE.md) and [2B delivery evidence](docs/MILESTONE_2B.md).

## Next Best Move (milestone 2C)

In Cube Explorer, click **Get a hint**. Choose **CFOP continuation** or **Shortest available solution**, then **Subtle Hint**, **Guided Hint**, or **Full Solution**. Subtle identifies pieces, Guided explains the strategy, and Full reveals verified notation plus **Apply next move** / **Play & apply sequence**. In CFOP mode, Full means the selected next pair/stage; short-solution mode reveals a complete continuation. Requesting or selecting a hint never changes the accepted cube. Refresh any tab left open from an earlier development milestone to load the updated controller.

CFOP recognizes the fixed-white Cross, each F2L slot, OLL, PLL, and AUF. It compares remaining pairs and multiple valid insertion paths/grips, verifies every candidate with the canonical engine, and outlines the actual current target cubies. Solved Cross/slots are protected at insertion boundaries; individual turns may temporarily disturb them. Single suggested moves retain a validated insertion context until its endpoint, so a temporarily disturbed Cross does not cause the coach to undo its own insertion. **Replan from current state** abandons that intent; any ordinary manual turn, undo, import, reset, or settings change also starts fresh. Coaching recalculates after accepted turns, not animation frames. Pause and stop pending moves to inspect an intermediate state in a queued algorithm.

**Coded ergonomics** permits explicit x/y/z working-grip changes and ranks by completed-slot loss first, then:

`HTM + 2 × rotations + 2 × B turns + 1 × D turns + 0.35 × F turns + 0.15 × L turns`

U/R have no extra penalty. Doubles count as one action; rotations cost zero HTM but two comfort points. These are versioned, generic right-handed heuristic points, **not measured seconds**. A rotation can therefore beat awkward B turns. Turn rotations off to compare fixed-grip options, or select **HTM moves, then rotations**. The existing 2B full-CFOP Solve button retains its original HTM planner; ergonomic ranking applies to Next Best Move.

Shortest available selects the fewest HTM among computed, engine-verified shallow, two-phase, and CFOP solutions (the candidate pool depends on the state). Missing/busy two-phase search is disclosed when a verified CFOP result is available. **Global minimum and global best move remain unproven.** Alternative visibility is bounded; this is not exhaustive whole-cube search.

Personalization does not train itself today. It is explicitly future work after real, consented practice capture exists: store actual execution timing and preferences with provenance, exclude animation timings, and evaluate a learned ranker on held-out attempts. Learned ranking must only reorder independently engine-verified candidates. There is no fake practice history, trained model, or personalized score. See [the coaching contract and limits](docs/COACHING.md) and [2C delivery evidence](docs/MILESTONE_2C.md).

## What Could I Have Done Instead? (milestone 2D)

Apply moves in Cube Explorer, then use **What could I have done instead?** beneath the move timeline. The link transfers the exact initial state, only the applied history prefix, and its final hash to **Solve Analysis**. You can also open Solve Analysis directly and enter a complete known record plus its initial viewed facelets. A record must contain every action; unknown capture gaps cannot be filled in. The transfer uses browser session storage, not a persistent solve database.

Choose **First action** and **Last action (included)**, including rotations as actions. Select **Fewest Moves**, **CFOP Efficiency**, or **Training Recommendation**, then **Compare this segment**. Automatic recognition selects the actual new CFOP goal; a segment with no new progress or regressed progress compares the exact physical endpoint instead. Explicit shared goals are available and must be achieved by the actual segment. Records are capped at 1,024 actions and individual replay segments at 128.

Both interactive cubes begin at the identical engine-reconstructed state and grip. Shared next/previous, play/pause, slider and start/end controls align action indices; the shorter branch holds its endpoint. Cameras orbit/zoom independently. HTM, rotations and endpoint differences are explicit. **Show Me Why** explains verified counts, protected slots, coded ergonomics, exact hashes, and whether the endpoint is identical or merely satisfies the same goal. A different stage endpoint never inherits the rest of the actual moves unchecked. There is no guessed execution speed or seconds-saved estimate.

**Practice This Case** loads the original segment start, even after comparison playback has reached the end. Enter a retry or use face/grip buttons, apply it, then **Check attempt**. The backend accepts any sequence satisfying the original objective and protected endpoint constraints. **Reset original case** restores the original state/grip and clears only the retry. The recorded sequence remains unchanged.

Fewest Moves ranks the generated valid pool by HTM/rotations. CFOP Efficiency favors protected staged paths, then HTM/rotations. Training Recommendation favors protected staged paths, then the fixed `comfort-1` score; it does not use a trained model. Arbitrary exact endpoints may use a verified bridge through solved, and alternatives may be longer than actual. No distinct alternative found is an honest possible outcome. **Global optimality remains unproven.** See [2D design and verification](docs/MILESTONE_2D.md).

## Manual solve timer and analysis (user-requested milestone 3)

Open [Live Solve](http://127.0.0.1:5173/live-solve). **Prepare random legal scramble**, or expand **Prepare a specific cube state** and import engine-valid facelets. Preparation is outside timing; starting from a solved cube is disabled. The random scramble is a legal move walk, not a competition random-state scramble.

1. Choose optional **15-second inspection**. Release **Space** or use **Start inspection** / **Start solve**. Inspection counts down, records its actual duration and flags overrun. It does not automatically apply competition penalties or start the solve at expiry.
2. During the run, use **R/U/F/D/L/B** and **x/y/z**, with Shift for prime, or labeled buttons and Quarter/Inverse/Double. Every accepted move has its original monotonic submission timestamp and exact before/after hashes. Whole algorithms cannot be pasted into a timed run. Rapid inputs queue in order without being retimestamped on acknowledgement.
3. **P** / **Pause practice** records an explicit pause; total elapsed continues, active practice excludes that pause. Space or Escape stops an unsolved run; pending inputs finish validation before finalization. The canonical engine automatically confirms the first solved state and ends timing at that input's timestamp. Neither animation nor API latency sets the solve time. Live Solve renders accepted states immediately; Explorer's animated practice remains separate.
4. **Analyze this solve** opens the actual recording. Scrub the timeline, select TPS bars or move tokens, inspect stage cards, and choose **What Could I Have Done Instead?** for a nonempty stage interval. The retrospective coach receives its exact initial state, complete move record and selected boundaries. Combined goals share a single duration; already met goals and skips are explicit.

The report provides total elapsed, active practice duration, HTM, rotations, overall/active **input TPS**, explicit pauses, input inactivity intervals of at least one second, stage durations and verified local move-efficiency comparisons. Physical **moving TPS is unavailable**: keyboard/button inputs do not measure physical turn start/end times. Inactivity is not proof of hand motion or recognition pauses. TPS chart bins use actual observed duration, including the last partial bin. No alternative execution speeds or seconds-saved values are invented.

State checkpoints are inferred in a fixed-white CFOP reference, with previous slots protected at eligible boundaries. They do not measure when you recognized a case. Raw predicate loss/re-attainment events remain visible. Empty/pending/combined/ambiguous goals do not receive invented individual times. Unclassified trailing time remains separate. Adjacent-turn cancellations are endpoint-verified; a displayed exact Cross distance applies to that Cross goal alone, never whole-solve optimality.

Backgrounding, clock divergence, failed input, reload or navigation can mark capture interrupted/uncertain. Exact accepted move states remain reviewable; time-based statistics, including inspection, are withheld. The latest recording is transferred in **browser session storage**, with copyable JSON on Live Solve. It is not permanent solve history and does not train a model. A draft stays interrupted until engine-confirmed completion or explicit Stop. Limits: 1,024 accepted moves, 64 queued inputs, 24 hours, and the existing 128-action limit for individual retrospective replay. No new installation steps or dependencies are required.

See [recording/analytics conventions and delivery evidence](docs/MILESTONE_3.md). This timer/analysis checkpoint is distinct from the original roadmap's broader M3 exact optimal-search release gate.

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

Backend pytest covers all move/inverse and fourth-power identities, 32 named oracle states, 1,000 seeded oracle sequences, 128 arbitrary legal-state fixtures, all 24 grips, parser/metric/serialization behavior, impossible states, and the real HTTP API. The committed corpus comes from pinned `cubejs@1.3.2`; pytest requires no Node process or network access. Current verification includes 1028 backend tests and 128 frontend tests. The 2B suite exhausts the projected F2L configurations, legal OLL orientations and PLL permutations; checks 78 independent reference labels and all 24 grips; and solves 200 seeded 25-face-turn scrambles plus 30 independently sampled legal cubie states. Frontend tests cover CFOP selection, truthful method labels, stage boundaries, stage-only/full playback, skipped stages, cancellation and failure states. The 2A additions run the real solver on known scrambles, 24 seeded 25-face-turn scrambles, and all 24 grips; inject invalid output, worker failure, timeout, and busy conditions; and verify preview, step/playback, state binding, cancellation, and stale-result rejection in the frontend. The 1C tests cover exact animation endpoints, rapid inputs, duplicate/stale callbacks, reset and disconnect races, undo/redo branching, pause/resume, playback, keyboard editing guards, WebGL fallback, and reduced motion. See [M1C delivery evidence](docs/MILESTONE_1C.md); the [M1B report](docs/MILESTONE_1B.md) records the earlier engine checkpoint.

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
    src/coach/solvers/         # two-phase adapter and shared process admission/errors
    src/coach/cfop/            # independent staged search, registry, worker and verifier
    tests/test_health.py       # health and CORS integration tests
    tests/test_cube*.py        # engine and API tests
    tests/test_solver.py       # real solver and failure-injection tests
    tests/test_cfop.py         # exhaustive CFOP projections, case coverage and scramble tests
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

The requested [SolveTheCube CFOP reference](https://solvethecube.com/algorithms) is used to check case numbering and independent reference states. Functional production notation comes from the MIT-licensed source documented in [CFOP conventions](docs/CFOP_ENGINE.md); no reference illustrations, prose, or page presentation are bundled.

## Stopping point

Milestone **2B ends here**. Genuine CFOP plans and per-stage playback join the verified short-solution solver. See the [2B delivery report](docs/MILESTONE_2B.md), [2A report](docs/MILESTONE_2A.md), and earlier [1C report](docs/MILESTONE_1C.md). Persistent solve sessions/event logs, color-neutral solving, exact full-solve optimality search, timing, and physical tracking remain future work. Earlier reports preserve the [1B engine](docs/MILESTONE_1B.md) and [1A scaffold](docs/MILESTONE_1A.md) checkpoints.

## Persistence and training (milestone 4)

Finalized Live Solve runs save automatically; a visible error and retry appear if the save fails. History supports exact record viewing and permanent deletion with a confirmation. Interrupted session-local JSON can be analyzed and saved separately. There are no seeded runtime solves. Dashboard means are arithmetic per-solve values: completed manual virtual runs contribute HTM, while only positive valid timings contribute personal best and TPS. No physical speed or competition averages are inferred.

The default database is `cubiq/backend/.data/cubiq.sqlite3` (ignored by Git). Set `CUBIQ_DB_PATH=/absolute/path/practice.sqlite3` before the backend command to choose another local database. Migrations run transactionally on startup. Keep the database and its `-wal`/`-shm` companions together while running; stop the API before copying a backup. Raw solve data is immutable, UUID saves are idempotent, and analysis versions are retained. Use **Reanalyze original recording** on a saved analysis page to compute the current version.

The Algorithm Trainer provides 57 OLL, 21 PLL, and 24 coordinate-identified F2L insertion cases, all recognized and verified against the engine. F2L training is a documented subset, not the complete conventional case catalog. Repeat restores the same starting state; playback is excluded from saved practice attempts. Manual retry checks are persisted with server-verified outcomes. No execution speed is estimated from pasted algorithms. Retrospective practice checks are also saved.

Endpoints: `GET/POST /api/solves`, `GET/DELETE /api/solves/{uuid}`, `POST /api/solves/{uuid}/reanalyze`, `GET /api/dashboard`, `GET /api/training`, `GET /api/training/{case}`, `POST /api/practice`, `POST /api/practice/segment`. Schema and acceptance evidence: [milestone 4](docs/MILESTONE_4.md).

## Guided physical scanning (milestone 5A)

Open [Guided Scan](http://127.0.0.1:5173/scan), also linked from Cube Explorer. Start the camera explicitly and permit video in the browser if prompted. Use current Chrome/Edge/Firefox/Safari on localhost, with a connected webcam and diffuse light. Follow each face's center/top/right instructions; rotate the entire cube without turning layers, align to the square grid, capture six faces, then calibrate. Review/correct every sticker, acknowledge the orientation check, and validate before loading Explorer. A legal-state rejection includes correction guidance. Stop the camera when finished; it also stops on exit or a hidden page. Camera/audio permissions are not simulated (audio is never requested).

The backend now installs locked headless OpenCV and Pillow through the existing `uv sync --locked` command. No extra runtime commands or remote service are required. Frames are sampled only on capture and go to the loopback API. Classification confidences are heuristic; legal reachability is checked by the canonical engine. This is guided scanning, not continuous tracking. See [5A scope and tests](docs/MILESTONE_5A.md).
