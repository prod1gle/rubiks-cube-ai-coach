# Milestone 1C — interactive 3D Cube Explorer

The Explorer now renders all 26 shell cubies and 54 stickers using Three.js 0.182.0 and React Three Fiber 9.8.2. The established dark interface includes smooth quarter/inverse/double turns, whole-cube grip rotations, orbit/zoom, accessible camera buttons and arrow keys, reset, random legal scrambles, keyboard/button moves, and manual algorithm input. Local history supports undo/redo, forward/back steps, scrubbing, and play/pause/resume. The 2D inspector, state import, and export remain available.

## State and animation ownership

`coach.cube` remains the only cube rules implementation. Its snapshot adds renderer-only cubies: slot IDs, current-view integer positions, sticker normals, and color identities. The canonical cubie/frame serialization and hashes are unchanged.

`POST /api/cube/plan` validates the complete algorithm and returns a chain of before hashes, verified per-turn snapshots, HTM costs, inverse tokens, and signed-axis animation descriptors. Face turns select nine slots; grip rotations select all 26. Both directions are derived by the engine. `POST /api/cube/scramble` uses the same planner for 20 random legal outer turns from the supplied state; no uniform-state or WCA scramble claim is made.

The frontend command controller serializes requests from the latest accepted snapshot. It checks input hash and the complete transition chain before animating any prefix. The renderer rotates only the supplied slots; it never permutes stickers or applies notation rules. On completion, the controller adopts the already verified snapshot **once**, identified by a unique epoch/turn ID. It does not call `/apply` again. Duplicate callbacks, late responses, and callbacks from before reset/disconnect cannot change state.

Rapid inputs enter a bounded queue. A failure clears pending inputs and retains accepted history. Reset/import invalidate old epochs and abort outstanding requests; a failed replacement retains the last accepted state/history. Pause allows the current turn to finish, then holds the remaining queue. Undo/redo and playback use saved engine snapshots and inverse/forward descriptors without new engine applications or duplicated history. A new move after undo truncates the redo branch only when its first valid turn commits.

## User-visible behavior and limits

- Orbit/zoom and reset-camera change only the camera. Focused-canvas arrows orbit, and plus/minus zoom. Camera actions preserve exact facelets/hashes.
- Face/grip keys respect the selected variant; Shift selects prime. Editing fields retain their normal keyboard behavior. Held-key repeat is ignored. Ctrl/Command Z and redo shortcuts operate only outside editing fields.
- The displayed sequence/count is the current local history prefix. Rotations cost zero HTM; undo reduces the prefix. Playback is not solve timing or TPS.
- Play continues from the cursor or replays from the baseline when at the end. Scrubbing/start/end restore saved states. Pending work disables history seeking; Reset remains available to interrupt it.
- System reduced-motion preference uses immediate verified transitions. WebGL2 failure/context loss shows a truthful 2D fallback and continues commands without fabricated 3D output.
- Limits are 128 actions per algorithm plan, 64 pending requests, and 1,024 local history actions. All produce explicit errors. History resets on reload and is not persistent solve storage.
- No solver, CFOP stage analysis, timer, webcam tracking, analytics, or AI feature was added.

## Verification

| Check | Result |
| --- | --- |
| Backend pytest | **328 passed**. Includes 81 forward/inverse animation endpoint cases across all 27 variants and nontrivial grips; geometry has exactly 26 slots/54 stickers. Existing independent engine conformance and reachability tests remain green. |
| Frontend Vitest | **35 passed**. Controller and UI tests cover queue ordering, duplicate callbacks, stale/reset/disconnect races, full-chain rejection, undo/redo, branch preservation/truncation, pause/resume, replay, keyboard fields/repeat, scramble, fallback, and reduced motion. |
| Frontend build/lint | Strict TypeScript/Vite production build and ESLint pass. Three/Fiber are lazily loaded and split into chunks below the default build warning threshold. |
| Backend lint/format/build | Ruff check/format and offline wheel/source build pass. |
| Dependency install | npm lockfile updated; installer audit reports zero vulnerabilities. No Python dependency was added. |
| Actual WebGL browser | Cube renders; rapid R/U/F lands at 3 HTM. Algorithm playback, undo/redo, and replay restore identical facelets. x rotation remains solved at 0 HTM. Camera orbit/zoom preserve state. A paused real random scramble resumes to exactly 20 HTM. |
| Built application preview | Split Three/Fiber chunks load, the real WebGL renderer animates R to exactly 1 HTM, and the fresh production tab records no console errors or warnings. |
| Responsive inspection | 1440 px desktop and 390 px mobile layouts fit without horizontal document overflow. |

Run from the repository root:

```sh
npm --prefix cubiq ci
npm --prefix cubiq run build
npm --prefix cubiq run lint
npm --prefix cubiq test
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv pytest cubiq/backend/tests -q
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv ruff check cubiq/backend
.tools/bin/uv run --locked --project cubiq/backend --cache-dir .cache/uv ruff format --check cubiq/backend
.tools/bin/uv build --project cubiq/backend --cache-dir .cache/uv --offline
```

Frontend test snapshots/plans are captured from the actual Python engine, not a second JavaScript model. Regenerate with `cubiq/backend/.venv/bin/python cubiq/scripts/generate-ui-fixtures.py`. CPU tests mock or fall back from WebGL; actual rendering is verified separately in the browser.

## Main files

- `backend/src/coach/cube.py`: scene projection, animation plans, random legal move generation; existing canonical rules preserved.
- `backend/src/coach/api/cube.py`: plan/scramble routes and cubie snapshot field; health milestone updated in `main.py`.
- `backend/tests/test_cube_animation.py`: independent integer-matrix endpoint checks and API coverage.
- `src/features/cube/CubeController.ts` and `useCube.ts`: ordered command queue, epoch guards, immutable history, replay.
- `CubeScene.tsx`: actual Three/Fiber geometry, interpolation, OrbitControls, camera accessibility, shared/disposed GPU resources.
- `CubeViewport.tsx` and `FaceletNet.tsx`: lazy scene loading, error boundary, context-loss and reduced-motion behavior, exact fallback.
- `CubeExplorer.tsx` and styles: polished responsive controls, sequence/counts, playback and algorithm entry.
- Controller, viewport and Explorer tests; engine-generated frontend fixtures; Three/Fiber dependency lockfile and Vite chunk configuration.
- README, architecture/roadmap/acceptance/conventions notes updated. Earlier milestone reports remain historical.

The local development application remains running using the README ports. The temporary production preview used for verification was stopped. Existing hosting metadata is preserved; nothing was published.
