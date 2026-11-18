import { ArrowLeft, ArrowRight, CircleDashed } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { plannedPages } from './navigation'

export function PlannedPage({ page }: { page: (typeof plannedPages)[number] }) {
  const Icon = page.icon
  return (
    <>
      <div className="page-heading"><p className="eyebrow">{page.category}</p><h1 id="page-title">{page.title}</h1></div>
      <section className="feature-intro"><h2>{page.headline}</h2><p>{page.description}</p></section>
      <section className="planned-panel panel" aria-labelledby="feature-status">
        <div className="planned-symbol"><Icon size={37} strokeWidth={1.2} aria-hidden="true" /></div>
        <span className="planned-badge"><CircleDashed size={12} aria-hidden="true" /> PLANNED FEATURE</span>
        <h2 id="feature-status">Not implemented yet</h2>
        <p className="planned-description">{page.dependency} This page is a preview of the planned workflow; it does not process cube states or record practice.</p>
        <div className="planned-capabilities"><p className="eyebrow">WHAT’S PLANNED</p><ul>{page.capabilities.map((item) => <li key={item}><CircleDashed size={15} aria-hidden="true" />{item}</li>)}</ul></div>
        <p className="milestone-note">{page.milestone}</p>
        <div className="planned-actions"><Link to="/" className="secondary-button"><ArrowLeft size={15} aria-hidden="true" /> Back to Dashboard</Link><Link className="quiet-link" to={page.next}>{page.nextLabel} <ArrowRight size={15} aria-hidden="true" /></Link></div>
      </section>
    </>
  )
}
