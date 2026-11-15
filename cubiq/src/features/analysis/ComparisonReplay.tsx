import { useEffect, useState, useSyncExternalStore } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { ComparisonBranch, CubeSnapshot } from '../../api/cube'
import CubeViewport from '../cube/CubeViewport'
import { ReplayController } from './ReplayController'

export function ComparisonReplay({ start, actual, alternative }: { start: CubeSnapshot; actual: ComparisonBranch; alternative: ComparisonBranch }) {
  const [controller] = useState(() => new ReplayController(start, actual.plan, alternative.plan))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const [duration, setDuration] = useState(0.28)
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  useEffect(() => { const media = window.matchMedia?.('(prefers-reduced-motion: reduce)'); const update = () => setReduced(media?.matches ?? false); media?.addEventListener('change', update); return () => { media?.removeEventListener('change', update); controller.dispose() } }, [controller])
  const active = !!state.leftTurn || !!state.rightTurn
  return <section className="comparison-replay" aria-label="Synchronized comparison replay">
    <div className="comparison-cubes">{([
      ['Actual moves', actual, state.left, state.leftTurn], ['Verified alternative', alternative, state.right, state.rightTurn],
    ] as const).map(([title, branch, snapshot, turn]) => <section className="panel comparison-cube" aria-label={title} key={title}><div className="comparison-cube-header"><h3>{title}</h3><span>{branch.metrics.htm} HTM · {branch.metrics.rotations} rotations</span></div><CubeViewport snapshot={snapshot} active={turn} onFinish={controller.finish} duration={duration} reducedMotion={reduced} /><code className="comparison-notation" aria-label={`${title} notation`}>{branch.notation || 'No moves needed'}</code><p className="comparison-position">Applied {Math.min(state.cursor, branch.plan.steps.length)} / {branch.plan.steps.length} actions · {branch.plan.steps.slice(0, state.cursor).reduce((n, s) => n + s.htm, 0)} HTM · grip {snapshot.state.frame}</p><span className="sr-only" data-testid={title === 'Actual moves' ? 'actual-hash' : 'alternative-hash'}>{snapshot.state_hash}</span></section>)}</div>
    <div className="comparison-controls"><button aria-label="Comparison start" disabled={active || !state.cursor} onClick={() => controller.seek(0)}><ChevronFirst size={18} /></button><button aria-label="Comparison previous step" disabled={active || !state.cursor} onClick={() => { controller.pause(); controller.step(-1) }}><ChevronLeft size={18} /></button><button aria-label={state.playing ? 'Pause comparison' : 'Play comparison'} disabled={!controller.length} onClick={state.playing ? controller.pause : controller.play}>{state.playing ? <Pause size={18} /> : <Play size={18} />}</button><button aria-label="Comparison next step" disabled={active || state.cursor === controller.length} onClick={() => { controller.pause(); controller.step(1) }}><ChevronRight size={18} /></button><button aria-label="Comparison end" disabled={active || state.cursor === controller.length} onClick={() => controller.seek(controller.length)}><ChevronLast size={18} /></button><label>Replay step<input aria-label="Comparison replay step" type="range" min={0} max={controller.length || 1} value={state.cursor} disabled={active || !controller.length} onChange={e => controller.seek(Number(e.target.value))} /></label><output aria-live="polite">{state.cursor} / {controller.length}</output><label>Animation speed<select value={duration} onChange={e => setDuration(Number(e.target.value))}><option value={0.16}>Quick</option><option value={0.28}>Smooth</option><option value={0.5}>Study</option></select></label></div>
    <p className="analysis-help">Synchronized by action index. The shorter branch holds its endpoint. Animation speed is a simulation, not physical execution time. Each cube can be orbited and zoomed independently.</p>
  </section>
}
