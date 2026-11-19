import './solveStudio.css'
import { useEffect, useState } from 'react'
import { deletePhysicalSolve, formatPhysicalTime, loadPhysicalHistory } from './physicalApi'
import type { PhysicalHistoryData } from './physicalApi'
export function PhysicalHistory({ refresh = 0, compact = false }: { refresh?: number; compact?: boolean }) {
  const [data, setData] = useState<PhysicalHistoryData>()
  const [error, setError] = useState(''), [deleting, setDeleting] = useState(''), [confirm, setConfirm] = useState(''), [version, setVersion] = useState(0)
  useEffect(() => { const abort = new AbortController(); void loadPhysicalHistory(abort.signal).then(setData).catch(e => { if (!abort.signal.aborted) setError(e.message) }); return () => abort.abort() }, [refresh, version])
  return <section className="panel studio-history" aria-label="Physical solve history"><div className="studio-card-title"><h2>{compact ? 'Physical practice' : 'Your physical practice'}</h2><span className="studio-local">ON THIS DEVICE</span></div>
    {error && <p role="alert">{error} <button onClick={() => { setError(''); setVersion(v => v + 1) }}>Retry physical history</button></p>}
    {!data && !error && <p role="status">Loading physical practice…</p>}
    {data && <><div className="studio-stat-grid"><div><strong>{formatPhysicalTime(data.personal_best_ms)}</strong><span>Practice best</span></div><div><strong>{formatPhysicalTime(data.mean_ms)}</strong><span>Arithmetic mean</span></div><div><strong>{data.sample_count}</strong><span>Eligible / {data.total} records</span></div></div><p className="analysis-help">{data.scope}</p>
      {!compact && (data.items.length ? <div className="studio-history-scroll"><table><thead><tr><th>Recorded</th><th>Time</th><th>Result</th><th>Action</th></tr></thead><tbody>{data.items.slice(0, 20).map(r => <tr key={r.id}><td>{new Date(r.created_at).toLocaleString()}</td><td>{formatPhysicalTime(r.elapsed_ms)}</td><td>{r.status === 'interrupted' ? 'Interrupted' : r.timing_integrity === 'uncertain' ? 'Timing uncertain' : 'Self-timed · unverified'}</td><td>{confirm === r.id ? <span><button disabled={!!deleting} onClick={() => { setDeleting(r.id); void deletePhysicalSolve(r.id).then(() => { setVersion(v => v + 1); setConfirm('') }).catch(e => setError(e.message)).finally(() => setDeleting('')) }}>Confirm delete</button> <button onClick={() => setConfirm('')}>Keep</button></span> : <button onClick={() => setConfirm(r.id)}>Delete</button>}</td></tr>)}</tbody></table></div> : <p className="analysis-help">Your first physical solve starts here. No sample results are added.</p>)}</>}
  </section>
}
