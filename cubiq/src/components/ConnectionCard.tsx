import { ArrowUpRight, RefreshCw, Server } from 'lucide-react'
import type { ConnectionState } from '../api/useHealth'

export function ConnectionCard({ connection, retry }: { connection: ConnectionState; retry: () => void }) {
  const checking = connection.status === 'checking'
  return (
    <section className="panel connection-card" aria-labelledby="connection-title">
      <div className="flex items-center justify-between gap-4">
        <span className="eyebrow">LOCAL WORKSPACE</span>
        <Server size={17} className="muted" aria-hidden="true" />
      </div>
      <h2 id="connection-title">A foundation you can inspect.</h2>
      <p className="muted text-sm leading-6">Your frontend runs locally. Check the API connection to see what’s actually available.</p>
      <div className={`connection-result ${connection.status}`} role="status">
        <span className="status-dot" />
        <div>
          <strong>{checking ? 'Checking local API…' : connection.status === 'connected' ? 'Local API reachable' : 'Local API unavailable'}</strong>
          <span>{connection.status === 'connected'
            ? `v${connection.data.version} · Last checked ${connection.checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : connection.status === 'unavailable' ? 'Start the backend, then check again.' : 'Requesting /api/health'}</span>
        </div>
      </div>
      {connection.status === 'unavailable' && <p className="connection-error">{connection.message}</p>}
      <div className="flex flex-wrap items-center gap-5">
        <button className="text-button" onClick={retry} disabled={checking}>
          <RefreshCw size={14} className={checking ? 'spinning' : ''} aria-hidden="true" />
          Check connection
        </button>
        <a className="quiet-link" href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer">API docs <ArrowUpRight size={13} aria-hidden="true" /></a>
      </div>
    </section>
  )
}
