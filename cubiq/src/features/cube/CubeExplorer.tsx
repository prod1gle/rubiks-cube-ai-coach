import { useEffect, useState } from 'react'
import { ArrowRight, Box, ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, Redo2, RefreshCw, ShieldCheck, Shuffle, Sparkles, Undo2 } from 'lucide-react'
import { useCube } from './useCube'
import CubeViewport from './CubeViewport'
import { FaceletNet } from './FaceletNet'

const faceLabels: Record<string, string> = { U: 'Up', R: 'Right', F: 'Front', D: 'Down', L: 'Left', B: 'Back' }

export function CubeExplorer() {
  const { snapshot, active, loading, planning, pending, history, cursor, paused, playing, error, lastAlgorithm, solving, solution, solutionStart, controller } = useCube()
  const [notation, setNotation] = useState('')
  const [facelets, setFacelets] = useState('')
  const [suffix, setSuffix] = useState('')
  const [duration, setDuration] = useState(0.28)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const working = !!active || planning || pending > 0
  const blocked = loading || working || solving
  const solutionPosition = solutionStart === undefined ? 0 : cursor - solutionStart
  const inSolution = !!solution && solutionStart !== undefined && solutionPosition >= 0 && solutionPosition <= solution.plan.steps.length
  const moveCount = history.slice(0, cursor).reduce((sum, step) => sum + step.htm, 0)
  const rotations = history.slice(0, cursor).filter(step => step.rotation).length
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media?.matches ?? false)
    media?.addEventListener('change', update)
    return () => media?.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (loading || solving || !snapshot || event.repeat || event.defaultPrevented) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault(); if (event.shiftKey) controller.forward(); else controller.back(); return
      }
      if ((event.metaKey || event.ctrlKey) && key === 'y') { event.preventDefault(); controller.forward(); return }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (['u', 'd', 'l', 'r', 'f', 'b', 'x', 'y', 'z'].includes(key)) {
        event.preventDefault()
        controller.enqueue((['x', 'y', 'z'].includes(key) ? key : key.toUpperCase()) + (event.shiftKey ? "'" : suffix))
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [controller, suffix, loading, solving, snapshot])
  const togglePlayback = () => {
    if (paused) controller.resume()
    else if (working || playing) controller.pause()
    else controller.play()
  }
  return <>
    <div className="page-heading explorer-heading flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow">YOUR CUBE. EVERY POSSIBILITY.</p><h1 id="page-title">Cube Explorer</h1><p className="explorer-subtitle">Understand the cube, one turn at a time.</p></div>
      <span className="outline-badge"><ShieldCheck size={12} className="inline mr-2" aria-hidden="true" />Engine-verified · 2A</span>
    </div>
    {error && <div role="alert" className="engine-error">{error} {!snapshot && 'Start the backend and reconnect.'}</div>}
    {!snapshot ? <section className="panel engine-loading"><p role="status">{loading ? 'Connecting to your cube engine…' : 'No validated state is available.'}</p><button className="secondary-button" disabled={loading} onClick={() => void controller.reset()}><RefreshCw size={14} aria-hidden="true" />Reconnect to engine</button></section> : <>
      <div className="explorer-stage">
        <section className="scene-shell panel" aria-label="Interactive cube workspace">
          <div className="scene-topline"><span className="scene-type"><Box size={15} aria-hidden="true" />3 × 3 <span>/</span> STANDARD CUBE</span><div className="scene-history"><button aria-label="Undo move" title="Undo / step backward (Ctrl or Command Z)" disabled={blocked || cursor === 0} onClick={controller.back}><Undo2 size={15} />Undo</button><button aria-label="Redo move" title="Redo / step forward" disabled={blocked || cursor >= history.length} onClick={controller.forward}><Redo2 size={15} />Redo</button></div></div>
          <CubeViewport snapshot={snapshot} active={active} duration={duration} reducedMotion={reducedMotion} onFinish={controller.finish} />
          <div className="scene-status"><span className="scene-state"><span className="status-dot" />{snapshot.is_solved ? 'Solved · in any grip' : 'Legal scrambled state'}</span><span>Grip <code data-testid="cube-frame">{snapshot.state.frame}</code></span></div>
        </section>
        <section className="panel move-panel" aria-labelledby="move-controls-title">
          <p className="eyebrow">TAKE IT FOR A SPIN</p><h2 id="move-controls-title">Make your move.</h2>
          <div className="turn-variants" role="group" aria-label="Turn variant">{[['', 'Quarter'], ["'", 'Inverse'], ['2', 'Double']].map(([value, label]) => <button key={label} aria-pressed={suffix === value} onClick={() => setSuffix(value)}>{label}</button>)}</div>
          <div className="face-move-grid">{['U', 'R', 'F', 'D', 'L', 'B'].map(face => <button key={face} aria-label={`Apply ${face}${suffix}`} disabled={loading || solving} onClick={() => controller.enqueue(face + suffix)}><span>{face}{suffix}</span><small>{faceLabels[face]}</small></button>)}</div>
          <div className="grip-heading"><span>Rotate the grip</span><small>0 HTM</small></div>
          <div className="grip-controls">{['x', 'y', 'z'].map(axis => <button key={axis} aria-label={`Rotate ${axis}${suffix}`} disabled={loading || solving} onClick={() => controller.enqueue(axis + suffix)}>{axis}{suffix}</button>)}</div>
          <div className="workspace-actions"><button className="primary-button" disabled={loading || solving} title="20 random legal face turns from the current state; not a WCA random-state scramble" onClick={controller.scramble}><Shuffle size={15} aria-hidden="true" />Scramble</button><button className="secondary-button" disabled={loading} title="Reset cube and clear history and pending inputs" onClick={() => void controller.reset()}><RefreshCw size={14} aria-hidden="true" />Reset cube</button></div>
          <p className="keyboard-note"><kbd>R</kbd> face keys · <kbd>⇧</kbd> inverse<br />X / Y / Z rotate the grip. Shortcuts pause while typing.</p>
        </section>
      </div>

      <section className="panel solution-panel" aria-labelledby="solution-title" aria-busy={solving}>
        <div className="solution-heading"><div><p className="eyebrow">A PATH TO SOLVED</p><h2 id="solution-title">Find a solution.</h2><p>Kociemba two-phase search, checked against your exact cube state.</p></div><button className="primary-button" disabled={blocked || (playing && !paused)} onClick={() => void controller.solve()}>{solving ? <LoaderCircle className="solver-spinner" size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}{solving ? 'Finding a solution…' : 'Solve cube'}</button></div>
        {solving && <div className="solution-loading" role="status"><span>Searching locally. The first solve also builds cached tables; the worker has a 30-second budget.</span><button className="secondary-button" onClick={controller.cancelSolve}>Cancel solve</button></div>}
        {solution ? <>
          <div className="solution-metadata"><span className="solution-verified"><ShieldCheck size={14} aria-hidden="true" />Engine verified</span><span>Short solution · optimality unproven</span><span>{solution.move_count} HTM</span><span>{(solution.elapsed_ms / 1000).toFixed(3)} s computation</span></div>
          {solution.plan.steps.length ? <>
            <ol className="solution-tokens" aria-label="Computed solution">{solution.plan.steps.map((step, index) => <li key={index} className={inSolution && index < solutionPosition ? 'applied' : ''} aria-current={inSolution && index === solutionPosition - 1 ? 'step' : undefined}><span>{step.token}</span><small>{index + 1}</small></li>)}</ol>
            <div className="solution-playback"><div className="playback-buttons"><button aria-label="Go to solution start" disabled={blocked} onClick={controller.solutionStart}><ChevronFirst size={17} /></button><button aria-label="Previous solution move" disabled={blocked || !inSolution || solutionPosition === 0} onClick={controller.back}><ChevronLeft size={18} /></button><button className="play-toggle" aria-label={playing && !paused ? 'Pause solution' : 'Play solution'} disabled={loading || solving || (!!active && !playing) || planning || pending > 0} onClick={playing && !paused ? controller.pause : controller.playSolution}>{playing && !paused ? <Pause size={17} /> : <Play size={17} />}</button><button aria-label="Next solution move" disabled={blocked || !inSolution || solutionPosition === solution.plan.steps.length} onClick={controller.forward}><ChevronRight size={18} /></button></div><span role="status">{inSolution ? `Solution step ${solutionPosition} of ${solution.plan.steps.length}${solutionPosition === solution.plan.steps.length ? ' · Solved' : ''}` : 'Return to the solution start to practice this state.'}</span></div>
          </> : <p className="solution-empty">This cube is already solved. No face turns are needed.</p>}
          <p className="solution-note">Verified to solve this state. This search does not prove a global minimum or a distance from optimum. <span>Metric: {solution.metric} · {solution.solver.name} {solution.solver.version}</span></p>
        </> : !solving && <p className="solution-note">Solve displays a plan before making any moves. Step through it or play it at your chosen speed. CFOP solving is not implemented yet.</p>}
      </section>

      <section className="panel timeline-panel" aria-labelledby="sequence-title">
        <div className="timeline-heading"><div><p className="eyebrow">FOLLOW THE TURNS</p><h2 id="sequence-title">Your move sequence</h2></div><div className="move-metrics"><strong data-testid="move-count">{moveCount}<small>HTM</small></strong><span>{cursor} / {history.length} actions<small>{rotations} grip rotations</small></span></div></div>
        <div className="move-tokens" aria-label="Current move sequence">{history.length ? history.map((step, index) => <span key={index} className={`${index < cursor ? 'applied' : 'future'} ${index === cursor - 1 ? 'current' : ''}`} aria-current={index === cursor - 1 ? 'step' : undefined}>{step.token}</span>) : <p>Your next turn starts here.</p>}{active && <span className="pending-token" aria-label={`Animating ${active.token}`}>{active.token}</span>}</div>
        <div className="playback-row"><div className="playback-buttons"><button aria-label="Go to start" disabled={blocked || !cursor} onClick={() => controller.seek(0)}><ChevronFirst size={17} /></button><button aria-label="Step backward" disabled={blocked || !cursor} onClick={controller.back}><ChevronLeft size={18} /></button><button className="play-toggle" aria-label={paused ? 'Resume playback' : working || playing ? 'Pause playback' : 'Play sequence'} disabled={loading || solving || (!working && !history.length)} onClick={togglePlayback}>{!paused && (working || playing) ? <Pause size={17} /> : <Play size={17} />}</button><button aria-label="Step forward" disabled={blocked || cursor === history.length} onClick={controller.forward}><ChevronRight size={18} /></button><button aria-label="Go to end" disabled={blocked || cursor === history.length} onClick={() => controller.seek(history.length)}><ChevronLast size={17} /></button></div><label className="sr-only" htmlFor="playback-position">Playback position</label><input id="playback-position" type="range" min="0" max={history.length || 1} value={cursor} disabled={blocked || !history.length} onChange={event => controller.seek(Number(event.target.value))} /><span className="playback-position">{cursor} / {history.length}</span></div>
        <div className="timeline-status" role="status">{loading ? 'Resetting state…' : paused ? 'Paused · the current turn finishes before pausing.' : active ? `Animating ${active.token}` : planning ? 'Validating sequence with the engine…' : 'Cube synchronized'}{pending > 0 && <span>{pending} queued items</span>}</div>
      </section>

      <section className="panel algorithm-panel" aria-labelledby="notation-title"><div className="algorithm-copy"><p className="eyebrow">TRY SOMETHING NEW</p><h2 id="notation-title">Run an algorithm.</h2><p>Paste a sequence, or build it one move at a time. Every turn is checked before it reaches your cube.</p><label className="speed-label" htmlFor="turn-speed">Animation speed<select id="turn-speed" value={duration} onChange={event => setDuration(Number(event.target.value))}><option value={0.16}>Quick · 0.16 s</option><option value={0.28}>Smooth · 0.28 s</option><option value={0.5}>Study · 0.5 s</option></select></label>{reducedMotion && <p className="reduced-note">Reduced motion is on. States update without turn animations.</p>}</div><div className="algorithm-entry"><form onSubmit={event => { event.preventDefault(); controller.enqueue(notation) }}><label htmlFor="cube-notation" className="engine-label">Move sequence</label><textarea id="cube-notation" value={notation} onChange={event => setNotation(event.target.value)} placeholder="R U R' U'" autoComplete="off" spellCheck={false} rows={2} disabled={loading || solving} maxLength={10000} /><div className="algorithm-submit"><span>Face turns · primes · doubles · x y z</span><button type="submit" className="primary-button" disabled={loading || solving || !notation.trim()}>Run algorithm <ArrowRight size={15} aria-hidden="true" /></button></div></form>{lastAlgorithm && <p className="last-algorithm">Last planned <code>{lastAlgorithm}</code></p>}</div></section>

      <details className="panel engine-more"><summary>State inspector, import & export <span>Exact engine data</span></summary><div className="engine-more-body"><FaceletNet snapshot={snapshot} /><p className="engine-help">Faces are viewed from outside in U R F D L B order. Importing a state starts a new local history.</p><form onSubmit={event => { event.preventDefault(); void controller.importFacelets(facelets) }}><label className="engine-label" htmlFor="cube-import">Facelet string</label><textarea id="cube-import" value={facelets} onChange={event => setFacelets(event.target.value)} spellCheck={false} maxLength={10000} rows={2} disabled={blocked} /><button className="secondary-button mt-3" type="submit" disabled={blocked || !facelets.trim()}>Validate and load</button></form><label className="engine-label" htmlFor="cube-facelets">Current facelets</label><textarea id="cube-facelets" data-testid="current-facelets" readOnly value={snapshot.facelets} rows={2} /><label className="engine-label" htmlFor="cube-json">Canonical serialized state</label><textarea id="cube-json" readOnly value={JSON.stringify(snapshot.state, null, 2)} rows={6} /><p className="engine-hash">State hash: {snapshot.state_hash}</p></div></details>
    </>}
  </>
}
