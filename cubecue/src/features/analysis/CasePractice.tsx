import { useEffect, useRef, useState } from 'react'
import type { AnalysisRequest, ComparisonBranch, ComparisonReply, PracticeReply } from '../../api/cube'
import { library } from '../../api/library'
import { useCube } from '../cube/useCube'
import CubeViewport from '../cube/CubeViewport'

export function CasePractice({ comparison, candidate, input }: { comparison: ComparisonReply; candidate: ComparisonBranch; input: AnalysisRequest }) {
  const { snapshot, active, loading, planning, pending, history, cursor, controller, error: engineError } = useCube(comparison.start)
  const [notation, setNotation] = useState(''), [result, setResult] = useState<PracticeReply>(), [error, setError] = useState(''), [checking, setChecking] = useState(false)
  const attempt = useRef({ id: crypto.randomUUID(), word: '' })
  const abort = useRef<AbortController | undefined>(undefined)
  useEffect(() => () => abort.current?.abort(), [])
  const busy = loading || planning || pending > 0 || !!active || checking
  const current = result?.end.state_hash === snapshot?.state_hash ? result : undefined
  const reset = () => { attempt.current = { id: crypto.randomUUID(), word: '' }; abort.current?.abort(); setChecking(false); setResult(undefined); setError(''); setNotation(''); void controller.restoreSnapshot(comparison.start) }
  const check = async () => {
    abort.current?.abort(); const task = new AbortController(); abort.current = task; setChecking(true); setError('')
    try {
      const word = history.slice(0, cursor).map(s => s.token).join(' ')
      if (word !== attempt.current.word) attempt.current = { id: crypto.randomUUID(), word }
      const reply = await library<PracticeReply>('/practice/segment', { id: attempt.current.id, input: { ...input, attempt: word } }, 'POST', task.signal)
      if (!task.signal.aborted && reply.start_hash === comparison.start.state_hash && reply.end.state_hash === snapshot?.state_hash) setResult(reply)
      else if (!task.signal.aborted) throw new Error('Practice verification does not match the accepted state.')
    } catch (e) { if (!task.signal.aborted) setError(e instanceof Error ? e.message : 'Practice verification failed.') }
    finally { if (!task.signal.aborted) setChecking(false) }
  }
  return <section className="panel case-practice" aria-labelledby="practice-title"><p className="eyebrow">SAME START. ANOTHER TRY.</p><h2 id="practice-title">Practice this case</h2><p className="analysis-help">Loaded the original segment starting state, including its grip. Your recorded sequence stays unchanged. Any sequence that reaches the verified objective is accepted.</p><p>{comparison.goal.description}</p>
    {snapshot && <CubeViewport snapshot={snapshot} active={active} onFinish={controller.finish} duration={0.28} reducedMotion={window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false} />}
    <p className="analysis-help">{history.slice(0, cursor).map(s => s.token).join(' ') || 'No attempt moves yet.'}</p><span className="sr-only" data-testid="practice-hash">{snapshot?.state_hash}</span>
    <div className="practice-moves" role="group" aria-label="Practice face moves">{['U', 'R', 'F', 'D', 'L', 'B', 'x', 'y', 'z'].map(move => <button disabled={busy} key={move} onClick={() => { setResult(undefined); controller.enqueue(move) }}>{move}</button>)}</div>
    <form onSubmit={e => { e.preventDefault(); setResult(undefined); setError(''); controller.enqueue(notation) }}><label>Your retry sequence<textarea value={notation} onChange={e => setNotation(e.target.value)} maxLength={10000} rows={2} placeholder="Enter your moves" /></label><div className="hint-actions"><button className="primary-button" disabled={busy || !notation.trim()}>Apply retry sequence</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void check()}>{checking ? 'Verifying…' : 'Check attempt'}</button><button className="secondary-button" type="button" disabled={checking} onClick={reset}>Reset original case</button></div></form>
    <details><summary>Reveal recommended sequence</summary><code>{candidate.notation || 'No moves needed'}</code></details>
    {current && <p role="status" className={current.success ? 'coach-solved' : 'hint-warning'}>{current.success ? 'Objective achieved. Your retry is engine verified and saved locally.' : 'Objective not reached yet. Keep practicing or reset the original case.'} {current.metrics.htm} HTM · {current.metrics.rotations} rotations. {current.protected_preserved ? 'Protected slots preserved at the endpoint.' : 'A protected slot is not solved at this endpoint.'}</p>}{engineError && <p className="engine-error" role="alert">{engineError}</p>}{error && <p role="alert" className="engine-error">{error}</p>}
  </section>
}
