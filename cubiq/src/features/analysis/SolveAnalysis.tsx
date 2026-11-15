import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AnalysisRequest, ComparisonReply } from '../../api/cube'
import { compareSegment, getCube } from '../../api/cube'
import { readRecording } from './recording'
import { ComparisonReplay } from './ComparisonReplay'
import { CasePractice } from './CasePractice'

const difference = (n: number, unit: string) => n > 0 ? `${n} fewer ${unit}` : n < 0 ? `${-n} more ${unit}` : `Same ${unit}`
export function SolveAnalysis() {
  const [source] = useState(readRecording)
  const [input, setInput] = useState<AnalysisRequest>(() => ({ facelets: source?.facelets ?? '', sequence: source?.sequence ?? '', expected_end_hash: source?.expected_end_hash, start: 0, end: source?.sequence.trim() ? source.sequence.trim().split(/\s+/).length : 1, objective: 'cfop', goal: 'auto' }))
  const [reply, setReply] = useState<ComparisonReply>(), [submitted, setSubmitted] = useState<AnalysisRequest>(), [selected, setSelected] = useState(''), [why, setWhy] = useState(false), [practice, setPractice] = useState(false)
  const [loading, setLoading] = useState(false), [error, setError] = useState('')
  const abort = useRef<AbortController | undefined>(undefined)
  useEffect(() => {
    if (source) return
    const task = new AbortController()
    void getCube(task.signal).then(s => { if (!task.signal.aborted) setInput(v => v.facelets ? v : { ...v, facelets: s.facelets }) }).catch(() => { /* Explicit comparison reports any unavailable engine. */ })
    return () => task.abort()
  }, [source])
  useEffect(() => () => abort.current?.abort(), [])
  const change = (patch: Partial<AnalysisRequest>, recordEdit = false) => { setInput(v => ({ ...v, ...patch, ...(recordEdit ? { expected_end_hash: undefined } : {}) })); setReply(undefined); setPractice(false); setError('') }
  const run = async () => {
    abort.current?.abort(); const task = new AbortController(); abort.current = task
    setLoading(true); setError(''); setReply(undefined); setPractice(false); setWhy(false)
    try {
      const result = await compareSegment(input, task.signal)
      if (task.signal.aborted) return
      if (result.record.start !== input.start || result.record.end !== input.end || result.objective !== input.objective || (input.expected_end_hash && result.record.final_hash !== input.expected_end_hash)) throw new Error('The comparison does not match the selected record.')
      setSubmitted({ ...input }); setReply(result); setSelected(result.recommended_id ?? '')
    } catch (e) { if (!task.signal.aborted) setError(e instanceof Error ? e.message : 'Comparison unavailable.') }
    finally { if (!task.signal.aborted) setLoading(false) }
  }
  const candidate = reply?.alternatives.find(c => c.id === selected)
  return <>
    <div className="page-heading"><p className="eyebrow">SAME CASE. A DIFFERENT PATH.</p><h1 id="page-title">Solve Analysis</h1><p className="explorer-subtitle">What could I have done instead?</p></div>
    <section className="panel analysis-record" aria-labelledby="record-title"><h2 id="record-title">Choose a recorded segment</h2><p className="analysis-help">{source ? 'Loaded your applied Cube Explorer history. Unplayed preview moves are excluded.' : 'Bring a sequence from Cube Explorer, or enter a complete known move record and its exact initial state.'} This is untimed review; persistent solve storage and physical move capture are not implemented.</p><Link className="text-button" to="/cube-explorer">Open Cube Explorer</Link>
      <form onSubmit={e => { e.preventDefault(); void run() }}><fieldset disabled={loading}>
        <details><summary>Initial cube state · exact viewed facelets</summary><label>Initial facelets<textarea value={input.facelets} maxLength={10000} rows={2} onChange={e => change({ facelets: e.target.value }, true)} spellCheck={false} /></label><p className="analysis-help">Imported Explorer records retain their initial state and grip. For manual records, enter all 54 URFDLB color identities. Unknown moves or capture gaps cannot be reconstructed.</p></details>
        <label>Recorded move sequence<textarea value={input.sequence} maxLength={10000} rows={3} onChange={e => change({ sequence: e.target.value }, true)} spellCheck={false} placeholder="Enter the actual recorded moves" /></label>
        <div className="analysis-fields"><label>First action<input type="number" min={1} max={1024} required value={input.start + 1} onChange={e => change({ start: Number(e.target.value) - 1 })} /></label><label>Last action (included)<input type="number" min={1} max={1024} required value={input.end} onChange={e => change({ end: Number(e.target.value) })} /></label><label>Comparison objective<select value={input.objective} onChange={e => change({ objective: e.target.value as AnalysisRequest['objective'] })}><option value="fewest">Fewest Moves</option><option value="cfop">CFOP Efficiency</option><option value="training">Training Recommendation</option></select></label><label>Shared goal<select value={input.goal} onChange={e => change({ goal: e.target.value as AnalysisRequest['goal'] })}><option value="auto">Recognize from actual progress</option><option value="position">Exact physical endpoint</option><option value="cross">White Cross</option><option value="f2l">Actual endpoint F2L slots</option><option value="oll">OLL complete</option><option value="pll">PLL complete (AUF allowed)</option><option value="solve">Fully solved</option></select></label></div>
        <p className="analysis-help">Action indices include rotations and double turns as individual actions. Select up to 128 actions from a complete record of up to 1,024. Both branches start before First action.</p><button className="primary-button" disabled={!input.facelets.trim() || !input.sequence.trim()}>{loading ? 'Reconstructing and verifying…' : 'Compare this segment'}</button>
      </fieldset></form>{loading && <button className="text-button" onClick={() => { abort.current?.abort(); setLoading(false); setError('Comparison cancelled. Your record is unchanged.') }}>Cancel comparison</button>}{error && <p className="engine-error" role="alert">{error}</p>}
    </section>
    {reply && <section className="analysis-result" aria-label="Verified segment comparison"><div className="panel comparison-summary"><p className="eyebrow">RECONSTRUCTED. VERIFIED.</p><h2>{reply.goal.description}</h2><p>{reply.scope}</p><p className="analysis-help">Actual segment: {reply.actual.metrics.htm} HTM · {reply.actual.metrics.rotations} rotations · <code>{reply.actual.notation}</code></p><p className="analysis-help">Protected starting slots: {reply.goal.protected_slots.join(', ') || 'none required for this objective'}. {reply.goal.kind === 'position' ? 'Exact physical position comparison allows a different final grip.' : 'CFOP paths preserve solved progress at insertion boundaries; individual turns can temporarily disturb it.'}</p>
      {reply.alternatives.length ? <label>Verified alternative<select value={selected} onChange={e => { setSelected(e.target.value); setPractice(false) }}>{reply.alternatives.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.source} · {c.metrics.htm} HTM · {c.metrics.rotations} rotations{c.id === reply.recommended_id ? ' · Recommended in this pool' : ''}</option>)}</select></label> : <p>No distinct verified alternative found. Your actual segment is still valid for this goal.</p>}
      {candidate && <><div className="comparison-facts"><strong>{difference(reply.actual.metrics.htm - candidate.metrics.htm, 'HTM moves')}</strong><span>{difference(reply.actual.metrics.rotations - candidate.metrics.rotations, 'rotations')}</span><span>{candidate.same_position ? 'Same physical endpoint' : 'Same objective · different remaining state'}{candidate.same_state ? ' and same grip' : ' · ending grip may differ'}</span></div><p className="analysis-help">No execution-speed or seconds-saved estimate. The recommended alternative can be longer than your actual segment when the bounded pool finds no improvement.</p><div className="hint-actions"><button className="secondary-button" onClick={() => setWhy(v => !v)} aria-expanded={why}>Show Me Why</button><button className="primary-button" onClick={() => setPractice(v => !v)} aria-expanded={practice}>Practice This Case</button></div></>}
      {why && candidate && <div className="comparison-why"><h3>What the engine verified</h3><ul>{reply.annotations.map(a => <li key={a}>{a}</li>)}</ul><p>Actual: {reply.actual.metrics.htm} HTM and {reply.actual.metrics.rotations} rotations. Alternative: {candidate.metrics.htm} HTM and {candidate.metrics.rotations} rotations. Both satisfy the objective from the identical start.</p><p>{candidate.staged ? 'This alternative uses the protected CFOP pipeline.' : 'This alternative is endpoint verified; intermediate CFOP progress preservation is not claimed.'}</p><p>{reply.training_policy}. Training ranks protected CFOP candidates by HTM + 2×rotations + 2×B + D + 0.35×F + 0.15×L. Actual coded cost {reply.actual.metrics.comfort_score.toFixed(2)}; alternative {candidate.metrics.comfort_score.toFixed(2)}. These are heuristic points, not seconds. CFOP Efficiency favors staged paths, then HTM/rotations. Fewest Moves compares all generated verified paths by HTM.</p><dl className="comparison-hashes"><dt>Identical starting hash</dt><dd>{reply.start.state_hash}</dd><dt>Actual ending hash</dt><dd>{reply.actual.end.state_hash}</dd><dt>Alternative ending hash</dt><dd>{candidate.end.state_hash}</dd></dl><p>Later recorded moves are not applied to the alternative branch. Different goal endpoints need a separately verified continuation.</p></div>}
      {reply.warnings.map(w => <p className="hint-warning" key={w}>{w}</p>)}
    </div>{candidate && <ComparisonReplay key={`${reply.start.state_hash}:${reply.actual.id}:${candidate.id}`} start={reply.start} actual={reply.actual} alternative={candidate} />}{practice && candidate && submitted && <CasePractice key={`${reply.start.state_hash}:${candidate.id}`} comparison={reply} candidate={candidate} input={submitted} />}
    <details className="panel analysis-endpoints"><summary>Exact reconstructed boundaries</summary><label>Segment starting facelets<textarea readOnly value={reply.start.facelets} /></label><label>Actual segment ending facelets<textarea readOnly value={reply.actual.end.facelets} /></label><p className="analysis-help">Selected actions {reply.record.start + 1}–{reply.record.end} of {reply.record.actions}. Complete record final hash: {reply.record.final_hash}</p></details></section>}
  </>
}
