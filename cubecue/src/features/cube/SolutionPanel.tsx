import { useState } from 'react'
import { ChevronFirst, ChevronLeft, ChevronRight, Layers, LoaderCircle, Pause, Play, ShieldCheck, Sparkles } from 'lucide-react'
import type { CubeController, ExplorerState } from './CubeController'
import type { CFOPStage } from '../../api/cube'

function title(stage: CFOPStage) {
  return stage.kind === 'f2l' ? `F2L ${stage.slot}` : stage.kind === 'cross' ? 'Cross' : stage.kind.toUpperCase()
}

export function SolutionPanel({ view }: { view: ExplorerState & { controller: CubeController } }) {
  const { active, loading, planning, pending, cursor, paused, playing, solving, solution, solutionStart, controller } = view
  const [approach, setApproach] = useState<'short' | 'cfop'>('short')
  const working = !!active || planning || pending > 0
  const blocked = loading || working || solving
  const position = solutionStart === undefined ? 0 : cursor - solutionStart
  const inSolution = !!solution && solutionStart !== undefined && position >= 0 && position <= solution.plan.steps.length
  const cfop = solution?.method === 'cfop'
  const tokens = solution && <ol className="solution-tokens" aria-label="Computed solution">{solution.plan.steps.map((step, index) => <li key={index} className={inSolution && index < position ? 'applied' : ''} aria-current={inSolution && index === position - 1 ? 'step' : undefined}><span>{step.token}</span><small>{index + 1}</small></li>)}</ol>
  return <section className="panel solution-panel" aria-labelledby="solution-title" aria-busy={solving}>
    <div className="solution-heading"><div><p className="eyebrow">A PATH TO SOLVED</p><h2 id="solution-title">Find a solution.</h2><p>{approach === 'cfop' ? 'Cross. Four pairs. OLL. PLL. A verified plan with a purpose for every step.' : 'Kociemba two-phase search, checked against your exact cube state.'}</p></div><button className="primary-button" disabled={blocked || (playing && !paused)} onClick={() => void controller.solve(approach)}>{solving ? <LoaderCircle className="solver-spinner" size={16} aria-hidden="true" /> : approach === 'cfop' ? <Layers size={16} aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}{solving ? 'Finding a solution…' : 'Solve cube'}</button></div>
    <div className="solution-approach" role="group" aria-label="Solving approach"><button aria-pressed={approach === 'short'} disabled={solving} onClick={() => setApproach('short')}>Short solution</button><button aria-pressed={approach === 'cfop'} disabled={solving} onClick={() => setApproach('cfop')}><Layers size={13} aria-hidden="true" />CFOP</button><span>Two independent approaches. Every result engine verified.</span></div>
    {solving && <div className="solution-loading" role="status"><span>{approach === 'cfop' ? 'Computing CFOP locally: Cross search, pair insertions, OLL, PLL and AUF. The worker has a 30-second budget.' : 'Searching locally. The first solve also builds cached tables; the worker has a 30-second budget.'}</span><button className="secondary-button" onClick={controller.cancelSolve}>Cancel solve</button></div>}
    {solution ? <>
      <div className="solution-metadata"><span className="solution-verified"><ShieldCheck size={14} aria-hidden="true" />Engine verified</span><span>{cfop ? 'CFOP solution · optimality unproven' : 'Short solution · optimality unproven'}</span><span>{solution.move_count} HTM</span><span>{(solution.elapsed_ms / 1000).toFixed(3)} s computation</span></div>
      {(cfop ? 'cfop' : 'short') !== approach && <p className="solution-note">Showing the previous {cfop ? 'CFOP' : 'short'} solution. Choose Solve cube to compute the selected approach.</p>}
      {cfop && solution.stages && <>
        <p className="cfop-reference">White cross down · green front. All playback moves are translated to your current grip.</p>
        <ol className="cfop-stages" aria-label="CFOP stages">{solution.stages.map((stage, index) => {
          const current = inSolution && position >= stage.start_step && position < stage.end_step
          const done = inSolution && position >= stage.end_step
          return <li key={stage.id} aria-current={current ? 'step' : undefined} className={done ? 'completed' : ''}>
            <div className="cfop-stage-heading"><span className="cfop-stage-dot" aria-hidden="true">{done ? '✓' : index + 1}</span><h3>{title(stage)}</h3><span className="cfop-case">{stage.case_id}</span><span className="cfop-stage-count">{stage.move_count} HTM</span><button className="cfop-stage-play" aria-label={`Play ${title(stage)} stage`} disabled={blocked || stage.status === 'skipped'} onClick={() => controller.playStage(stage.id)}><Play size={13} aria-hidden="true" /></button></div>
            <p className="cfop-stage-notation">{stage.notation || 'Skipped · goal already satisfied at this boundary.'}</p>
            {stage.kind === 'f2l' && stage.protected_pairs.length > 0 && stage.status !== 'skipped' && <small className="cfop-protected">Protects {stage.protected_pairs.join(', ')} at insertion boundaries.</small>}
          </li>
        })}</ol>
        <p className="solution-note">Pair order is chosen from the current state. Cross and completed pairs are protected at insertion boundaries; individual turns can temporarily disturb them. Full OLL (57) and PLL (21) recognition includes skips and U setups; final AUF is separate.</p>
      </>}
      {solution.plan.steps.length ? <>
        {cfop ? <details className="cfop-full-sequence"><summary>Full move sequence · {solution.plan.steps.length} actions</summary>{tokens}</details> : tokens}
        <div className="solution-playback"><div className="playback-buttons"><button aria-label="Go to solution start" disabled={blocked} onClick={controller.solutionStart}><ChevronFirst size={17} /></button><button aria-label="Previous solution move" disabled={blocked || !inSolution || position === 0} onClick={controller.back}><ChevronLeft size={18} /></button><button className="play-toggle" aria-label={playing && !paused ? 'Pause solution' : 'Play solution'} disabled={loading || solving || (!!active && !playing) || planning || pending > 0} onClick={playing && !paused ? controller.pause : controller.playSolution}>{playing && !paused ? <Pause size={17} /> : <Play size={17} />}</button><button aria-label="Next solution move" disabled={blocked || !inSolution || position === solution.plan.steps.length} onClick={controller.forward}><ChevronRight size={18} /></button></div><span role="status">{inSolution ? `Solution step ${position} of ${solution.plan.steps.length}${position === solution.plan.steps.length ? ' · Solved' : ''}` : 'Return to the solution start to practice this state.'}</span></div>
      </> : <p className="solution-empty">This cube is already solved. No face turns are needed.</p>}
      <p className="solution-note">{cfop ? 'Each stage and its protected goals were verified with the cube engine. This is a strict CFOP plan; it is not optimized for global move count or human execution speed.' : 'Verified to solve this state. This search does not prove a global minimum or a distance from optimum.'} <span>Metric: {solution.metric} · {solution.solver.name} {solution.solver.version}</span></p>
    </> : !solving && <p className="solution-note">Solve displays a plan before making any moves. Step through it or play it at your chosen speed.{approach === 'cfop' && ' CFOP uses a fixed white cross, protects completed pairs, and recognizes the full last-layer case sets.'}</p>}
  </section>
}
