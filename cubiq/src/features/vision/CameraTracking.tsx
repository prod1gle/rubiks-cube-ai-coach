import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { library } from '../../api/library'
import { isSnapshot } from '../../api/cube'
import type { CubeSnapshot } from '../../api/cube'
import CubeViewport from '../cube/CubeViewport'
import { readScan } from './scanTransfer'
import { useCamera } from './useCamera'

interface Evidence { version: string; input_hash: string; face: string; visible: string | null; confidence: number[]; status: 'suspended' | 'settling' | 'visible_unchanged' | 'awaiting_confirmation'; reason: string; matches: { token: string; after_hash: string }[]; stable_frames: number; automatic_commit: false; processing_ms: number; pose: { roll_degrees: number; reprojection_rmse_px: number; blur_score: number; intrinsics: string } | null }
const colorName: Record<string, string> = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' }
export interface CameraSession { calibration?: Record<string, number[]>; orientation_guide?: Record<string, { center: string; top: string; right: string }>; id: string; revision: number; snapshot: CubeSnapshot; needs_sync: boolean; stopped: boolean; latest_observation: { index: number; at_ms: number; data: Evidence } | null; events: { index: number; kind: string; clock_id: string; at_ms: number }[]; timing_integrity: 'uncertain'; physical_tps: null }
const sessionKey = 'cubiq.camera-session.v1'
export function CameraTracking() {
  const { video, status, error: cameraError, running, opening, start, stop, capture } = useCamera()
  const [scan] = useState(readScan), [session, setSession] = useState<CameraSession>(), [busy, setBusy] = useState(false), [error, setError] = useState(''), [watching, setWatching] = useState(false), [face, setFace] = useState('F'), [aligned, setAligned] = useState(false), [confirmed, setConfirmed] = useState(false), [selected, setSelected] = useState(''), [manual, setManual] = useState(''), [resumed, setResumed] = useState(false), [restoring, setRestoring] = useState(() => !!sessionStorage.getItem(sessionKey)), [roundTrip, setRoundTrip] = useState<number>(), [measuring, setMeasuring] = useState(false), [measurementCount, setMeasurementCount] = useState(0), [truth, setTruth] = useState('unknown')
  const [clock] = useState(() => crypto.randomUUID()), task = useRef<AbortController | undefined>(undefined), inFlight = useRef(false), live = useRef(true), currentSession = useRef<CameraSession | undefined>(undefined), pendingGap = useRef(''), measurement = useRef<{ initial_facelets: string; calibration: Record<string, number[]>; face: string; frames: { image: string; at_ms: number }[] } | undefined>(undefined), measurementOn = useRef(false), mutationRef = useRef<((action: string, extra?: object) => Promise<CameraSession | undefined>) | undefined>(undefined)
  useEffect(() => {
    live.current = true
    const id = sessionStorage.getItem(sessionKey), abort = new AbortController()
    if (id) void library<CameraSession>(`/tracking/${id}`, undefined, 'GET', abort.signal).then(v => { if (!abort.signal.aborted) { if (!isSnapshot(v.snapshot)) throw new Error('Invalid saved camera state.'); currentSession.current = v; setSession(v); setResumed(!v.stopped) } }).catch(e => { if (!abort.signal.aborted) setError(e.message) }).finally(() => { if (!abort.signal.aborted) setRestoring(false) })
    return () => { live.current = false; abort.abort(); task.current?.abort() }
  }, [])
  const needsRecovery = !!session && (session.needs_sync || resumed || !!cameraError)
  const accepted = useCallback((v: CameraSession) => { if (!isSnapshot(v.snapshot)) throw new Error('Camera response did not contain a canonical engine state.'); if (live.current) { currentSession.current = v; setSession(v); setConfirmed(false) } return v }, [])
  const finishRequest = useCallback((flushGap = true) => {
    inFlight.current = false
    if (!live.current) return
    setBusy(false)
    if (flushGap && pendingGap.current) { const reason = pendingGap.current; pendingGap.current = ''; queueMicrotask(() => { void mutationRef.current?.('gap', { reason }) }) }
  }, [])
  const mutate = useCallback(async (action: string, extra: object = {}, at_ms = performance.now()) => {
    const current = currentSession.current
    if (!current || inFlight.current) return
    const coveredGap = action === 'resync' ? pendingGap.current : ''
    if (action === 'resync') pendingGap.current = ''
    if (action !== 'observe') { measurementOn.current = false; setMeasuring(false) }
    inFlight.current = true; setBusy(true); setError(''); task.current?.abort(); const abort = new AbortController(); task.current = abort
    let succeeded = false
    try { const v = await library<CameraSession>(`/tracking/${current.id}/${action}`, { revision: current.revision, clock_id: clock, at_ms, ...extra }, 'POST', abort.signal); if (!abort.signal.aborted) { const result = accepted(v); succeeded = true; return result } }
    catch (e) { if (!abort.signal.aborted) { if (action === 'gap' && 'reason' in extra) pendingGap.current = String(extra.reason); if (action === 'resync' && !pendingGap.current) pendingGap.current = coveredGap; setError((e as Error).message); setWatching(false); setResumed(true) } }
    finally { finishRequest(succeeded) }
  }, [clock, accepted, finishRequest])
  useEffect(() => { mutationRef.current = mutate }, [mutate])
  const queueGap = useCallback((reason: string) => {
    setWatching(false); setResumed(true)
    if (inFlight.current) pendingGap.current = reason
    else void mutate('gap', { reason })
  }, [mutate])
  const observeNow = useCallback(async () => {
    if (!session || session.stopped || needsRecovery || !running || inFlight.current) return
    try {
      const frame = capture(), begun = performance.now()
      if (measurementOn.current && measurement.current && measurement.current.frames.length < 30) { measurement.current.frames.push(frame); setMeasurementCount(measurement.current.frames.length) }
      const v = await mutate('observe', { image: frame.image, face }, frame.at_ms)
      if (!live.current || !v) return
      setRoundTrip(performance.now() - begun)
      const evidence = v.latest_observation?.data
      if (evidence?.status === 'suspended' || evidence?.status === 'awaiting_confirmation') { setWatching(false); setSelected(evidence.matches.find(m => m.token)?.token ?? '') }
    } catch (e) { setError((e as Error).message); setWatching(false); setResumed(true) }
  }, [session, needsRecovery, running, capture, mutate, face])
  const observeRef = useRef(observeNow)
  useEffect(() => { observeRef.current = observeNow }, [observeNow])
  useEffect(() => { if (!watching) return; const interval = window.setInterval(() => { void observeRef.current() }, 500); return () => window.clearInterval(interval) }, [watching])
  useEffect(() => { const hidden = () => { if (document.hidden) { setWatching(false); setResumed(true); if ((session && !session.stopped) || inFlight.current) queueGap('Page hidden; observation continuity lost.') } }; document.addEventListener('visibilitychange', hidden); return () => document.removeEventListener('visibilitychange', hidden) }, [session, queueGap])
  const reload = async () => {
    if (inFlight.current || !session) return
    inFlight.current = true; setBusy(true); setWatching(false)
    const abort = new AbortController(); task.current = abort
    let succeeded = false
    try { const v = await library<CameraSession>(`/tracking/${session.id}`, undefined, 'GET', abort.signal); if (!abort.signal.aborted && live.current) { accepted(v); succeeded = true; setResumed(!v.stopped); setError('') } }
    catch (e) { if (!abort.signal.aborted) setError((e as Error).message) }
    finally { finishRequest(succeeded) }
  }
  const begin = async () => {
    if (!scan || !aligned || inFlight.current) return
    inFlight.current = true
    setBusy(true); setError(''); const abort = new AbortController(); task.current = abort
    let succeeded = false
    try { const raw = await library<CameraSession>('/tracking', { state: scan.snapshot.state, calibration: scan.calibration, confirmed_alignment: aligned }, 'POST', abort.signal); if (abort.signal.aborted || !live.current) return; const v = accepted(raw); succeeded = true; sessionStorage.setItem(sessionKey, v.id); setResumed(false); setAligned(false) } catch (e) { setError((e as Error).message) } finally { finishRequest(succeeded) }
  }
  const recovery = async (useScan: boolean) => {
    if (!aligned) return
    const latest = useScan ? readScan() : undefined
    if (useScan && !latest) { setError('Perform a new guided scan first.'); return }
    const v = await mutate('resync', { confirmed_alignment: true, manual_sequence: manual, ...(latest ? { facelets: latest.snapshot.facelets, calibration: latest.calibration } : {}) })
    if (v) { setResumed(false); setAligned(false); setManual('') }
  }
  const beginMeasurement = () => {
    const calibration = session?.calibration
    if (!session || !calibration) { setError('A reviewed calibration is required to export measurements.'); return }
    measurement.current = { initial_facelets: session.snapshot.facelets, calibration, face, frames: [] }
    measurementOn.current = true; setMeasuring(true); setMeasurementCount(0); setTruth('unknown')
  }
  const exportMeasurement = () => {
    if (!measurement.current?.frames.length) return
    measurementOn.current = false; setMeasuring(false)
    const body = { dataset_kind: 'physical-webcam', provenance: 'Browser webcam captures; operator-supplied action label. Timing annotation unavailable.', cases: [{ id: crypto.randomUUID(), ...measurement.current, actual_action: truth === 'unknown' ? null : truth === 'none' ? '' : truth }] }
    const url = URL.createObjectURL(new Blob([JSON.stringify(body)], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'cubiq-camera-evaluation.json'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const orientation = session?.orientation_guide?.[face]
  const evidence = session?.latest_observation?.data
  const canConfirm = evidence && session.latest_observation?.index === session.revision - 1 && evidence.input_hash === session?.snapshot.state_hash && evidence.stable_frames >= 3 && ['awaiting_confirmation', 'visible_unchanged'].includes(evidence.status) && !needsRecovery
  return <section className="camera-tracking"><section className="panel library-panel"><p className="eyebrow">EXPERIMENTAL · CAMERA ASSISTANCE</p><h2>Observe what the camera can see.</h2><p>Slow, one-action-at-a-time practice with a frontal visible face. You lock its orientation and explicitly confirm each move. No hidden turns or fast multi-turn sequences are reconstructed automatically.</p><p className="hint-warning">Physical move completeness, turn timing and TPS are unverified. A single matching hypothesis does not prove the physical move. Occlusion or ambiguity suspends logging.</p><Link to="/scan" className="secondary-button">Guided scan / rescan</Link><p role="status">{status}</p><div className="hint-actions"><button disabled={opening || busy} onClick={() => void start()}>Start tracking camera</button><button disabled={!running && !opening} onClick={() => { setWatching(false); setResumed(true); stop(); if (session && !session.stopped) queueGap('Camera stopped by operator.') }}>Stop tracking camera</button></div>{cameraError && <p role="alert">{cameraError}</p>}
    {restoring && <p role="status">Restoring saved camera session…</p>}{!session && <><p>{scan ? 'A reviewed scan is available. Confirm it still matches the physical cube.' : 'Complete a six-face scan before starting.'}</p><label><input type="checkbox" checked={aligned} onChange={e => setAligned(e.target.checked)} />Physical cube matches the reviewed scan, with the selected face in the instructed orientation.</label><button className="primary-button" disabled={!scan || !aligned || busy || restoring} onClick={() => void begin()}>Begin camera session</button></>}
    {session && <p>Session {session.id.slice(0,8)} · {session.revision} persisted evidence events · {session.stopped ? 'Ended' : needsRecovery ? 'Logging suspended · recovery required' : 'Awaiting camera observations'}</p>}{session && <button disabled={busy} onClick={() => { void reload() }}>Reload saved camera session</button>}{error && <p className="engine-error" role="alert">{error}</p>}</section>
    <div className="scan-workspace"><section className="panel library-panel"><div className="scan-preview"><video ref={video} muted playsInline autoPlay aria-label="Tracking camera preview" /><div className="scan-grid" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i} />)}</div></div><p className="analysis-help">Keep one face frontal and all nine stickers clear. Approximate sticker-plane pose uses OpenCV contours, homography and PnP with assumed camera intrinsics; full cube axes remain user supplied.</p><label>Visible face<select disabled={busy || watching} value={face} onChange={e => { setFace(e.target.value); setAligned(false); setResumed(!!session); setConfirmed(false); if (session && !session.stopped) queueGap('Visible face changed; orientation requires confirmation.') }}>{[...'URFDLB'].map(f => <option key={f}>{f}</option>)}</select></label><p className="analysis-help">{orientation ? `Visible center: ${colorName[orientation.center]}. Adjacent ${colorName[orientation.top]} center above; adjacent ${colorName[orientation.right]} center to the right.` : 'Use the top/right adjacent-center orientation from Guided Scan.'} Whole-cube rotations require confirmation too.</p><div className="hint-actions"><button disabled={!session || session.stopped || !running || busy || needsRecovery} onClick={() => void observeNow()}>Observe current face</button><button disabled={!session || session.stopped || !running || needsRecovery} onClick={() => { if (watching) queueGap('Observations paused; continuity unverified.'); else setWatching(true) }}>{watching ? 'Pause observations' : 'Observe at up to 2 FPS'}</button></div>{evidence && <><p role="status">{evidence.reason}</p><p className="analysis-help">{evidence.stable_frames} / 3 stable frames · min sticker confidence {evidence.confidence.length ? `${(Math.min(...evidence.confidence)*100).toFixed(0)}% heuristic` : 'unavailable'} · processing {evidence.processing_ms.toFixed(1)} ms · request round trip {roundTrip?.toFixed(1) ?? '—'} ms. These are measured processing times, not physical turn latency.</p>{evidence.pose && <p className="analysis-help">Estimated plane roll {evidence.pose.roll_degrees.toFixed(1)}° · reprojection {evidence.pose.reprojection_rmse_px.toFixed(2)} px · sharpness score {evidence.pose.blur_score.toFixed(0)}. {evidence.pose.intrinsics}</p>}</>}
    {canConfirm && <><label>Candidate action<select disabled={busy || watching} value={selected} onChange={e => { setSelected(e.target.value); setConfirmed(false) }}><option value="">Choose the action you actually made</option>{evidence.matches.filter(m => m.token).map(m => <option key={m.token}>{m.token}</option>)}</select></label><label><input type="checkbox" disabled={busy || watching} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Exactly this one action occurred since the accepted state; no other or hidden turns.</label><button className="primary-button" disabled={!selected || !confirmed || busy || watching} onClick={() => void mutate('confirm', { token: selected, observation_index: session.latest_observation!.index, confirmed_single_action: confirmed })}>Confirm and log observed action</button></>}
    </section><section className="panel library-panel">{session ? <><h2>Canonical accepted state</h2><CubeViewport snapshot={session.snapshot} duration={0} reducedMotion onFinish={() => {}} /><p>{session.snapshot.is_solved ? 'Canonical state solved; physical alignment remains operator-confirmed.' : 'Canonical state is unsolved.'}</p><Link className="primary-button" to={`/solve-analysis?camera=${session.id}`}>Analyze confirmed segments</Link><div className="hint-actions"><button disabled={busy || session.stopped} onClick={() => { setWatching(false); stop(); void mutate('stop') }}>End camera session</button>{session.stopped && <button disabled={busy} onClick={() => { sessionStorage.removeItem(sessionKey); currentSession.current = undefined; setSession(undefined); setWatching(false); setAligned(false) }}>Prepare another camera session</button>}</div></> : <p>Your accepted cube appears here after session creation. Observations alone never change it.</p>}</section></div>
    {session && <section className="panel library-panel"><h2>Measure with real captures</h2><p className="analysis-help">Start before making one known action. Observe the face, then label what actually occurred independently of the suggestions. Export retains the first 30 real frames locally; no frames are saved to SQLite. Reset after each action. Physical turn latency needs separately annotated completion times and is unavailable from clicks.</p><button disabled={busy || needsRecovery || session.stopped || !running || measuring} onClick={beginMeasurement}>Begin measurement burst</button><p>{measurementCount} real captured frames retained for this explicit measurement.</p><label>Actual action for ground truth<select value={truth} onChange={e => setTruth(e.target.value)}><option value="unknown">Unknown / occluded</option><option value="none">No turn occurred</option>{[...'URFDLBxyz'].flatMap(f => ['', "'", '2'].map(s => <option key={f+s}>{f+s}</option>))}</select></label><button disabled={!measurementCount || busy} onClick={exportMeasurement}>Export annotated camera frames</button></section>}
    {session && !session.stopped && <section className="panel library-panel"><h2>Recover synchronization</h2><p>If evidence is missing, stop turning. Either compare every visible/hidden face yourself, enter a known corrective sequence, or perform a guided rescan. A recovery boundary is saved; unknown turns and elapsed stage times stay unavailable.</p><label>Known manual correction (optional)<input maxLength={512} value={manual} disabled={busy} onChange={e => setManual(e.target.value)} placeholder="Only moves you know actually occurred" /></label><label><input type="checkbox" checked={aligned} disabled={busy} onChange={e => setAligned(e.target.checked)} />I verified physical alignment with the corrected virtual state or a fresh six-face scan.</label><div className="hint-actions"><button disabled={!aligned || busy} onClick={() => void recovery(false)}>Confirm manual alignment</button><button disabled={!aligned || busy || !readScan()} onClick={() => void recovery(true)}>Resynchronize from latest reviewed scan</button></div><p className="analysis-help">Rescanning preserves this session’s earlier evidence and starts a new confirmed segment. It does not manufacture missing turns.</p></section>}
  </section>
}
