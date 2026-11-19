# Solve Studio

Solve Studio opens in **Physical cube** mode. Physical timing does not depend on the cube engine or camera. Release Space (outside controls), or use the buttons, to inspect/start/finish. Optional 15-second inspection is measured separately; this is practice timing with no automatic +2/DNF rules. `Escape` stops. Backgrounding, clock discontinuity and navigation are treated conservatively. Stop times beyond 24 hours are interrupted rather than clamped into valid statistics.

Select **Save physical result** after finishing to persist a result in local SQLite through `/api/physical-solves`. Retry failed saves before leaving. Physical results have a dedicated schema/table and never invent initial states, moves, TPS, CFOP splits or engine-confirmed solvedness. A new timer run replaces an unsaved in-memory result. History supports confirmed deletion. Statistics use only positive, valid, stopped physical runs in the latest 200 records; the displayed mean is arithmetic, not a competition average. Completion is operator-reported and unverified. No performance samples are seeded.

**Manual virtual solve** retains the canonical engine timer, exact input timestamps, validated moves, SQLite saves and analysis links. **Experimental camera assistance** retains the existing scan-and-confirm workflow and its explicit limitations.

## Optional local video

Video is **off by default**. Enable it before starting a solve and grant the browser camera permission. It requests video only (no microphone). The preview becomes ready before the solve starts; inspection is not recorded. Recording begins when the stopwatch enters the running state, ends when the run finishes/stops, and releases the camera. Stopping video manually, backgrounding, disconnects, mode changes or leaving also stop capture. A camera permission response arriving after timer start is explicitly labeled as skipped for that run. Permission denial, insecure context and unsupported MediaRecorder do not block timing.

Captured chunks remain only in browser memory; no video/frame upload occurs in this recording feature. Download the video to retain it. A new recording replaces the previous video; navigating away clears it and revokes object URLs. Capture is bounded to 10 minutes and approximately 250 MB, after which timing continues. Codec/container selection uses browser support (WebM or MP4); playback/download compatibility depends on that browser.

The replay provides normal controls, 0.25×–1.5× speed, a current timestamp and approximate ±1/30-second seeking. These are manual review controls, not exact decoded-frame stepping. Downloadable alignment JSON records monotonic solve start, recording start-request/start-event and stop-request times. The UI displays their measured offset. Encoder delay, first-frame exposure and per-frame alignment are unmeasured; metadata is not an exact physical move clock. No video-derived turns, automatic stage detection or video coaching are claimed.

## Validation

- `npx vitest run src/features/timer src/features/video`
- `npx eslint src/features/timer src/features/video --max-warnings 0`
- `npx tsc -b`
- `backend/.venv/bin/python -m pytest backend/tests/test_physical_solves.py -q` (run from `cubecue`, or adjust paths when in `backend`)

Synthetic fixtures test clock boundaries, lifecycle, storage, permission denial and stale asynchronous camera/recorder callbacks. They do not establish physical turn recognition or browser camera capture performance. Actual hardware permission/codec behavior requires an explicit human-granted browser smoke test.
