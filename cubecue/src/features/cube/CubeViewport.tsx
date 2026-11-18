import { Component, Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Maximize, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react'
import type { CubeSnapshot } from '../../api/cube'
import type { ActiveTurn } from './CubeController'
import type { CameraCommand } from './CubeScene'
import { FaceletNet } from './FaceletNet'

const Scene = lazy(() => import('./CubeScene'))
class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onFailure() }
  render() { return this.state.failed ? null : this.props.children }
}

export default function CubeViewport({ snapshot, active, duration, reducedMotion, onFinish, highlighted = [] }: {
  snapshot: CubeSnapshot; active?: ActiveTurn; duration: number; reducedMotion: boolean; onFinish: (id: string) => void; highlighted?: string[]
}) {
  const [failed, setFailed] = useState(() => typeof WebGL2RenderingContext === 'undefined')
  const [command, setCommand] = useState<CameraCommand>({ id: 0, type: 'reset' })
  const onFailure = useCallback(() => setFailed(true), [])
  useEffect(() => {
    if ((failed || reducedMotion) && active) queueMicrotask(() => onFinish(active.id))
  }, [failed, reducedMotion, active, onFinish])
  const camera = (type: CameraCommand['type']) => setCommand(previous => ({ id: previous.id + 1, type }))
  return <div className={`cube-viewport ${failed ? 'graphics-fallback' : ''}`}>
    <div className="viewport-label"><span className="local-dot" />{failed ? '2D FALLBACK' : 'LIVE 3D VIEW'}<span>{snapshot.cubies.length} cubies · 54 stickers</span></div>
    {failed ? <div className="graphics-message"><p role="status">3D graphics are unavailable. The exact 2D view and move controls still work.</p><button className="text-button" onClick={() => setFailed(false)}>Retry 3D</button><FaceletNet snapshot={snapshot} /></div>
      : <SceneBoundary onFailure={onFailure}><Suspense fallback={<div className="scene-loading" role="status">Preparing your 3D cube…</div>}><Scene snapshot={snapshot} active={reducedMotion ? undefined : active} duration={duration} cameraCommand={command} onFinish={onFinish} onFailure={onFailure} highlighted={highlighted} /></Suspense></SceneBoundary>}
    {highlighted.length > 0 && <p className="cube-highlight-note" role="status">{highlighted.length} target cubies outlined · orbit to inspect hidden stickers.</p>}
    <div className="viewport-toolbar"><span>{failed ? 'Engine-verified stickers' : 'Drag / arrow keys to orbit · Scroll to zoom'}</span><div>
      <button aria-label="Orbit left" title="Orbit left (cube state unchanged)" onClick={() => camera('left')} disabled={failed}><RotateCcw size={14} /></button>
      <button aria-label="Orbit right" title="Orbit right (cube state unchanged)" onClick={() => camera('right')} disabled={failed}><RotateCw size={14} /></button>
      <button aria-label="Zoom out" title="Zoom out" onClick={() => camera('out')} disabled={failed}><Minus size={15} /></button>
      <button aria-label="Zoom in" title="Zoom in" onClick={() => camera('in')} disabled={failed}><Plus size={15} /></button>
      <button aria-label="Reset camera" title="Reset camera (cube state unchanged)" onClick={() => camera('reset')} disabled={failed}><Maximize size={15} /></button>
    </div></div>
  </div>
}
