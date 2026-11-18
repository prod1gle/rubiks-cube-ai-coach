import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router-dom'
import CubeViewport from '../cube/CubeViewport'
import { CameraTracking } from '../vision/CameraTracking'
import { TimerController } from './TimerController'
import { saveSolve } from '../../api/library'
import { storeTimedRecording } from './recording'

export function LiveSolve() {
  const [mode, setMode] = useState<'manual' | 'camera'>('manual')
  const [controller] = useState(() => new TimerController())
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [inspection, setInspection] = useState(true), [suffix, setSuffix] = useState(''), [facelets, setFacelets] = useState(''), [storageError, setStorageError] = useState('')
  const [saved, setSaved] = useState(''), [saveError, setSaveError] = useState(''), [retrySave, setRetrySave] = useState(0)
  const { phase, snapshot, loading, pending, record } = view
  const active = ['running', 'paused', 'stopping', 'inspection'].includes(phase)
  useEffect(() => {
    if (!record || !['complete', 'stopped', 'interrupted'].includes(phase)) return
    let live = true
    void saveSolve(record).then(v => { if (live) { setSaved(v.id); setSaveError('') } }).catch(e => { if (live) setSaveError(e.message) })
    return () => { live = false }
  }, [record, phase, retrySave])
  useEffect(() => {
    controller.connect(); const interval = window.setInterval(controller.pulse, 50)
    const visibility = () => { if (document.hidden) controller.markUncertain('Page was hidden during capture; timing continuity is unverified.') }
    const leaving = () => controller.interrupt('Recording interrupted by page exit; no clock continuity across reload.')
    document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', leaving)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leaving); controller.disconnect() }
  }, [controller])
  useEffect(() => {
    if (mode !== 'manual') return
    const editing = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"]')
    const down = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || editing(event.target)) return
      if (event.code === 'Space') { if (!(event.target instanceof Element && event.target.closest('button,a'))) event.preventDefault(); return }
      if (event.key === 'Escape') { event.preventDefault(); controller.stop(); return }
      if (event.key.toLowerCase() === 'p') { event.preventDefault(); if (phase === 'paused') controller.resume(); else controller.pause(); return }
      const key = event.key.toLowerCase()
      if (phase === 'running' && ['u', 'r', 'f', 'd', 'l', 'b', 'x', 'y', 'z'].includes(key)) { event.preventDefault(); controller.move((['x', 'y', 'z'].includes(key) ? key : key.toUpperCase()) + (event.shiftKey ? "'" : suffix)) }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || editing(event.target) || (event.target instanceof Element && event.target.closest('button,a'))) return
      event.preventDefault()
      if (phase === 'inspection') controller.beginSolve()
      else if (phase === 'running') controller.stop()
      else if (phase === 'paused') controller.resume()
      else controller.start(inspection)
    }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [controller, phase, inspection, suffix, mode])
  const time = phase === 'inspection' ? Math.max(0, 15000 - view.inspection_ms) : view.elapsed_ms
  return <>
    <div className="page-heading"><p className="eyebrow">BE PRESENT. EVERY TURN COUNTS.</p><h1 id="page-title">Live Solve</h1><p className="explorer-subtitle">A focused timer for manual virtual practice.</p></div>
    <div className="hint-actions" role="group" aria-label="Solve input mode"><button disabled={active} aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>Manual virtual solve</button><button disabled={active} aria-pressed={mode === 'camera'} onClick={() => setMode('camera')}>Experimental camera assistance</button></div>
    {mode === 'camera' ? <CameraTracking /> : <>
    <section className="panel solve-timer" aria-label="Manual solve timer"><div className="timer-topline"><span className="outline-badge">MANUAL VIRTUAL INPUT</span><span className="timer-phase" role="status">{phase === 'complete' ? 'Solved · engine confirmed' : phase === 'paused' ? 'Paused practice · elapsed time continues' : phase === 'stopping' ? 'Confirming pending moves…' : phase}</span></div>
      <div className={`timer-digits ${phase === 'inspection' ? 'inspecting' : ''}`} aria-label={phase === 'inspection' ? 'Inspection remaining' : 'Elapsed solve time'}>{(time / 1000).toFixed(2)}<small>s</small></div>
      {phase === 'inspection' && <p className="analysis-help">{view.inspection_ms >= 15000 ? 'Inspection reached 15 seconds. Start when ready; any overrun is recorded.' : 'Inspect the cube. Release Space or select Start solve when ready.'} This practice countdown does not apply competition penalties.</p>}
      {view.uncertain && <p className="hint-warning" role="status">Timing integrity is uncertain. Exact move states remain available; time-based statistics will be unavailable.</p>}
      <div className="timer-actions">{!active && <button className="primary-button" disabled={loading || !snapshot || snapshot.is_solved} onClick={() => controller.start(inspection)}>{inspection ? 'Start inspection' : 'Start solve'}</button>}{phase === 'inspection' && <button className="primary-button" onClick={controller.beginSolve}>Start solve</button>}{phase === 'running' && <button className="secondary-button" onClick={controller.pause}>Pause practice</button>}{phase === 'paused' && <button className="primary-button" onClick={controller.resume}>Resume practice</button>}{active && <button className="secondary-button" disabled={phase === 'stopping'} onClick={controller.stop}>{phase === 'inspection' ? 'Cancel inspection' : 'Stop solve'}</button>}
        {saved && record?.clock_id === saved && !active && <Link to={`/solve-analysis?solve=${saved}`} className="secondary-button">View saved solve</Link>}
        {record && !active && <Link className="primary-button" to="/solve-analysis?timed=latest" onClick={event => { try { storeTimedRecording(record) } catch { event.preventDefault(); setStorageError('Session storage is unavailable. Copy the recording JSON before leaving this page.') } }}>Analyze this solve →</Link>}
      </div><p className="analysis-help">Space release starts/stops · R/U/F/D/L/B and x/y/z enter moves · Shift selects prime · P pauses/resumes · Escape stops. Keyboard shortcuts ignore form controls. Completion is confirmed by the cube engine, using the final input timestamp.</p>
      <div className="timer-live-metrics"><span>{view.htm} <small>HTM</small></span><span>{view.rotations} <small>rotations</small></span><span>{pending} <small>awaiting validation</small></span></div>
      {!active && <label className="timer-inspection"><input type="checkbox" checked={inspection} onChange={e => setInspection(e.target.checked)} />Optional 15-second inspection</label>}
      {snapshot?.is_solved && !active && <p className="analysis-help">Prepare an unsolved cube to start another run.</p>}{view.error && <p role="alert" className="engine-error">{view.error}</p>}{storageError && <p role="alert">{storageError}</p>}{saveError && !active && record && record.clock_id !== saved && <p role="alert">Could not save recording: {saveError} <button onClick={() => setRetrySave(v => v + 1)}>Retry save</button></p>}{saved && record?.clock_id === saved && !active && <p role="status">Recording saved locally.</p>}
    </section>
    <div className="explorer-stage timer-workspace"><section className="panel scene-shell" aria-label="Timed manual cube">{snapshot ? <CubeViewport snapshot={snapshot} duration={0} reducedMotion onFinish={() => {}} /> : <p role="status" className="engine-loading">{loading ? 'Connecting to the canonical cube engine…' : 'No validated state available.'}</p>}<p className="analysis-help timer-scene-note">Immediate accepted-state view. Animation and network acknowledgement times do not define input timestamps.</p></section>
      <section className="panel move-panel"><h2>Manual moves</h2><div className="turn-variants" role="group" aria-label="Timed turn variant">{[['', 'Quarter'], ["'", 'Inverse'], ['2', 'Double']].map(([v, name]) => <button key={name} aria-pressed={suffix === v} onClick={() => setSuffix(v)}>{name}</button>)}</div><div className="face-move-grid">{['U', 'R', 'F', 'D', 'L', 'B'].map(move => <button key={move} aria-label={`Timed move ${move}${suffix}`} disabled={phase !== 'running'} onClick={() => controller.move(move + suffix)}>{move}{suffix}</button>)}</div><div className="grip-controls">{['x', 'y', 'z'].map(move => <button key={move} aria-label={`Timed rotation ${move}${suffix}`} disabled={phase !== 'running'} onClick={() => controller.move(move + suffix)}>{move}{suffix}</button>)}</div><p className="analysis-help">Enter one turn per action. Algorithms cannot be pasted into a timed run. Use an inverse move to correct an error; accepted history is never rewritten.</p><button className="secondary-button" disabled={active || loading} onClick={() => void controller.scramble()}>Prepare random legal scramble</button></section></div>
    {!active && <details className="panel analysis-record"><summary>Prepare a specific cube state</summary><form onSubmit={e => { e.preventDefault(); void controller.importFacelets(facelets) }}><label>Initial facelets<textarea value={facelets} onChange={e => setFacelets(e.target.value)} maxLength={10000} spellCheck={false} rows={2} /></label><button className="secondary-button" disabled={loading || !facelets.trim()}>Validate preparation</button></form><p className="analysis-help">Only the validated initial state is used. Preparation moves and scrambles are outside solve timing. Random scrambles are legal move walks, not competition random-state scrambles.</p></details>}
    {record && <details className="panel analysis-record"><summary>Exact manual recording · session-local JSON</summary><p className="analysis-help">Latest run only. Finalized runs are also saved to local SQLite; retry a failed save before leaving. An unfinished draft is marked interrupted on analysis.</p><textarea readOnly aria-label="Timed recording JSON" value={JSON.stringify(record, null, 2)} rows={8} /></details>}
  </>}
  </>
}
