import { useEffect } from 'react'
import { ArrowLeft, ArrowUpRight, LockKeyhole } from 'lucide-react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { CubeMark } from '../components/CubeMark'
import { useHealth } from '../api/useHealth'
import './workspace.css'
import { Dashboard } from './Dashboard'
import { navigation } from './navigation'
import { AlgorithmTrainer } from '../features/library/AlgorithmTrainer'
import { GuidedScan } from '../features/vision/GuidedScan'
import { History } from '../features/library/History'
import { LiveSolve } from '../features/timer/LiveSolve'
import { SolveAnalysis } from '../features/analysis/SolveAnalysis'
import { CoachPage } from '../features/ai/CoachPage'
import { BeginnerAcademy } from '../features/learn/BeginnerAcademy'
import { CubeExplorer } from '../features/cube/CubeExplorer'

export function App() {
  const { pathname } = useLocation()
  const { connection, retry } = useHealth()
  const currentTitle = navigation.find((item) => item.path === pathname)?.title ?? (pathname === '/scan' ? 'Guided Scan' : 'Page not found')

  useEffect(() => {
    document.title = `${currentTitle} · CubeCue`
    window.scrollTo(0, 0)
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [currentTitle])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="CubeCue home"><span className="brand-mark"><CubeMark /></span><span>cubecue<span className="brand-period">.</span><small>YOUR PERSONAL CUBE LAB</small></span></Link>
        <div className="nav-label eyebrow">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map(({ path, title, icon: Icon }) => <NavLink to={path} end={path === '/'} key={path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={18} strokeWidth={1.7} aria-hidden="true" /><span>{title}</span>{path === '/' && <span className="nav-active-dot" />}</NavLink>)}
        </nav>
        <div className="sidebar-bottom">
          <Link to="/scan" className="sidebar-note block"><span className="tiny-label">PHYSICAL CUBE</span><p>Scan your cube</p><span className="sidebar-release">Capture and verify six faces <ArrowUpRight size={13} aria-hidden="true" /></span></Link>
          <div className="local-label"><LockKeyhole size={12} aria-hidden="true" /><span>Local-first. Yours to explore.</span></div>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span>/</span><strong>{currentTitle}</strong></div><div className="topbar-local"><span className="local-dot" /> RUNNING LOCALLY</div></header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Dashboard connection={connection} retry={retry} />} />
            <Route path="/coach" element={<CoachPage />} />
            <Route path="/learn" element={<BeginnerAcademy />} />
            <Route path="/scan" element={<GuidedScan />} />
            <Route path="/cube-explorer" element={<CubeExplorer />} />
            <Route path="/solve-analysis" element={<SolveAnalysis />} />
            <Route path="/live-solve" element={<LiveSolve />} />
            <Route path="/algorithm-trainer" element={<AlgorithmTrainer />} /><Route path="/history" element={<History />} />
            <Route path="*" element={<section className="not-found panel"><p className="eyebrow">PAGE NOT FOUND</p><h1 id="page-title">A turn off the beaten path.</h1><p>This workspace page doesn’t exist.</p><Link to="/" className="primary-button"><ArrowLeft size={16} aria-hidden="true" /> Return to Dashboard</Link></section>} />
          </Routes>
        </main>
        <footer className="app-footer"><span>CUBECUE <span className="footer-divider">/</span> MORE INTENTIONAL PRACTICE.</span><span>3×3 PRACTICE</span></footer>
      </div>
    </div>
  )
}
