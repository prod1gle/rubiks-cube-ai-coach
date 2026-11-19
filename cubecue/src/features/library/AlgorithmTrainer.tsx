import { useEffect, useRef, useState } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, RefreshCw } from 'lucide-react'
import { library, loadTraining } from '../../api/library'
import type { TrainingCase, TrainingRow } from '../../api/library'
import { useCube } from '../cube/useCube'
import CubeViewport from '../cube/CubeViewport'
import { MoveGrid } from '../cube/MoveGrid'
import { KeyboardControls } from '../cube/KeyboardControls'

function Practice({ item, onNext, hasNext }: { item: TrainingCase; onNext: () => void; hasNext: boolean }) {
  const view = useCube(item.start)
  const { controller, snapshot, active, history, cursor, paused, playing } = view
  const [notation, setNotation] = useState(''), [revealed, setRevealed] = useState(false), [feedback, setFeedback] = useState(''), [saving, setSaving] = useState(false), [played, setPlayed] = useState(false), [duration, setDuration] = useState(0.28)
  const [algorithmId, setAlgorithmId] = useState(item.default_algorithm_id ?? 'original')
  const algorithms = item.algorithms ?? [{ id: 'original', notation: item.algorithm, setup: '', source: item.source, source_url: undefined, metrics: { htm: item.plan.sequence.htm, rotations: item.plan.sequence.rotations } }]
  const algorithm = algorithms.find(a => a.id === algorithmId) ?? algorithms[0]
  const attempt = useRef(crypto.randomUUID()), savedWord = useRef<string | undefined>(undefined)
  const working = view.planning || !!active || view.pending > 0
  const busy = view.loading || working || saving || (playing && !paused)
  const movesDisabled = view.loading || saving || played
  const applied = history.slice(0, cursor)
  const htm = applied.reduce((sum, step) => sum + step.htm, 0)
  const rotations = applied.filter(step => step.rotation).length
  const reset = () => { void controller.restoreSnapshot(item.start); attempt.current = crypto.randomUUID(); savedWord.current = undefined; setFeedback(''); setNotation(''); setPlayed(false) }
  const demonstrate = () => { setRevealed(true); setPlayed(true); setFeedback(''); void controller.restoreSnapshot(item.start).then(() => controller.enqueue(algorithm.notation)) }
  const togglePlayback = () => { if (paused) controller.resume(); else if (working || playing) controller.pause(); else controller.play() }
  const check = async () => {
    setSaving(true); setFeedback('')
    try {
      const word = applied.map(s => s.token).join(' ')
      if (played) throw new Error('Playback is a demonstration, not a practice attempt. Repeat the case to record your retry.')
      if (savedWord.current !== undefined && savedWord.current !== word) attempt.current = crypto.randomUUID()
      const result = await library<{ success: boolean; metrics: { htm: number } }>('/practice', { id: attempt.current, case_id: item.id, notation: word })
      savedWord.current = word
      setFeedback(`${result.success ? 'Objective achieved' : 'Objective not reached'}. Attempt saved · ${result.metrics.htm} HTM. Execution speed was not measured.`)
    } catch (e) { setFeedback((e as Error).message) } finally { setSaving(false) }
  }
  return <>
    <div className="explorer-stage trainer-workspace">
      <section className="panel scene-shell" aria-label="Training cube">
        <div className="scene-topline"><div className="trainer-case-name"><p className="eyebrow">{item.stage} · ENGINE VERIFIED</p><h2>{item.id}</h2></div><span className="trainer-mode">{played ? 'Demonstration' : 'Your practice'}</span></div>
        {snapshot && <CubeViewport snapshot={snapshot} active={active} duration={duration} reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false} onFinish={controller.finish} />}
        <div className="scene-status"><span>Case grip: white down · green front</span><span>{active ? `Animating ${active.token}` : working ? 'Preparing moves…' : 'Cube synchronized'}</span></div>
      </section>
      <section className="panel move-panel trainer-controls" aria-labelledby="trainer-moves-title">
        <p className="eyebrow">BUILD MUSCLE MEMORY</p><h2 id="trainer-moves-title">Make your move.</h2>
        <MoveGrid disabled={movesDisabled} onMove={controller.enqueue} />
        <div className="workspace-actions"><button className="primary-button" disabled={view.loading || saving} onClick={reset}><RefreshCw size={14} aria-hidden="true" />Repeat same case</button><button className="secondary-button" disabled={view.loading || saving || !hasNext} onClick={onNext} title="Load the next case in this stage. After the last case, return to the first.">Next case<ChevronRight size={15} aria-hidden="true" /></button></div>
        <p className="keyboard-note">Quarter turns, primes, then doubles.<br />I / K turn R / R′ · J / F turn U / U′.</p>
        {played && <p className="trainer-notice" role="status">Demonstration only. Repeat the case to start your own attempt.</p>}
      </section>
    </div>
    <div className="trainer-keyboard"><KeyboardControls disabled={movesDisabled} onMove={controller.enqueue} onUndo={controller.back} onRedo={controller.forward} /></div>
    <section className="panel timeline-panel trainer-timeline" aria-labelledby="trainer-sequence-title">
      <div className="timeline-heading"><div><p className="eyebrow">{played ? 'WATCH AND LEARN' : 'YOUR RETRY'}</p><h2 id="trainer-sequence-title">{played ? 'Algorithm playback' : 'Your move sequence'}</h2></div><div className="move-metrics"><strong data-testid="trainer-move-count">{htm}<small>HTM</small></strong><span>{cursor} / {history.length} actions<small>{rotations} grip rotations</small></span></div></div>
      <div className="move-tokens" aria-label="Practice move sequence">{history.length ? history.map((step, i) => <span key={i} className={`${i < cursor ? 'applied' : 'future'} ${i === cursor - 1 ? 'current' : ''}`} aria-current={i === cursor - 1 ? 'step' : undefined}>{step.token}</span>) : <p>Try the case, or play the verified algorithm.</p>}{active && <span className="pending-token">{active.token}</span>}</div>
      <div className="playback-row"><div className="playback-buttons">
        <button aria-label="Go to start" disabled={busy || !cursor} onClick={() => controller.seek(0)}><ChevronFirst size={17} /></button>
        <button aria-label="Step back" disabled={busy || !cursor} onClick={controller.back}><ChevronLeft size={18} /></button>
        <button className="play-toggle" aria-label={paused ? 'Resume playback' : working || playing ? 'Pause playback' : 'Play sequence'} disabled={view.loading || saving || (!working && !history.length)} onClick={togglePlayback}>{!paused && (working || playing) ? <Pause size={17} /> : <Play size={17} />}</button>
        <button aria-label="Step forward" disabled={busy || cursor >= history.length} onClick={controller.forward}><ChevronRight size={18} /></button>
        <button aria-label="Go to end" disabled={busy || cursor >= history.length} onClick={() => controller.seek(history.length)}><ChevronLast size={17} /></button>
      </div><label className="sr-only" htmlFor="trainer-position">Playback position</label><input id="trainer-position" type="range" min="0" max={history.length} value={cursor} disabled={busy || !history.length} onChange={e => controller.seek(Number(e.target.value))} /><span className="playback-position">{cursor} / {history.length}</span></div>
    </section>
    <section className="panel trainer-learning" aria-labelledby="trainer-learn-title">
      <div><p className="eyebrow">RECOGNIZE. UNDERSTAND. REPEAT.</p><h2 id="trainer-learn-title">Learn this case.</h2><p className="analysis-help">{item.stage === 'F2L' ? 'Solve the pair while preserving the cross and other starting slots.' : item.stage === 'OLL' ? 'Orient the last layer while preserving F2L.' : 'Permute the last layer while preserving F2L. Final AUF is allowed.'}</p></div>
      <label className="trainer-algorithm-picker">Algorithm choice<select aria-label="Algorithm choice" value={algorithm.id} disabled={busy} onChange={e => { reset(); setAlgorithmId(e.target.value) }}>{algorithms.map((a, i) => <option key={a.id} value={a.id}>Option {i + 1} · {a.metrics.htm} HTM · {a.metrics.rotations} rotations</option>)}</select></label>
      <p className="analysis-help">{algorithms.length} verified {algorithms.length === 1 ? 'choice' : 'choices'} from the identical starting state. Setups are included; the next stage can differ. Changing choices resets your retry.</p>
      <div className="trainer-learning-actions"><button className="primary-button" disabled={busy} onClick={demonstrate}><Play size={15} aria-hidden="true" />Play verified algorithm</button><button className="secondary-button" onClick={() => setRevealed(v => !v)} aria-expanded={revealed} aria-controls="trainer-algorithm">{revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}{revealed ? 'Hide algorithm' : 'Reveal algorithm'}</button><label className="speed-label">Animation speed<select value={duration} onChange={e => setDuration(Number(e.target.value))}><option value={0.16}>Quick · 0.16 s</option><option value={0.28}>Smooth · 0.28 s</option><option value={0.5}>Study · 0.5 s</option></select></label></div>
      {revealed && <div id="trainer-algorithm" className="trainer-algorithm"><code>{algorithm.notation}</code><span>{algorithm.metrics.htm} HTM · {algorithm.metrics.rotations} rotations · setup: {algorithm.setup || 'none'}</span><span>Source: {algorithm.source_url ? <a href={algorithm.source_url} target="_blank" rel="noreferrer">{algorithm.source}</a> : algorithm.source}</span></div>}
    </section>
    <section className="panel trainer-entry" aria-labelledby="trainer-entry-title"><p className="eyebrow">TRY YOUR OWN APPROACH</p><h2 id="trainer-entry-title">Practice and check.</h2><form onSubmit={e => { e.preventDefault(); if (!movesDisabled && notation.trim()) controller.enqueue(notation) }}><label htmlFor="trainer-notation">Your practice notation</label><input id="trainer-notation" value={notation} disabled={movesDisabled} placeholder="e.g. R U R′" spellCheck={false} maxLength={10000} onChange={e => setNotation(e.target.value)} /><div className="trainer-entry-actions"><button disabled={movesDisabled || !notation.trim()} className="secondary-button">Apply practice moves</button><button type="button" className="primary-button" disabled={busy || played || !cursor} onClick={() => void check()}>{saving ? 'Verifying…' : 'Verify and save attempt'}</button></div></form><p className="analysis-help">Your attempt is checked by the cube engine before saving. Execution speed is not measured.</p>{feedback && <p className="trainer-feedback" role="status">{feedback}</p>}</section>
    {view.error && <p className="trainer-feedback" role="alert">{view.error}</p>}
    <details className="panel trainer-source"><summary>Case scope, sources and selection policy</summary><p className="analysis-help">{item.algorithm_policy}</p><p className="analysis-help">{item.scope} Catalog {item.version}. Source: {item.source}</p></details>
  </>
}

export function AlgorithmTrainer() {
  const [rows, setRows] = useState<TrainingRow[]>([]), [stage, setStage] = useState('F2L'), [selection, setSelection] = useState(''), [item, setItem] = useState<TrainingCase>(), [error, setError] = useState(''), [revision, setRevision] = useState(0), [loading, setLoading] = useState(true)
  useEffect(() => { const task = new AbortController(); void library<{ cases: TrainingRow[] }>('/training', undefined, 'GET', task.signal).then(v => { if (!Array.isArray(v.cases) || !v.cases.length) throw new Error('Case catalog unavailable.'); if (!task.signal.aborted) setRows(v.cases) }).catch(e => { if (!task.signal.aborted) { setError(e.message); setLoading(false) } }); return () => task.abort() }, [revision])
  const cases = rows.filter(r => r.stage === stage)
  const selected = cases.find(r => r.id === selection)?.id ?? cases[0]?.id ?? ''
  const caseIndex = cases.findIndex(r => r.id === selected)
  const choose = (id: string) => { setSelection(id); setItem(undefined); setLoading(true); setError('') }
  useEffect(() => { if (!selected) return; const task = new AbortController(); void loadTraining(selected, task.signal).then(v => { if (!task.signal.aborted) { setItem(v); setLoading(false) } }).catch(e => { if (!task.signal.aborted) { setError(e.message); setLoading(false) } }); return () => task.abort() }, [selected, revision])
  return <><div className="page-heading"><p className="eyebrow">RECOGNITION. REPETITION.</p><h1 id="page-title">Algorithm Trainer</h1><p className="explorer-subtitle">Learn the case. Find your rhythm. Repeat from the same state.</p></div>
    <section className="panel trainer-catalog" aria-label="Choose a training case"><div className="trainer-catalog-fields"><label>Stage<select value={stage} onChange={e => { setStage(e.target.value); choose('') }}>{['F2L', 'OLL', 'PLL'].map(s => <option key={s}>{s}</option>)}</select></label><label>Recognized case<select disabled={!cases.length} value={selected} onChange={e => { choose(e.target.value) }}>{cases.map(r => <option key={r.id}>{r.id}</option>)}</select></label><span className="trainer-case-count">Case {caseIndex + 1} of {cases.length} · {stage}</span></div><p className="analysis-help">F2L: 24 insertion cases (a curated subset) · OLL: 57 classes · PLL: 21 classes. Every starting state and algorithm is engine verified.</p></section>
    {error && <div className="trainer-feedback" role="alert">{error}<button className="secondary-button" onClick={() => { setError(''); setLoading(true); setRevision(v => v + 1) }}>Retry catalog</button></div>}
    {loading && !error && <p className="trainer-feedback" role="status">Loading verified case…</p>}
    {!loading && !error && item && item.id === selected && item.stage === stage && <Practice key={`${item.id}-${revision}`} item={item} hasNext={cases.length > 1} onNext={() => choose(cases[(caseIndex + 1) % cases.length].id)} />}
  </>
}
