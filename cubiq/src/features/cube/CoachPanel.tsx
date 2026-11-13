import { useState } from 'react'
import { ArrowRight, Eye, Lightbulb, Pause, Play, RefreshCw } from 'lucide-react'
import type { CubeController, ExplorerState } from './CubeController'
import type { HintSettings } from '../../api/cube'

const levels = ['Subtle Hint', 'Guided Hint', 'Full Solution'] as const
const defaults: HintSettings = { mode: 'cfop', ranking: 'ergonomic', allow_rotations: true }

export function CoachPanel({ view }: { view: ExplorerState & { controller: CubeController } }) {
  const { snapshot, active, planning, pending, loading, solving, playing, paused, coaching, hintLoading, hintError, hintEnabled, hintSelectedId, controller } = view
  const [settings, setSettings] = useState(defaults)
  const [level, setLevel] = useState(0)
  const busy = loading || solving || !!active || planning || pending > 0 || (playing && !paused)
  const current = coaching?.input_hash === snapshot?.state_hash ? coaching : undefined
  const selected = current?.candidates.find(c => c.id === hintSelectedId)
  const update = (patch: Partial<HintSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    if (hintEnabled) controller.requestHint(next)
  }
  return <section className="panel coach-panel" aria-labelledby="next-best-title">
    <div className="coach-heading"><div><p className="eyebrow">A LITTLE DIRECTION</p><h2 id="next-best-title"><Lightbulb size={20} aria-hidden="true" />Next Best Move</h2><p>A hint for the cube you have right now.</p></div><button className="primary-button" disabled={!snapshot || busy || hintLoading} onClick={() => controller.requestHint(settings)}><RefreshCw size={14} aria-hidden="true" />{hintLoading ? 'Computing hint…' : hintEnabled ? 'Recalculate hint' : 'Get a hint'}</button></div>
    <div className="coach-settings"><label>Coaching mode<select value={settings.mode} onChange={e => update({ mode: e.target.value as HintSettings['mode'] })}><option value="cfop">CFOP continuation</option><option value="short">Shortest available solution</option></select></label><label>Candidate ranking<select value={settings.mode === 'short' ? 'htm' : settings.ranking} disabled={settings.mode === 'short'} onChange={e => update({ ranking: e.target.value as HintSettings['ranking'] })}><option value="ergonomic">Coded ergonomics</option><option value="htm">HTM moves, then rotations</option></select></label><label className="coach-rotations"><input type="checkbox" checked={settings.mode === 'cfop' && settings.allow_rotations} disabled={settings.mode === 'short'} onChange={e => update({ allow_rotations: e.target.checked })} />Allow cube rotations</label></div>
    <div className="hint-levels" role="tablist" aria-label="Hint level">{levels.map((name, index) => <button key={name} id={`hint-tab-${index}`} role="tab" tabIndex={level === index ? 0 : -1} onKeyDown={event => { const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (direction) { event.preventDefault(); const next = (index + direction + levels.length) % levels.length; setLevel(next); document.getElementById(`hint-tab-${next}`)?.focus() } }} aria-selected={level === index} aria-controls="hint-content" onClick={() => setLevel(index)}>{name}</button>)}</div>
    <div role="status" className="coach-status">{busy ? 'Waiting for a stable accepted state. Pause playback to inspect an intermediate state.' : hintLoading ? 'Computing from the exact current cube state…' : current ? 'Hint synchronized with your cube.' : hintEnabled ? 'The previous hint is no longer current.' : 'Choose how much help you want, then request a hint.'}</div>
    {paused && pending > 0 && !active && <button className="secondary-button" onClick={controller.stopQueue}><Pause size={13} aria-hidden="true" />Stop pending moves here</button>}
    {hintError && <div className="engine-error" role="alert"><p>{hintError} Try Recalculate hint; the accepted cube is retained.</p><button className="text-button" disabled={busy || hintLoading} onClick={controller.replanHint}>Replan from current state</button></div>}
    {current && <>
      <div className="coach-progress" aria-label="Current CFOP progress"><span className={current.progress.cross ? 'complete' : ''}>Cross {current.progress.cross ? '✓' : 'pending'}</span><span>F2L {Object.values(current.progress.pairs).filter(Boolean).length}/4</span><span className={current.progress.oll ? 'complete' : ''}>OLL {current.progress.oll ? '✓' : 'pending'}</span><span className={current.progress.pll ? 'complete' : ''}>PLL {current.progress.pll ? '✓' : 'pending'}</span><span>AUF {current.progress.solved ? '✓' : current.progress.pll ? 'remaining' : 'not ready'}</span></div>
      {current.status === 'solved' ? <p className="coach-solved">This cube is solved. No next move is needed.</p> : selected && <div className="coach-workspace">
        <div id="hint-content" role="tabpanel" aria-labelledby={`hint-tab-${level}`} className="hint-content">
          <p className="eyebrow">{selected.goal === 'solve' ? 'COMPLETE CONTINUATION' : 'NEXT CFOP GOAL'} · {selected.title}</p>
          <h3>{level === 0 ? 'Look for these pieces.' : level === 1 ? 'Make a plan for this case.' : 'Your verified next sequence.'}</h3>
          <p>{selected.hints[level === 0 ? 'subtle' : 'guided']}</p>
          <div className="hint-pieces"><Eye size={13} aria-hidden="true" /><span>{selected.pieces.map(p => p.name).join(' · ')} — outlined on the cube</span><a href="#cube-workspace">View target cubies</a></div>
          {level === 2 && <><code className="hint-notation" aria-label="Suggested notation">{selected.notation}</code><div className="hint-actions"><button className="primary-button" disabled={busy} onClick={() => controller.applyHint(true)}>Apply next move <strong>{selected.first_move}</strong><ArrowRight size={14} aria-hidden="true" /></button><button className="secondary-button" disabled={busy} onClick={() => controller.applyHint(false)}><Play size={13} aria-hidden="true" />Play & apply sequence</button></div><p className="hint-scope">Full Solution reveals the complete sequence for this selected goal{selected.goal === 'solve' ? ' (the remaining cube)' : ' (the next stage or pair)'}. It does not claim a globally best move.</p></>}
          <p className="hint-preservation">{selected.metrics.lost_slots.length ? `This Cross candidate loses completed slots at its endpoint: ${selected.metrics.lost_slots.join(', ')}.` : selected.metrics.preserved_slots.length ? `Preserves completed slots: ${selected.metrics.preserved_slots.join(', ')} at ${selected.goal === 'solve' ? 'the solution endpoint' : 'insertion/goal boundaries'}.` : 'No completed F2L slots to protect at this boundary.'}</p>
        </div>
        <div className="hint-alternatives"><h3>Compare valid alternatives</h3><p>{current.evaluated_candidates} candidates checked. Select a pair or another sequence.</p><div className="hint-candidate-list" role="group" aria-label="Hint alternatives">{current.candidates.map((c, index) => <button key={c.id} aria-label={`Choose ${c.title} alternative ${index + 1}`} aria-pressed={c.id === selected.id} onClick={() => controller.selectHint(c.id)}><span>{c.title}{c.id === current.recommended_id && <small>Recommended</small>}</span><span>{c.metrics.htm} HTM · {c.metrics.rotations} rotations<small>{settings.mode === 'cfop' && settings.ranking === 'ergonomic' ? `Comfort ${c.metrics.comfort_score.toFixed(2)}` : `Source: ${c.source}`}</small></span></button>)}</div></div>
      </div>}
      {current.continuation && <p className="hint-warning">Continuing your selected sequence through its verified endpoint. <button className="text-button" onClick={controller.replanHint}>Replan from current state</button></p>}
      {current.warnings.map(note => <p className="hint-warning" key={note}>{note}</p>)}
      <p className="hint-scope">{current.comparison_scope} Use any move controls to choose a different move; coaching refreshes automatically after the accepted turn.</p>
      <details className="coach-policy"><summary>How candidates are ranked</summary><p>Completed-slot loss ranks first; pair candidates must preserve the Cross and completed slots at insertion boundaries. HTM mode then compares moves and rotation actions. Coded ergonomics uses HTM + 2 per rotation + 2 per B turn + 1 per D turn + 0.35 per F turn + 0.15 per L turn. These are heuristic points, not measured seconds. Rotations cost zero HTM but have a comfort penalty. Generic right-handed weights are fixed.</p><p>{current.personalization.reason}</p><p>Shortest available compares computed verified complete solutions; it does not prove a global minimum. CFOP compares generated pair/stage paths and working grips.</p></details>
    </>}
    <div className="coach-footer"><span>Fixed white Cross · all moves checked by the engine</span>{hintEnabled && <button className="text-button" onClick={controller.disableHints}>Turn coaching off</button>}</div>
  </section>
}
