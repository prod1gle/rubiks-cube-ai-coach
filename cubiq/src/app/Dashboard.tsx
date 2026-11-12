import { ArrowRight, ArrowUpRight, Box, Check, ChartNoAxesCombined, CircleDashed, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ConnectionCard } from '../components/ConnectionCard'
import type { ConnectionState } from '../api/useHealth'

const workflows = [
  { title: 'Understand every turn', text: 'Explore the cube and the ideas behind a solution.', to: '/cube-explorer', label: 'Cube Explorer', icon: Box, className: 'sage' },
  { title: 'Find your rhythm', text: 'A focused workspace for the solves ahead.', to: '/live-solve', label: 'Live Solve', icon: Timer, className: 'sand' },
  { title: 'See what could change', text: 'Revisit each stage. Make your next solve more intentional.', to: '/solve-analysis', label: 'Solve Analysis', icon: ChartNoAxesCombined, className: 'lavender' },
]

export function Dashboard({ connection, retry }: { connection: ConnectionState; retry: () => void }) {
  return (
    <>
      <div className="page-heading flex items-start justify-between gap-4">
        <div><p className="eyebrow">YOUR PERSONAL CUBE LAB</p><h1 id="page-title">Dashboard</h1></div>
        <span className="outline-badge">Interactive cube <span>1C</span></span>
      </div>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <div className="hero-kicker"><span /> A BETTER WAY TO PRACTICE</div>
          <h2 id="hero-title">Every turn.<br /><span>A little better.</span></h2>
          <p>A thoughtful space to understand your cube,<br className="desktop-break" /> build good habits, and find your next breakthrough.</p>
          <Link className="primary-button" to="/cube-explorer">Explore the workspace <ArrowRight size={16} aria-hidden="true" /></Link>
          <p className="hero-note">Your interactive 3D cube is ready. Solvers and coaching come next.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-cross cross-one">+</div><div className="art-cross cross-two">+</div>
          <div className="cube-illustration">
            <div className="cube-face face-top">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
            <div className="cube-face face-front">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
            <div className="cube-face face-right">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
          </div>
          <span className="art-caption">CUBIQ / DESIGN ILLUSTRATION</span>
        </div>
      </section>

      <section className="workflow-section" aria-labelledby="workflows-title">
        <div className="section-heading"><h2 id="workflows-title">Make room for better practice.</h2><span>EXPLORE YOUR WORKSPACE</span></div>
        <div className="workflow-grid">
          {workflows.map(({ title, text, to, label, icon: Icon, className }) => (
            <Link to={to} className="workflow-card" key={to} aria-label={`Open ${label}`}>
              <div className="flex items-start justify-between"><span className={`icon-tile ${className}`}><Icon size={22} strokeWidth={1.5} /></span><ArrowUpRight size={17} className="card-arrow" aria-hidden="true" /></div>
              <h3>{title}</h3><p>{text}</p>
              <div className="workflow-bottom"><span>{label}</span><span className="planned-label">{to === '/cube-explorer' ? '3D available' : 'Planned'}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <div className="dashboard-bottom">
        <ConnectionCard connection={connection} retry={retry} />
        <section className="panel readiness-card" aria-labelledby="readiness-title">
          <div className="flex items-center justify-between"><span className="eyebrow">BUILT WITH INTENTION</span><span className="muted text-xs">MILESTONE 1C</span></div>
          <h2 id="readiness-title">First, a reliable foundation.</h2>
          <ul className="readiness-list">
            <li><span className="ready-icon"><Check size={13} /></span><span>Local application & navigation</span><span className="readiness-status">Available</span></li>
            <li><span className="ready-icon"><Check size={13} /></span><span>Backend health checks</span><span className="readiness-status">Available</span></li>
            <li><span className="ready-icon"><Check size={13} /></span><span>Cube engine & verified moves</span><span className="readiness-status">Available</span></li>
            <li><span className="muted"><CircleDashed size={15} /></span><span>Solve capture & progress analytics</span><span className="muted text-xs">Planned</span></li>
          </ul>
          <div className="honesty-note"><span className="note-mark">↗</span><p>Progress will come from your actual solves.<br />Solve capture and analytics are not implemented yet.</p></div>
        </section>
      </div>
    </>
  )
}
