# Milestone 1B delivery report

Implemented and verified: the ordinary 3×3 canonical state engine, stateless backend API, and a minimal 2D frontend inspector. Stopped before solver, timer, persistence, stage analysis, and 3D work.

## Engine design

All cube mathematics live in `cubiq/backend/src/coach/cube.py`. The immutable state is corner/edge permutation and orientation plus one of 24 proper grip frames. Geometry with exact integer rotations generates face-turn tables; every runtime transition composes canonical cubies. Facelets are derived rather than separately stored.

Implemented all prime/double variants of U/D/L/R/F/B and x/y/z; complete-input parsing with error positions; normalized/inverse notation; executed HTM; facelet and JSON import/export; deterministic state/position hashes; and full ordinary-3×3 reachability validation. Grip rotations preserve cubies and position hash, remap subsequent notation, and cost zero HTM. Invalid colors/pieces, twist/flip totals, parity, frames, and serialized coordinates fail with actionable errors.

The [conventions document](CUBE_CONVENTIONS.md) freezes every face orientation, sticker index, piece orientation, frame mapping, serialization field, parser rule, and metric behavior. It also states the model's limits: fixed color identities, unoriented centers, and no wide/slice notation in 1B.

## API and frontend ownership

`GET /api/cube` and POST `/api/cube/validate`, `/api/cube/apply`, `/api/cube/sequence` expose the engine. Inputs are revalidated and no global mutable cube or solve history is maintained. Engine errors return structured HTTP 422 details. Local development CORS now permits GET and POST.

Cube Explorer paints the six face arrays returned by Python, sends the returned canonical state unchanged on later commands, and displays backend-provided solvedness, frame, inverse, and HTM. It never permutes cubies/stickers or computes notation inverses/counts. Pending/failed commands cannot replace the last accepted snapshot, and an unavailable engine never produces a substitute solved cube. Import and export use real engine states. Reload starts a fresh inspector; persistence remains unavailable.

## Test results

All final checks passed on macOS, Node 22.17.1/npm 10.9.2, Python 3.12.3, uv 0.13.7:

| Check | Result |
| --- | --- |
| Backend pytest | **243 passed**: 213 engine cases, 21 cube API cases, 9 health/CORS regressions. |
| Independent reference corpus | 32 named positions, 1,000 seeded sequences, and 128 directly sampled legal states/continuations agree with pinned cubejs 1.3.2. |
| Inverse/repetition identities | All 27 move variants, both inverse orders, four quarter turns, double/prime equivalence, nonuniform starts, and seeded scrambles pass. |
| Rotations and serialization | All 24 grips round trip nonuniform states; x/y/z preserve canonical cubies and remap later face turns; JSON/hashes are reproducible. |
| Illegal states and parser | Color count, reflected centers, mirrored/duplicate pieces, isolated twists/flips, odd two-piece swaps, malformed schema, unsupported notation, and input limits are rejected. Balanced legal constraints are accepted. |
| Frontend tests | **15 passed**, including opaque snapshot submission, pending-state preservation, backend inverse application, zero-HTM rotation display, rejected imports, and unavailable/malformed backend responses. |
| Frontend build and lint | TypeScript/Vite build and ESLint pass. |
| Backend lint/format/build | Ruff check and formatting check pass; wheel and source distribution build successfully offline. |
| Fixture reproducibility | Regeneration yields identical SHA-256 `2ff9f47b1ec46e5e05feae604dfe6e30130fc5c0cca96eb277381cac8b94e37e`. |
| Actual browser checks | Mixed sequence and inverse restore solved state; x preserves solvedness at 0 HTM; a single flipped edge is rejected and retains the prior facelets. 390 px and 1440 px layouts fit without horizontal page overflow. Refresh correctly starts a new inspector. |

The oracle is isolated in ignored tooling and its MIT license/version were checked. The production applications have no new dependency on it, and no solver was initialized. The generator imports no Python engine code. Backend pytest reads the committed corpus and needs neither Node nor network access.

Commands, from repository root:

```sh
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv pytest cubiq/backend/tests -q
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv ruff check cubiq/backend
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv ruff format --check cubiq/backend
.tools/bin/uv build --project cubiq/backend --cache-dir .cache/uv --offline
npm --prefix cubiq run build
npm --prefix cubiq run lint
npm --prefix cubiq test
```

## Files added or changed

```text
Backend — new
  cubiq/backend/src/coach/cube.py
  cubiq/backend/src/coach/api/__init__.py
  cubiq/backend/src/coach/api/cube.py
  cubiq/backend/tests/test_cube.py
  cubiq/backend/tests/test_cube_api.py
  cubiq/backend/tests/fixtures/cubejs-1.3.2.json
Backend — updated
  cubiq/backend/src/coach/main.py
  cubiq/backend/tests/test_health.py
Frontend/tooling — new
  cubiq/src/api/cube.ts
  cubiq/src/features/cube/CubeExplorer.tsx
  cubiq/src/features/cube/useCube.ts
  cubiq/src/features/cube/CubeExplorer.test.tsx
  cubiq/src/test/cube-fixtures.json
  cubiq/scripts/generate-cube-fixtures.cjs
Frontend/tooling — updated
  cubiq/src/app/App.tsx
  cubiq/src/app/App.test.tsx
  cubiq/src/app/Dashboard.tsx
  cubiq/src/app/navigation.ts
  cubiq/src/styles/index.css
  cubiq/tsconfig.app.json
  cubiq/eslint.config.js
Documentation — new
  docs/CUBE_CONVENTIONS.md
  docs/MILESTONE_1B.md
Documentation — updated
  README.md
  docs/ARCHITECTURE.md
  docs/TECHNICAL_DECISIONS.md
  docs/ROADMAP.md
  docs/ACCEPTANCE_TESTS.md
```

Runtime dependency manifests/lockfiles, existing hosting configuration, and the historical M1A report are unchanged. No hosting/publication action was taken. Temporary test servers were stopped after verification. Full M1 session/event replay and expanded-notation gates are not claimed by this checkpoint.
