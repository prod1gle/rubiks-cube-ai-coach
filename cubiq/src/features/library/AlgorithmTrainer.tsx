import { useEffect, useRef, useState } from 'react'
import { library, loadTraining } from '../../api/library'
import type { TrainingCase, TrainingRow } from '../../api/library'
import { useCube } from '../cube/useCube'
import CubeViewport from '../cube/CubeViewport'

function Practice({ item }: { item: TrainingCase }) {
  const view = useCube(item.start)
  const [notation, setNotation] = useState(''), [revealed, setRevealed] = useState(false), [feedback, setFeedback] = useState(''), [saving, setSaving] = useState(false), [played, setPlayed] = useState(false)
  const attempt = useRef(crypto.randomUUID()), savedWord = useRef<string | undefined>(undefined)
  const busy = view.loading || view.planning || !!view.active || view.pending > 0 || saving
  const reset = () => { void view.controller.restoreSnapshot(item.start); attempt.current = crypto.randomUUID(); savedWord.current = undefined; setFeedback(''); setNotation(''); setPlayed(false) }
  const check = async () => {
    setSaving(true); setFeedback('')
    try {
      const word = view.history.slice(0, view.cursor).map(s => s.token).join(' ')
      if (played) throw new Error('Playback is a demonstration, not a practice attempt. Repeat the case to record your retry.')
      if (savedWord.current !== undefined && savedWord.current !== word) attempt.current = crypto.randomUUID()
      const result = await library<{ success: boolean; metrics: { htm: number } }>('/practice', { id: attempt.current, case_id: item.id, notation: word })
      savedWord.current = word
      setFeedback(`${result.success ? 'Objective achieved' : 'Objective not reached'}. Attempt saved · ${result.metrics.htm} HTM. Execution speed was not measured.`)
    } catch (e) { setFeedback((e as Error).message) } finally { setSaving(false) }
  }
  return <section className="panel library-panel"><p className="eyebrow">{item.stage} · ENGINE VERIFIED</p><h2>{item.id}</h2><p className="analysis-help">White down, green front. Repeat restores the identical state and grip. F2L requires cross and other starting slots preserved; OLL requires orientation and F2L; PLL permits final AUF.</p>{view.snapshot && <CubeViewport snapshot={view.snapshot} active={view.active} duration={0.28} reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false} onFinish={view.controller.finish} />}
    <div className="hint-actions"><button disabled={busy} onClick={reset}>Repeat same case</button><button disabled={busy} onClick={() => { setRevealed(true); setPlayed(true); void view.controller.restoreSnapshot(item.start).then(() => view.controller.enqueue(item.algorithm)) }}>Play verified algorithm</button><button disabled={busy || !view.cursor} onClick={view.controller.back}>Step back</button><button disabled={busy || view.cursor >= view.history.length} onClick={view.controller.forward}>Step forward</button><button onClick={() => setRevealed(v => !v)} aria-expanded={revealed}>{revealed ? 'Hide algorithm' : 'Reveal algorithm'}</button></div>{revealed && <p><code>{item.algorithm}</code></p>}<div className="practice-moves" role="group" aria-label="Trainer moves">{['U', 'R', 'F', 'D', 'L', 'B', 'x', 'y', 'z'].map(m => <button disabled={busy} key={m} onClick={() => view.controller.enqueue(m)}>{m}</button>)}</div>
    <form onSubmit={e => { e.preventDefault(); view.controller.enqueue(notation) }}><label>Your practice notation<input value={notation} maxLength={10000} onChange={e => setNotation(e.target.value)} /></label><div className="hint-actions"><button disabled={busy || !notation.trim()} className="primary-button">Apply practice moves</button><button type="button" disabled={busy || played || !view.cursor} onClick={() => void check()}>Verify and save attempt</button></div></form><p>{view.history.slice(0, view.cursor).map(s => s.token).join(' ') || 'No attempt moves yet.'}</p>{feedback && <p role="status">{feedback}</p>}{view.error && <p role="alert">{view.error}</p>}<p className="analysis-help">{item.scope} Catalog {item.version}. Source: {item.source}</p></section>
}
export function AlgorithmTrainer() {
  const [rows, setRows] = useState<TrainingRow[]>([]), [stage, setStage] = useState('F2L'), [selected, setSelected] = useState(''), [item, setItem] = useState<TrainingCase>(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
  useEffect(() => { const task = new AbortController(); void library<{ cases: TrainingRow[] }>('/training', undefined, 'GET', task.signal).then(v => { if (!Array.isArray(v.cases)) throw new Error('Case catalog unavailable.'); setRows(v.cases); setSelected(v.cases.find(c => c.stage === 'F2L')?.id ?? '') }).catch(e => { if (!task.signal.aborted) setError(e.message) }); return () => task.abort() }, [revision])
  useEffect(() => { if (!selected) return; const task = new AbortController(); void loadTraining(selected, task.signal).then(v => { setItem(v); setError('') }).catch(e => { if (!task.signal.aborted) setError(e.message) }); return () => task.abort() }, [selected, revision])
  return <><div className="page-heading"><p className="eyebrow">RECOGNITION. REPETITION.</p><h1 id="page-title">Algorithm Trainer</h1><p className="explorer-subtitle">Real cases. Repeatable starting states. Engine-verified progress.</p></div><section className="panel library-panel"><label>Stage<select value={stage} onChange={e => { const v = e.target.value; setStage(v); setSelected(rows.find(r => r.stage === v)?.id ?? '') }}>{['F2L', 'OLL', 'PLL'].map(s => <option key={s}>{s}</option>)}</select></label><label>Recognized case<select value={selected} onChange={e => setSelected(e.target.value)}>{rows.filter(r => r.stage === stage).map(r => <option key={r.id}>{r.id}</option>)}</select></label><p className="analysis-help">57 OLL and 21 PLL classes. F2L offers 24 engine-derived insertion cases, with coordinate identifiers; this is a useful subset, not a claim to cover every conventional F2L case.</p></section>{error && <p role="alert">{error}<button onClick={() => setRevision(v => v + 1)}>Retry catalog</button></p>}{!item && !error && <p role="status">Loading verified case…</p>}{item && item.id === selected && <Practice key={item.id} item={item} />}</>
}
