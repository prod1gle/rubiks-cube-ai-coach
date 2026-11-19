import { useEffect, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, CircleCheck, Compass, GraduationCap, Pause, Play, RefreshCw, ScanLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import CubeViewport from '../cube/CubeViewport'
import { KeyboardControls } from '../cube/KeyboardControls'
import { MoveGrid } from '../cube/MoveGrid'
import { useCube } from '../cube/useCube'
import { loadLesson, verifyLesson } from './api'
import type { BeginnerLesson } from './api'
import { curriculum } from './curriculum'
import type { LessonGuide } from './curriculum'
import './learn.css'

const progressKey = 'cubecue.beginner-v1.completed'
function readProgress(): string[] {
  try { const ids: unknown = JSON.parse(localStorage.getItem(progressKey) ?? '[]'); return Array.isArray(ids) ? curriculum.filter(g => ids.includes(g.id)).map(g => g.id) : [] } catch { return [] }
}

function LessonWorkspace({ item, guide, onComplete, onNext, hasNext }: { item: BeginnerLesson; guide: LessonGuide; onComplete: (id: string) => void; onNext: () => void; hasNext: boolean }) {
  const view = useCube(item.start)
  const { controller, snapshot, active, cursor, history } = view
  const [mode, setMode] = useState<'practice' | 'example'>('practice'), [notation, setNotation] = useState(''), [feedback, setFeedback] = useState(''), [checking, setChecking] = useState(false), [passed, setPassed] = useState(false), [duration, setDuration] = useState(0.65)
  const checkAbort = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => checkAbort.current?.abort(), [])
  const moving = view.loading || view.planning || !!active || view.pending > 0 || (view.playing && !view.paused)
  const busy = moving || checking
  const manualDisabled = busy || mode === 'example'
  const tokens = item.plan.steps.map(s => s.token)
  const reset = () => { checkAbort.current?.abort(); setMode('practice'); setPassed(false); setFeedback(''); setNotation(''); void controller.restoreSnapshot(item.start) }
  const demo = () => { setMode('example'); setFeedback(''); setPassed(false); void controller.restoreSnapshot(item.start).then(() => controller.enqueue(item.algorithm)) }
  const stepExample = () => {
    setMode('example'); setFeedback(''); setPassed(false)
    if (mode !== 'example') void controller.restoreSnapshot(item.start).then(() => controller.enqueue(tokens[0]))
    else if (cursor < history.length) controller.forward()
    else if (cursor < tokens.length) controller.enqueue(tokens[cursor])
  }
  const apply = (sequence: string) => { setFeedback(''); setPassed(false); controller.enqueue(sequence) }
  const verify = async () => {
    if (!snapshot || busy || mode !== 'practice') return
    checkAbort.current?.abort(); const task = new AbortController(); checkAbort.current = task
    setChecking(true); setFeedback('')
    try {
      const result = await verifyLesson(item, history.slice(0, cursor).map(s => s.token).join(' '), snapshot.state_hash, task.signal)
      if (task.signal.aborted) return
      if (result.success) { setPassed(true); onComplete(item.id); setFeedback(`${item.id === 'alignment' ? 'Solved cube verified.' : 'Objective verified.'} Your own attempt passed the cube engine check. ${result.moves} HTM.`) }
      else setFeedback(result.protected_preserved ? 'Not quite yet. The current stage objective is not reached. Compare your cube with the checkpoint, undo a turn, or repeat the same case.' : 'A previous layer is no longer complete. Undo your last moves or repeat the case, then finish the whole algorithm before checking.')
    } catch (error) { if (!task.signal.aborted) setFeedback((error as Error).message) } finally { if (!task.signal.aborted) setChecking(false) }
  }
  return <>
    <section className="learn-lesson panel" aria-labelledby="learn-lesson-title">
      <div className="learn-lesson-top"><div><p className="eyebrow">{guide.label}</p><h2 id="learn-lesson-title">{guide.title}</h2></div><span className="learn-mode">{mode === 'example' ? 'Guided example' : 'Your practice'}</span></div>
      <p className="learn-concept">{guide.concept}</p>
      <div className="learn-objective"><Compass size={20} aria-hidden="true" /><div><strong>Your objective</strong><p>{guide.objective}</p></div></div>
      <div className="learn-instructions"><div><h3>First, find your grip.</h3><p>{guide.recognize}</p><div className="learn-grip"><span><i className="learn-white" />White down</span><span><i className="learn-yellow" />Yellow up</span><span><i className="learn-green" />Green front in the exercise</span></div><p className="learn-grip-note">On your own cube, change the front when a step asks you to; keep white underneath. Match your actual side centers rather than assuming a right-side color.</p></div><div><h3>Work through it.</h3><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol></div></div>
      <div className="learn-checkpoint"><CircleCheck size={18} aria-hidden="true" /><div><h3>Before you move on</h3><p>{guide.checkpoint}</p></div></div>
      <details className="learn-mistake"><summary>A common place to get stuck</summary><p>{guide.mistake}</p></details>
    </section>
    <div className="learn-practice-heading"><div><p className="eyebrow">SEE IT. TRY IT. CHECK IT.</p><h2>Make it click.</h2></div><span>ONE PREPARED CASE · REPEATABLE</span></div>
    <p className="learn-drill">{guide.drill}</p>
    <div className="learn-workspace">
      <section className="panel scene-shell learn-scene" aria-label="Beginner practice cube"><div className="scene-topline"><span className="eyebrow">CANONICAL CUBE ENGINE</span><span className="learn-mode">{mode === 'example' ? 'Watch first' : 'Try it yourself'}</span></div>
        {snapshot && <CubeViewport snapshot={snapshot} active={active} duration={duration} reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false} onFinish={controller.finish} />}
        <div className="scene-status"><span>White down · green front at reset</span><span>{active ? `Turning ${active.token}` : moving ? 'Preparing moves…' : `${cursor} accepted ${cursor === 1 ? 'move' : 'moves'}`}</span></div>
      </section>
      <section className="panel learn-playback" aria-label="Guided example controls"><p className="eyebrow">THE PREPARED EXAMPLE</p><h3>One move at a time.</h3><p>Read left to right. These moves solve this exact case; use the decision rules above for other cases.</p>
        <div className="learn-algorithm" aria-label="Example algorithm">{tokens.map((token, i) => <span key={i} className={mode === 'example' && i < cursor ? 'done' : mode === 'example' && i === cursor ? 'next' : ''} aria-current={mode === 'example' && i === cursor ? 'step' : undefined}>{token}</span>)}</div>
        <div className="learn-button-row"><button className="primary-button" disabled={busy} onClick={demo}><Play size={15} aria-hidden="true" />Watch example</button><button className="secondary-button" disabled={busy || (mode === 'example' && cursor >= tokens.length)} onClick={stepExample}>Next example move<ChevronRight size={15} aria-hidden="true" /></button></div>
        <div className="learn-button-row"><button className="secondary-button" disabled={checking || view.loading || (!view.pending && !view.playing)} onClick={() => view.paused ? controller.resume() : controller.pause()}>{view.paused ? <Play size={14} aria-hidden="true" /> : <Pause size={14} aria-hidden="true" />}{view.paused ? 'Resume' : 'Pause'}</button><button className="secondary-button" disabled={busy || !cursor} onClick={controller.back}><ChevronLeft size={14} aria-hidden="true" />Undo one</button><button className="secondary-button" disabled={busy || cursor >= history.length} onClick={controller.forward}>Redo one<ChevronRight size={14} aria-hidden="true" /></button></div>
        <label className="learn-speed">Turn duration<select value={duration} onChange={e => setDuration(Number(e.target.value))}><option value={1.2}>Extra slow · 1.2 seconds</option><option value={0.65}>Slow · 0.65 seconds</option><option value={0.3}>Comfortable · 0.3 seconds</option></select></label>
        <p className="learn-example-note">{mode === 'example' ? 'Watching does not complete a lesson. Reset below, make your own moves, then check your objective.' : 'You can watch as often as you like. A practice check accepts any sequence that reaches the objective.'}</p>
        <button className="learn-repeat secondary-button" disabled={checking || view.loading} onClick={reset}><RefreshCw size={15} aria-hidden="true" />Reset for my practice</button>
      </section>
    </div>
    <section className="panel learn-moves" aria-labelledby="learn-moves-title"><div className="learn-section-heading"><div><p className="eyebrow">YOUR TURN</p><h3 id="learn-moves-title">Try the same starting case.</h3></div><span>Prime = reverse · 2 = half turn</span></div><MoveGrid disabled={manualDisabled} onMove={apply} />
      <form className="learn-entry" onSubmit={e => { e.preventDefault(); if (notation.trim()) apply(notation) }}><label htmlFor="learn-notation">Or enter your own moves<input id="learn-notation" value={notation} disabled={manualDisabled} onChange={e => setNotation(e.target.value)} placeholder="For example: R U R' U'" autoComplete="off" spellCheck={false} /></label><button className="secondary-button" disabled={manualDisabled || !notation.trim()}>Apply my moves<ArrowRight size={14} aria-hidden="true" /></button></form>
      <div className="learn-attempt"><strong>Your accepted moves</strong><p aria-label="Your practice move sequence">{mode === 'example' ? 'Example playback — reset to start your own attempt.' : history.slice(0, cursor).map(s => s.token).join(' ') || 'No moves yet. Start with the controls above.'}</p></div>
      <div className="learn-button-row"><button className="primary-button" disabled={busy || mode === 'example' || !cursor} onClick={() => void verify()}><Check size={16} aria-hidden="true" />{checking ? 'Checking with the engine…' : 'Check my objective'}</button>{passed && hasNext && <button className="secondary-button" onClick={onNext}>Continue to next lesson<ArrowRight size={15} aria-hidden="true" /></button>}</div>
      {feedback && <p className={`learn-feedback ${passed ? 'success' : ''}`} role="status">{feedback}</p>}{view.error && <p className="learn-feedback" role="alert">{view.error}</p>}
    </section>
    <details className="learn-keyboard"><summary>Prefer a keyboard? Open the shared cube controls.</summary><KeyboardControls disabled={manualDisabled} onMove={apply} onUndo={controller.back} onRedo={controller.forward} /></details>
  </>
}

export function BeginnerAcademy() {
  const [selected, setSelected] = useState('foundations'), [completed, setCompleted] = useState(readProgress), [item, setItem] = useState<BeginnerLesson>(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  const guide = curriculum.find(g => g.id === selected)!, index = curriculum.indexOf(guide)
  useEffect(() => {
    const task = new AbortController()
    void loadLesson(selected, task.signal).then(data => { if (!task.signal.aborted) setItem(data) }).catch(e => { if (!task.signal.aborted) setError(e.message) })
    return () => task.abort()
  }, [selected, revision])
  const choose = (id: string) => { if (id === selected) return; setItem(undefined); setError(''); setSelected(id) }
  const complete = (id: string) => { setCompleted(old => { const next = [...new Set([...old, id])]; try { localStorage.setItem(progressKey, JSON.stringify(next)) } catch { /* In-memory progress remains usable when storage is unavailable. */ } return next }) }
  return <div className="beginner-academy">
    <div className="page-heading"><p className="eyebrow">YOUR FIRST SOLVE STARTS HERE</p><h1 id="page-title">Learn to Solve</h1><p className="explorer-subtitle">From your first turn to six solid faces. No experience needed.</p></div>
    <section className="learn-hero"><div><span className="learn-hero-label"><GraduationCap size={17} aria-hidden="true" />THE BEGINNER PATH</span><h2>Small steps.<br /><span>A whole new skill.</span></h2><p>Learn a layer at a time. Understand what to look for, watch a verified example, then try it with your own hands.</p><div className="learn-hero-meta"><span><BookOpen size={14} aria-hidden="true" />9 bite-size lessons</span><span>No timer. Take your time.</span></div></div><div className="learn-progress"><span className="learn-progress-number">{completed.length}<small>/ {curriculum.length}</small></span><strong>practice objectives verified</strong><progress value={completed.length} max={curriculum.length} aria-label="Beginner course progress" /><p>Saved in this browser. Watching examples does not count as practice.</p>{completed.length === curriculum.length && <span className="learn-complete"><CircleCheck size={16} aria-hidden="true" />All course exercises verified</span>}</div></section>
    <div className="learn-scope"><strong>Use a real cube, the virtual cube, or both.</strong><p>The instructions explain how to approach a scrambled 3×3. Each interactive exercise is one prepared case in a connected worked solve, not an automatic solver for every possible case. Physical-cube checkpoints are yours to inspect; the engine verifies only your virtual practice.</p></div>
    <nav className="learn-path" aria-label="Beginner lessons">{curriculum.map((g, i) => <button key={g.id} className={selected === g.id ? 'selected' : ''} aria-current={selected === g.id ? 'step' : undefined} onClick={() => choose(g.id)}><span className={`learn-step-number ${completed.includes(g.id) ? 'complete' : ''}`}>{completed.includes(g.id) ? <Check size={14} aria-label="Practice verified" /> : String(i + 1).padStart(2, '0')}</span><span><small>{i === 0 ? 'THE BASICS' : i < 3 ? 'WHITE LAYER' : i === 3 ? 'MIDDLE LAYER' : 'YELLOW LAYER'}</small>{g.title}</span></button>)}</nav>
    <div className="learn-current"><span>LESSON {index + 1} OF {curriculum.length}</span><span>{completed.includes(selected) ? 'Previously verified · repeat any time' : 'Ready when you are'}</span></div>
    {error ? <div className="learn-feedback" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => { setError(''); setRevision(v => v + 1) }}>Retry lesson</button></div> : item?.id === selected ? <LessonWorkspace key={`${selected}-${revision}`} item={item} guide={guide} onComplete={complete} onNext={() => choose(curriculum[index + 1].id)} hasNext={index < curriculum.length - 1} /> : <p className="learn-loading" role="status">Preparing the engine-verified example…</p>}
    <section className="learn-next-tools"><div><ScanLine size={23} aria-hidden="true" /><h3>Bring your own cube.</h3><p>Enter its stickers with Guided Scan, confirm all six faces, and validate its state. Camera assistance is experimental and still needs your review.</p><Link to="/scan">Open Guided Scan<ArrowRight size={14} aria-hidden="true" /></Link></div><div><Compass size={23} aria-hidden="true" /><h3>Explore a different case.</h3><p>Use Cube Explorer for a freely scrambled cube, move-by-move playback, and verified solver hints. Those hints can use a different method from this course.</p><Link to="/cube-explorer">Open Cube Explorer<ArrowRight size={14} aria-hidden="true" /></Link></div></section>
    <details className="learn-sources"><summary>About this course and further learning</summary><p>CubeCue authors these lessons and constructs each practice case with the canonical cube engine. The fixed examples connect stage by stage; each practice begins from its own stage’s starting state. Successful checks verify the objective and earlier-layer requirements, not the exact move spelling. Preservation is checked after a complete attempt; algorithms can temporarily disrupt earlier layers.</p><p>For additional demonstrations, see <a href="https://www.cubeskills.com/tutorials/the-beginners-method-for-solving-the-rubiks-cube/introduction" target="_blank" rel="noreferrer">CubeSkills: Beginner’s Method</a> and the <a href="https://rubiks.com/solve-guide" target="_blank" rel="noreferrer">official Rubik’s solve guide</a>. Their stage order or algorithms may differ. No video watching, physical-cube completion, execution speed, or camera recognition is inferred from your practice progress.</p></details>
  </div>
}
