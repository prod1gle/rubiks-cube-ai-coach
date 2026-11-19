import { ArrowRight, ArrowUpRight, BookOpen, Sparkles, Timer } from 'lucide-react'
import { PhysicalHistory } from '../features/timer/PhysicalHistory'
import { Progress } from '../features/library/Progress'
import { Link } from 'react-router-dom'
import { ConnectionCard } from '../components/ConnectionCard'
import type { ConnectionState } from '../api/useHealth'

const workflows = [
  { title: 'Your first solved cube', text: 'Start with the pieces, learn the notation, and practice one layer at a time.', to: '/learn', label: 'Learn to Solve', icon: BookOpen, className: 'blue' },
  { title: 'One place for every solve', text: 'Time your physical cube, record a video, or practice with a verified virtual cube.', to: '/live-solve', label: 'Solve Studio', icon: Timer, className: 'orange' },
  { title: 'Practice with a purpose', text: 'Turn your actual solve data into a focused next step, with optional AI guidance.', to: '/coach', label: 'AI Coach', icon: Sparkles, className: 'sky' },
]

export function Dashboard({ connection, retry }: { connection: ConnectionState; retry: () => void }) {
  return (
    <>
      <div className="page-heading flex items-start justify-between gap-4">
        <div><p className="eyebrow">YOUR PERSONAL CUBE LAB</p><h1 id="page-title">Dashboard</h1></div>

      </div>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">

          <h2 id="hero-title">Practice your next<br /><span>3×3 solve.</span></h2>
          <p>Learn your first solution, find your rhythm,<br className="desktop-break" /> and make every practice session count.</p>
          <Link className="primary-button" to="/live-solve">Start a solve <ArrowRight size={16} aria-hidden="true" /></Link>
          <p className="hero-note">New to cubing? <Link to="/learn" className="underline">Learn your first solve</Link>.</p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-cross cross-one">+</div><div className="art-cross cross-two">+</div>
          <div className="cube-illustration">
            <div className="cube-face face-top">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
            <div className="cube-face face-front">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
            <div className="cube-face face-right">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
          </div>
          <span className="art-caption">CUBECUE / DESIGN ILLUSTRATION</span>
        </div>
      </section>

      <section className="workflow-section" aria-labelledby="workflows-title">
        <div className="section-heading"><h2 id="workflows-title">Where are you in your cubing journey?</h2><span>EXPLORE YOUR WORKSPACE</span></div>
        <div className="workflow-grid">
          {workflows.map(({ title, text, to, label, icon: Icon, className }) => (
            <Link to={to} className="workflow-card" key={to} aria-label={`Open ${label}`}>
              <div className="flex items-start justify-between"><span className={`icon-tile ${className}`}><Icon size={22} strokeWidth={1.5} /></span><ArrowUpRight size={17} className="card-arrow" aria-hidden="true" /></div>
              <h3>{title}</h3><p>{text}</p>
              <div className="workflow-bottom"><span>{label}</span></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="practice-toolkit panel" aria-label="Speedcubing tools">
        <div><p className="eyebrow">KEEP GOING</p><h2>Speedcubing tools</h2><p>Explore a state, rehearse an algorithm, or replay a recorded solve.</p></div>
        <div className="toolkit-links"><Link to="/cube-explorer">Cube Explorer <ArrowUpRight size={15} /></Link><Link to="/algorithm-trainer">Algorithm Trainer <ArrowUpRight size={15} /></Link><Link to="/solve-analysis">Solve Analysis <ArrowUpRight size={15} /></Link><Link to="/scan">Guided Scan <ArrowUpRight size={15} /></Link></div>
      </section>
      <Progress />
      <PhysicalHistory compact />
      <div className="mt-6">
        <ConnectionCard connection={connection} retry={retry} />

      </div>
    </>
  )
}
