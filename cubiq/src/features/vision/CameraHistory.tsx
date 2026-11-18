import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { library } from '../../api/library'
export function CameraHistory() {
  const [rows, setRows] = useState<{ id: string; created_at: string; revision: number; needs_sync: boolean; stopped: boolean }[]>(), [error, setError] = useState('')
  useEffect(() => { const task = new AbortController(); void library<{ items: NonNullable<typeof rows> }>('/tracking', undefined, 'GET', task.signal).then(v => { if (!task.signal.aborted && Array.isArray(v.items)) setRows(v.items) }).catch(e => { if (!task.signal.aborted) setError(e.message) }); return () => task.abort() }, [])
  return <section className="panel library-panel"><h2>Camera-assisted sessions</h2><p className="analysis-help">Separate evidence records, excluded from manual performance averages. Physical move completeness and timing remain uncertain.</p>{error && <p role="alert">{error}</p>}{rows?.length === 0 && <p>No camera sessions saved yet.</p>}{rows?.map(row => <article className="camera-segment" key={row.id}><Link to={`/solve-analysis?camera=${row.id}`}>{new Date(row.created_at).toLocaleString()}</Link><p>{row.revision} evidence events · {row.stopped ? 'Ended' : row.needs_sync ? 'Recovery required' : 'Open; verify alignment before resuming'}</p></article>)}</section>
}
