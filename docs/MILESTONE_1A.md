# Milestone 1A delivery report

Implemented and verified on macOS with Node 22.17.1, npm 10.9.2, Python 3.12.3, and uv 0.13.7. Full M1 cube-engine work remains pending.

## Delivered behavior

- React/TypeScript/Vite frontend with Tailwind CSS, local assets, a responsive dark layout, reduced-motion styles, skip navigation, active route styling, page titles, focus handling, and scroll reset on navigation.
- Dashboard, Cube Explorer, Live Solve, Solve Analysis, Algorithm Trainer, and History routes. Planned workflows have explicit unavailable-feature descriptions and working navigation links.
- Actual backend connection check, timeout/error handling, response-shape validation, last-check timestamp, and retry. No fabricated analytics or solve records.
- FastAPI application factory with `/health`, equivalent `/api/health` proxy alias, explicit local development/preview CORS, and generated API documentation.
- uv-managed backend environment, npm/uv lockfiles, pytest, Vitest, ESLint, Ruff, TypeScript checking, and build commands.

## Files added or updated in this milestone

Paths below are relative to the repository root. Existing planning documents and scaffold files were present before this milestone; the repository has no committed baseline.

```text
.gitignore
.nvmrc
README.md
cubiq/package.json
cubiq/package-lock.json
cubiq/index.html
cubiq/public/favicon.svg
cubiq/vite.config.ts
cubiq/eslint.config.js
cubiq/tsconfig.json
cubiq/tsconfig.app.json
cubiq/tsconfig.node.json
cubiq/src/main.tsx
cubiq/src/app/App.tsx
cubiq/src/app/App.test.tsx
cubiq/src/app/Dashboard.tsx
cubiq/src/app/PlannedPage.tsx
cubiq/src/app/navigation.ts
cubiq/src/api/health.ts
cubiq/src/api/useHealth.ts
cubiq/src/components/CubeMark.tsx
cubiq/src/components/ConnectionCard.tsx
cubiq/src/styles/index.css
cubiq/src/test/setup.ts
cubiq/backend/.python-version
cubiq/backend/pyproject.toml
cubiq/backend/uv.lock
cubiq/backend/src/coach/__init__.py
cubiq/backend/src/coach/main.py
cubiq/backend/tests/test_health.py
docs/ARCHITECTURE.md
docs/TECHNICAL_DECISIONS.md
docs/ROADMAP.md
docs/ACCEPTANCE_TESTS.md
docs/MILESTONE_1A.md
```

The existing `cubiq/.openai/hosting.json` and `docs/RISKS.md` are unchanged. Environments, caches, dependency directories, and build outputs are local/ignored. The unused original `cubejs` runtime dependency was removed; no solver library was adopted.

## Verification results

| Check | Actual result |
| --- | --- |
| `npm ci` | Passed with synchronized lockfile; installer audit reports 0 vulnerabilities. |
| `uv sync --locked` (managed environment, then offline verification) | Passed. |
| `npm --prefix cubiq run build` | Passed strict TypeScript project build and Vite production bundle. |
| `npm --prefix cubiq run lint` | Passed ESLint with zero allowed warnings. |
| `npm --prefix cubiq test` | 10 frontend tests passed. |
| `uv run … pytest cubiq/backend/tests` | 9 backend tests passed, no warnings. |
| `uv run … ruff check cubiq/backend` | Passed. |
| `uv run … ruff format --check cubiq/backend` | All 3 Python files passed. |
| `uv build --project cubiq/backend … --offline` | Wheel and source distribution built successfully. |
| Live `/health` and Vite `/api/health` requests | Both returned the documented real health response. |
| Browser navigation | All six destinations, direct refresh, back/forward, and unknown-route recovery verified through browser checks and component tests. |
| Responsive browser checks | 1440 px desktop and 390 px mobile layouts inspected; document width matched viewport width. |
| Built frontend preview | Dashboard reached the actual backend; Cube Explorer route and refresh worked on port 4173. |
| Browser console | No warning/error entries observed during final checks. |
| Documentation | Local links/anchors and whitespace checked. |

The initial dependency install surfaced a deprecated lint version, a `minimatch` advisory, and a backend HTTP test-client deprecation. Updated the lint toolchain, overrode `minimatch` to patched 11.x, and used the installed Starlette version’s supported `httpx2` test dependency. The final clean install and all applicable checks passed.

Exact installation, start, and test commands are in the [root README](../README.md). Test servers were used for verification only and stopped after checking the milestone.

## Scope boundary

This milestone does not implement cube state, notation, HTM counting, a 3D engine, solvers, timing, move logging, SQLite, training, analytics, camera access, or AI. The cube artwork is decorative. Planned feature pages never claim to process a solve. No publication or hosting configuration change was performed.
